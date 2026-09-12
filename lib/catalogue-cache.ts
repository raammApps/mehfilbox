import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'
import { getRepository } from './db'
import type { Catalogue, CatalogueBundle } from './schema'

/**
 * The guest surface's read cache.
 *
 * Two hundred guests opening one link was two hundred renders and four database round trips
 * each — the catalogue, its titles, its albums, its photographs. That is the one cost that grows
 * with every catalogue sold, which is why doc 15 §5 ranks it first.
 *
 * **Why not static rendering.** `/c/[slug]` declares `revalidate`, but it reads `cookies()` for
 * the locale, the profile and the passcode grant, which opts the route out of static generation
 * entirely. That is not a mistake to correct: whether a guest may see this catalogue *depends*
 * on their cookies, and a page cached across guests could not answer it. So the render stays
 * per-request and the **data** is cached instead, which is where the round trips were.
 *
 * Cached on content, never on permission. `resolveAccess` still reads the cookie and re-decides
 * on every request; only the rows it decides against come from here.
 */

/** One tag per catalogue, so publishing one wedding never busts another's cache. */
export function catalogueTag(slug: string): string {
  return `catalogue:${slug}`
}

/**
 * Bump when the shape of a cached row changes.
 *
 * The data cache outlives the process: on disk under `.next/cache` between local runs, and on
 * Vercel across deployments. An entry written before a column existed is served
 * stale-while-revalidating by the first request after a deploy, and a page that reads the new
 * field off it sees `undefined` — which is how the tenant-path redirect (D-32) silently did nothing
 * on a legacy link, with every unit test green and the row itself correct. Part of the key rather
 * than a tag, because a tag can only be invalidated from a running process that knows to.
 */
const CACHE_GENERATION = 'g2'

/**
 * An hour is the backstop, not the mechanism.
 *
 * Every path that changes what a guest sees calls `revalidateCatalogue`, so the timer only
 * matters if one is ever missed — and a wedding page an hour stale is a far better failure than
 * one that needs a deploy to correct.
 */
const MAX_AGE_S = 3600

export const getCachedCatalogueBySlug = (slug: string): Promise<Catalogue | null> =>
  unstable_cache(
    async () => getRepository().getCatalogueBySlug(slug),
    ['catalogue-by-slug', CACHE_GENERATION, slug],
    { tags: [catalogueTag(slug)], revalidate: MAX_AGE_S },
  )()

export const getCachedBundle = (catalogue: Catalogue): Promise<CatalogueBundle> =>
  unstable_cache(
    async () => {
      const repository = getRepository()
      const [titles, albums, photos] = await Promise.all([
        repository.listTitles(catalogue.id, { publishedOnly: true }),
        repository.listAlbums(catalogue.id),
        // `liveOnly` (N-57): a photograph reaches the couple when a Publish carries it, not when
        // it finishes uploading.
        repository.listPhotosForCatalogue(catalogue.id, { liveOnly: true }),
      ])
      // The catalogue itself is not cached in here: it arrives from the caller, which has
      // already read it fresh enough to have made an access decision against it.
      return { catalogue, titles, albums, photos }
    },
    ['catalogue-bundle', CACHE_GENERATION, catalogue.id],
    { tags: [catalogueTag(catalogue.slug)], revalidate: MAX_AGE_S },
  )()

/**
 * Drop a catalogue's cached reads.
 *
 * Call from **every** write an operator can see the result of: publishing, editing a title,
 * uploading or removing a photograph, changing branding or settings. A guest looking at a stale
 * page after an operator "fixed" something is the failure this exists to prevent, and it is the
 * kind that gets reported as "the site is broken".
 */
export function revalidateCatalogue(slug: string): void {
  revalidateTag(catalogueTag(slug))
}
