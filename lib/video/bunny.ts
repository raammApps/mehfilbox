import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/http/errors'
import { log } from '@/lib/log'
import {
  TUS_CHUNK_BYTES,
  type AssetStatus,
  type PlaybackTicket,
  type UploadTicket,
  type Usage,
  type VideoProvider,
} from './provider'

const API_BASE = 'https://video.bunnycdn.com/library'
const TUS_ENDPOINT = 'https://video.bunnycdn.com/tusupload'

/** Bunny's numeric status codes, from their Stream API. */
const STATUS_MAP: Record<number, AssetStatus['state']> = {
  0: 'uploading',
  1: 'uploading',
  2: 'processing',
  3: 'processing',
  4: 'ready',
  5: 'failed',
  6: 'processing',
}

export class BunnyProvider implements VideoProvider {
  readonly name = 'bunny'

  private get libraryId(): string {
    return env.BUNNY_LIBRARY_ID!
  }

  private async call<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}/${this.libraryId}${path}`, {
      ...init,
      headers: {
        AccessKey: env.BUNNY_API_KEY!,
        accept: 'application/json',
        'content-type': 'application/json',
        ...init?.headers,
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      log.error('bunny: api call failed', {
        path,
        status: response.status,
        body: body.slice(0, 300),
      })
      throw new ApiError('INTERNAL', `Bunny responded ${response.status}`)
    }

    return (await response.json()) as T
  }

  async createUpload({
    title,
    sizeBytes,
  }: {
    title: string
    sizeBytes: number
  }): Promise<UploadTicket> {
    const video = await this.call<{ guid: string }>('/videos', {
      method: 'POST',
      body: JSON.stringify({ title }),
    })

    // TUS creation is authorised by sha256(libraryId + apiKey + expiry + videoId). Bunny
    // validates it server-side, which is what keeps our API key out of the browser.
    const expire = Math.floor(Date.now() / 1000) + 24 * 60 * 60
    const signature = createHash('sha256')
      .update(`${this.libraryId}${env.BUNNY_API_KEY}${expire}${video.guid}`)
      .digest('hex')

    log.info('bunny: upload created', { providerId: video.guid, sizeBytes })

    return {
      providerId: video.guid,
      tusEndpoint: TUS_ENDPOINT,
      headers: {
        AuthorizationSignature: signature,
        AuthorizationExpire: String(expire),
        VideoId: video.guid,
        LibraryId: this.libraryId,
      },
      chunkSizeBytes: TUS_CHUNK_BYTES,
    }
  }

  async getPlaybackToken({
    providerId,
    scope,
    ttlS,
  }: {
    providerId: string
    scope: { catalogueId: string; titleId: string }
    ttlS: number
  }): Promise<PlaybackTicket> {
    const host = env.BUNNY_CDN_HOSTNAME!
    const expires = Math.floor(Date.now() / 1000) + ttlS

    /**
     * Sign the **directory**, not the manifest.
     *
     * `token = base64url(sha256(securityKey + path + expires))` is Bunny's URL token
     * authentication, and signing `/{guid}/playlist.m3u8` does authorise that one file — which
     * is exactly the trap. HLS immediately fetches `/{guid}/240p/video.m3u8` and the segments
     * beneath it, and those 403 with a file-scoped token. Playback would show the poster, load
     * the manifest, and then die. Signing `/{guid}/` covers the whole rendition tree with one
     * token, and the guid in the path is itself the scope: a token minted for one video cannot
     * authorise another, whatever the caller claims.
     *
     * Verified against the live CDN by `pnpm verify:playback`, which asserts a child playlist
     * as well as the manifest. Do not "simplify" this back to the file path.
     */
    // No extra query parameters on the signed URL: Bunny validates the request as a whole, and
    // an audit tag appended here silently breaks playback. `scope` is enforced where it belongs
    // — the token endpoint only mints a URL after checking this catalogue owns this title.
    void scope

    const query = BunnyProvider.signDirectory(providerId, expires)

    return {
      playbackUrl: `https://${host}/${providerId}/playlist.m3u8${query}`,
      thumbnailsUrl: `https://${host}/${providerId}/seek/seek.vtt${query}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    }
  }

  /**
   * `?token=…&expires=…` authorising everything under `/{providerId}/`.
   * Shared by playback and by poster frames so the two can never drift apart.
   */
  private static signDirectory(providerId: string, expires: number): string {
    const token = createHash('sha256')
      .update(`${env.BUNNY_TOKEN_AUTH_KEY}/${providerId}/${expires}`)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '')
    return `?token=${token}&expires=${expires}`
  }

  async getAssetUrl({
    providerId,
    file,
    ttlS,
  }: {
    providerId: string
    file: string
    ttlS: number
  }): Promise<string> {
    const expires = Math.floor(Date.now() / 1000) + ttlS
    const query = BunnyProvider.signDirectory(providerId, expires)
    return `https://${env.BUNNY_CDN_HOSTNAME}/${providerId}/${file}${query}`
  }

  async getStatus(providerId: string): Promise<AssetStatus> {
    const video = await this.call<{
      status: number
      length: number
      thumbnailCount: number
      thumbnailFileName?: string
      encodeProgress: number
      storageSize?: number
    }>(`/videos/${providerId}`)

    const state = STATUS_MAP[video.status] ?? 'processing'

    return {
      state,
      durationS: video.length > 0 ? Math.round(video.length) : null,
      // The same field `getUsage` reads — one call now answers both questions.
      storageBytes: typeof video.storageSize === 'number' ? video.storageSize : null,
      // Bunny generates evenly spaced stills; the first three are the poster candidates the
      // operator picks from (doc 09 P0-10). File names, not URLs — see AssetStatus.
      posterCandidates:
        state === 'ready'
          ? Array.from(
              { length: Math.min(3, Math.max(video.thumbnailCount, 1)) },
              (_, i) => `thumbnail_${i + 1}.jpg`,
            )
          : [],
      // Null rather than an unsigned URL: only a signed one is fetchable, and the playback
      // ticket already carries a fresh one. Persisting a stale URL here would be a trap.
      thumbnailsUrl: null,
      errorMessage: state === 'failed' ? 'The provider could not encode this file' : null,
    }
  }

  async getDownloadUrl({ providerId, ttlS }: { providerId: string; ttlS: number }) {
    /**
     * The library keeps originals and has MP4 fallback on, both checked against the account API
     * rather than assumed — so `original` is really there, and this is not a claim the marketing
     * page makes and the product cannot honour.
     *
     * `availableResolutions` is asked for anyway, because "keep originals" is a library setting a
     * future operator could turn off, and the honest fallback is the highest rendition with a
     * label that says so. Silence would be worse: a couple would download a 480p file believing it
     * was their wedding as shot.
     */
    const video = await this.call<{ availableResolutions?: string; hasMP4Fallback?: boolean }>(
      `/videos/${providerId}`,
    )

    const url = async (file: string) => this.getAssetUrl({ providerId, file, ttlS })

    // Bunny serves the untouched upload at `/original` when the library keeps it.
    const original = await url('original')
    const head = await fetch(original, { method: 'HEAD' }).catch(() => null)
    if (head?.ok) return { url: original, label: 'original' }

    const ladder = (video.availableResolutions ?? '')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean)
      .sort((a, b) => parseInt(b, 10) - parseInt(a, 10))
    const best = ladder[0]
    if (!best) return null

    return { url: await url(`play_${best}.mp4`), label: best }
  }

  async deleteAsset(providerId: string): Promise<void> {
    await this.call(`/videos/${providerId}`, { method: 'DELETE' })
  }

  async getUsage(providerId: string): Promise<Usage> {
    const video = await this.call<{ storageSize: number }>(`/videos/${providerId}`)
    return { storedGb: video.storageSize / 1024 ** 3, deliveredGb: 0 }
  }

  verifyWebhook(rawBody: string, headers: Headers) {
    /**
     * Bunny signs the **raw** body with HMAC-SHA256, keyed by the library's read-only API key,
     * hex-encoded, in `X-BunnyStream-Signature`.
     *
     * Three things here are easy to get wrong and all fail closed — meaning titles silently
     * never leave `processing` and only the nightly reconciliation rescues them:
     *   · it is HMAC, not sha256(secret + body)
     *   · the key is the read-only key, not the main library key
     *   · the body must be verified exactly as received, never parsed and re-serialised
     */
    const secret = env.BUNNY_WEBHOOK_SECRET
    if (!secret) {
      log.error('bunny webhook: BUNNY_WEBHOOK_SECRET is unset — rejecting', {
        fix: 'set it to the library read-only API key',
      })
      return null
    }

    const provided = headers.get('x-bunnystream-signature') ?? ''
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

    const a = Buffer.from(provided.toLowerCase())
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      // A rejection here is indistinguishable from an attack unless it says what arrived, and
      // this is exactly the failure that cannot be reproduced locally.
      log.warn('bunny webhook: signature mismatch', {
        headersSeen: [...headers.keys()].filter((k) => k.startsWith('x-')).join(','),
        providedLength: provided.length,
      })
      return null
    }

    try {
      const payload = JSON.parse(rawBody) as { VideoGuid?: string }
      return payload.VideoGuid ? { providerId: payload.VideoGuid } : null
    } catch {
      return null
    }
  }
}
