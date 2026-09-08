/**
 * The narrow interface over the video platform (doc 05 §2).
 *
 * Five methods, no provider types leaking past this file. Switching from Bunny to Cloudflare
 * is a new implementation of this interface and one line in `lib/video/index.ts` — the
 * decision in doc 05 is explicitly a default, not a lock-in, and the code should keep it that
 * way.
 */

export type UploadTicket = {
  /** Opaque provider id for the asset — persisted as `titles.provider_id`. */
  providerId: string
  /** TUS endpoint the browser uploads to. Bytes never pass through our server. */
  tusEndpoint: string
  /** Headers the browser must send with the TUS creation request. Short-lived. */
  headers: Record<string, string>
  chunkSizeBytes: number
}

export type PlaybackTicket = {
  playbackUrl: string
  thumbnailsUrl: string | null
  expiresAt: string
}

export type AssetStatus = {
  state: 'uploading' | 'processing' | 'ready' | 'failed'
  durationS: number | null
  /**
   * What the asset actually occupies at the provider, once encoded — the ladder, not the file
   * that was uploaded. Null until the provider knows.
   *
   * This is the number the storage cap is enforced against, because it is the number we are
   * billed for. The size the browser declares at upload is only a pre-flight estimate.
   */
  storageBytes: number | null
  /**
   * Provider-relative file names (`thumbnail_1.jpg`), not URLs.
   *
   * A protected zone only serves signed URLs, and a signed URL expires — so persisting one in
   * `titles.poster_url`, which is embedded in ISR-cached pages and the OG image, produces a
   * poster that works today and 403s later. The app stores a stable route and signs at request
   * time; see `app/api/poster/[titleId]/route.ts`.
   */
  posterCandidates: string[]
  thumbnailsUrl: string | null
  errorMessage: string | null
}

export type Usage = {
  storedGb: number
  deliveredGb: number
}

export interface VideoProvider {
  readonly name: string

  createUpload(input: {
    /** Used only as the provider-side display name; the guest never sees it. */
    title: string
    sizeBytes: number
  }): Promise<UploadTicket>

  /**
   * A short-lived, catalogue+title-scoped playback URL. `scope` is bound into the token so a
   * leaked token for one film cannot fetch another (doc 10 §1 test 7).
   */
  getPlaybackToken(input: {
    providerId: string
    scope: { catalogueId: string; titleId: string }
    ttlS: number
  }): Promise<PlaybackTicket>

  getStatus(providerId: string): Promise<AssetStatus>

  /**
   * A short-lived URL for one file belonging to an asset — a poster frame, the scrub VTT.
   * Separate from `getPlaybackToken` because these are images fetched by the browser directly,
   * not a manifest handed to a player.
   */
  getAssetUrl(input: { providerId: string; file: string; ttlS: number }): Promise<string>

  /**
   * A signed URL for the best downloadable copy of this film, or null if there is not one (N-22).
   *
   * "Best" means the **original** where the provider still holds it, and the highest rendition
   * otherwise — which is the difference between `originals downloadable untouched` on the landing
   * page being true and being marketing. The label says which was handed over, so a couple
   * downloading a 720p fallback is told that is what it is.
   */
  getDownloadUrl(input: {
    providerId: string
    ttlS: number
  }): Promise<{ url: string; label: string } | null>

  deleteAsset(providerId: string): Promise<void>

  getUsage(providerId: string): Promise<Usage>

  /**
   * Verify a webhook's authenticity and say which asset it concerns.
   *
   * Deliberately returns **only the id**, not a state. Bunny's webhook `Status` enum is not the
   * same as the one on the video object (the webhook calls Finished 3, the API calls it 4), and
   * mapping the wrong one silently leaves every title stuck in `processing`. So the webhook is
   * treated as "something changed, go and ask" and `getStatus` remains the single source of
   * truth — which also makes the handler naturally idempotent.
   */
  verifyWebhook(rawBody: string, headers: Headers): { providerId: string } | null
}

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024
export const TUS_CHUNK_BYTES = 5 * 1024 * 1024

export const ACCEPTED_VIDEO_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
] as const

export const ACCEPTED_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v'] as const

/**
 * Container check that runs before a byte moves (doc 05 §3 requirement 5). Browsers report an
 * empty `type` for some containers on Android, so the extension is the authority and the MIME
 * type is corroboration.
 */
export function isAcceptedVideo(filename: string, mimeType?: string): boolean {
  const lower = filename.toLowerCase()
  const extensionOk = ACCEPTED_VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext))
  if (extensionOk) return true
  return !!mimeType && (ACCEPTED_VIDEO_TYPES as readonly string[]).includes(mimeType)
}
