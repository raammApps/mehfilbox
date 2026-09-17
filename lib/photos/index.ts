import { createHash } from 'node:crypto'
import { env } from '@/lib/env'
import type { Photo } from '@/lib/schema'
import { PHOTO_WIDTHS, photoSrcSet } from './srcset'
import { BunnyPhotoProvider } from './bunny'
import { FakePhotoProvider } from './fake'
import type { PhotoProvider } from './provider'

const KEY = Symbol.for('mehfilbox.photoProvider')
type Global = typeof globalThis & { [KEY]?: PhotoProvider }

/** The one switch on photo storage in the codebase. */
export function getPhotoProvider(): PhotoProvider {
  const g = globalThis as Global
  g[KEY] ??= env.PHOTO_DRIVER === 'bunny' ? new BunnyPhotoProvider() : new FakePhotoProvider()
  return g[KEY]
}

/** @knipignore Injection seam for tests, matching `setVideoProvider`, which three test files use. */
export function setPhotoProvider(provider: PhotoProvider): void {
  ;(globalThis as Global)[KEY] = provider
}

/**
 * Where a catalogue's photographs live in the zone.
 *
 * The single place that decides storage layout, so deleting a catalogue can delete a prefix and
 * one catalogue's files can never collide with another's.
 *
 * The width sits in the path — `c/<catalogue>/w2048/<photo>.jpg` — which makes a URL say what
 * it is. That is what lets `photoSrcSet` derive the whole set from the master without a column
 * to record it, and, more importantly, lets it tell a photograph uploaded before renditions
 * existed from one uploaded after. Guessing wrong there would put a 404 inside a `srcset` and
 * show a guest a hole in the gallery.
 */
export function photoKey(
  catalogueId: string,
  photoId: string,
  extension: string,
  width: number = PHOTO_WIDTHS[0],
): string {
  return `c/${catalogueId}/w${width}/${photoId}.${extension.replace(/^\./, '').toLowerCase()}`
}

/**
 * The id of a catalogue's default album — derived, never invented.
 *
 * Photographs upload in parallel, so several requests reach "does an album exist yet?" before
 * any of them has finished creating one. Generating a fresh uuid per request meant three
 * photographs produced three albums. A deterministic id makes the primary key settle it: the
 * losers of the race collide and re-read instead of each adding a duplicate.
 *
 * RFC 4122 v5 shape, SHA-1 over a fixed namespace and the catalogue id.
 */
export function defaultAlbumId(catalogueId: string): string {
  const hash = createHash('sha1').update(`mehfilbox.album.default:${catalogueId}`).digest()
  const bytes = Buffer.from(hash.subarray(0, 16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x50 // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80 // RFC 4122 variant
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * How long a signed photo URL lives (N-83).
 *
 * Guest reads come off `getCachedBundle`'s data cache, which can serve a snapshot for up to its
 * own `MAX_AGE_S` (an hour) before revalidating — so the token baked into that snapshot has to
 * outlive the cache, not just the request that wrote it. 24h clears that with room to spare, and
 * is short enough that a forwarded photograph still goes dead within the day, the same promise
 * doc 01 US-5 already makes for video.
 */
export const PHOTO_SIGN_TTL_S = 60 * 60 * 24

/** A photograph with its `srcSet` already resolved and signed — see `signPhotos`. */
export type SignedPhoto = Photo & { srcSet?: string }

/**
 * Sign every photograph in `photos` for one read, so a guest page or the admin console never
 * renders a photo pull zone URL that a token-authenticated zone will now 403.
 *
 * **File-scoped, not directory-scoped.** A first version signed the whole `c/<catalogueId>/`
 * directory once and relied on `photoSrcSet`'s width-swap reusing that one token across every
 * rendition — the same trade video's directory token makes. That shipped and 403'd every
 * photograph in production: this pull zone's Token Authentication only honours a token for the
 * exact path it was signed for, confirmed by testing both shapes against the live zone. So every
 * rendition gets its own signature here — `photoSrcSet` still derives the *candidate* URLs from
 * the unsigned master (unchanged), but each candidate is now signed individually before being
 * joined back into a `srcSet` string, which is why this returns `SignedPhoto` rather than
 * mutating `photo.url` alone: a consumer that wants the responsive set has to read `.srcSet`,
 * there is no single shared query left to derive it from client-side.
 *
 * `catalogueId` is not part of the signature any more, but every `photo.url` this is called with
 * is still expected to belong to it — the caller's own read was already scoped there.
 */
export function signPhotos(catalogueId: string, photos: Photo[]): SignedPhoto[] {
  const provider = getPhotoProvider()
  void catalogueId
  return photos.map((photo) => {
    const rawSrcSet = photoSrcSet(photo.url)
    const srcSet = rawSrcSet
      ? rawSrcSet
          .split(', ')
          .map((entry) => {
            const splitAt = entry.lastIndexOf(' ')
            return `${signOne(provider, entry.slice(0, splitAt))} ${entry.slice(splitAt + 1)}`
          })
          .join(', ')
      : undefined
    return { ...photo, url: signOne(provider, photo.url), srcSet }
  })
}

function signOne(provider: PhotoProvider, url: string): string {
  const query = provider.signPath(pathOf(url), PHOTO_SIGN_TTL_S)
  return query ? appendQuery(url, query) : url
}

/** The request path Bunny signs against — no host, no query. Handles a relative url too (the
 *  fake driver, and the demo catalogue's poster-frame fixture), which `new URL` alone cannot. */
function pathOf(url: string): string {
  try {
    return new URL(url, 'https://placeholder.invalid').pathname
  } catch {
    return url.split('?')[0] ?? url
  }
}

/**
 * A real Bunny CDN url from `urlFor` never carries a query of its own, but the demo catalogue's
 * seed data reuses the poster-frame generator for its photographs (`/api/poster/frame?asset=…`),
 * which does — found by actually looking at what the demo catalogue rendered, not by assuming
 * every stored `url` has the shape `urlFor` produces. A bare `${url}${query}` concatenation
 * there would have written a second `?` into the URL and silently swallowed the token inside the
 * poster route's own `n` parameter.
 */
function appendQuery(url: string, query: string): string {
  const params = query.startsWith('?') ? query.slice(1) : query
  return `${url}${url.includes('?') ? '&' : '?'}${params}`
}

export * from './provider'
export { PHOTO_WIDTHS } from './srcset'

