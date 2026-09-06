import { createHash } from 'node:crypto'
import { env } from '@/lib/env'
import { PHOTO_WIDTHS } from './srcset'
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

export * from './provider'
export { PHOTO_WIDTHS } from './srcset'

