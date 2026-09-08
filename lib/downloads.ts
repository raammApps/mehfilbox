import 'server-only'
import { cookies } from 'next/headers'
import { getCachedBundle, getCachedCatalogueBySlug } from '@/lib/catalogue-cache'
import { passcodeCookieName, verifyPasscodeGrant } from '@/lib/auth'
import type { Catalogue } from '@/lib/schema'
import { getVideoProvider } from '@/lib/video'

/**
 * Download everything, at any time (N-22).
 *
 * **This is the promise the whole product rests on.** "Nothing is ever deleted" and "it archives
 * rather than disappears" are the lines in the handover email, the FAQ and the pricing page, and
 * they are worth nothing if the couple cannot actually get their films out. So downloads survive
 * expiry, grace and archive — a wedding lapsing is a billing state, and nobody is held to ransom
 * for their own wedding.
 *
 * A manifest of signed links rather than a zip, because a 40 GB archive built inside a serverless
 * function is not a thing that works. The couple gets a list; their browser or download manager
 * does the rest.
 */

export type DownloadVerdict =
  | { kind: 'ok'; catalogue: Catalogue }
  /** A passcode is set and this guest has not entered it. */
  | { kind: 'locked' }
  /** No such catalogue, or one that was never published — there is nothing anyone was given. */
  | { kind: 'missing' }

/**
 * Who may download, which is **not** the same question as who may watch.
 *
 * Deliberately not `resolveAccess`. That returns `lapsed` *before* it checks the passcode, which
 * is correct for its own purpose — a lapsed catalogue shows a renewal screen and there is nothing
 * behind it to protect. Reusing it here would have handed a passcode-protected wedding to anybody
 * with the link the moment it expired, which is exactly the wrong direction for a rule whose whole
 * point is that lapsing changes nothing about ownership.
 */
export async function resolveDownloadAccess(slug: string): Promise<DownloadVerdict> {
  const catalogue = await getCachedCatalogueBySlug(slug)
  if (!catalogue) return { kind: 'missing' }

  /**
   * `publishedAt` rather than `status`: an archived or lapsed catalogue is not `published` any
   * more, and its couple is precisely who this exists for. What matters is that it was handed
   * over at some point — a draft nobody has ever seen has nothing to download.
   */
  if (!catalogue.publishedAt) return { kind: 'missing' }

  if (catalogue.privacy === 'passcode') {
    const grant = (await cookies()).get(passcodeCookieName(catalogue.slug))?.value
    if (!verifyPasscodeGrant(grant, catalogue.id)) return { kind: 'locked' }
  }

  return { kind: 'ok', catalogue }
}

export type DownloadItem = {
  kind: 'film' | 'photograph'
  name: string
  url: string
  /** `original`, or the rendition handed over instead — shown, not hidden. */
  quality: string | null
  sizeBytes: number | null
}

export type Manifest = { catalogue: string; items: DownloadItem[]; unavailable: number }

/** How long a link lives. Long enough to start a 40 GB download, short enough not to be a share. */
const TTL_S = 60 * 60 * 6

export async function buildManifest(catalogue: Catalogue): Promise<Manifest> {
  const bundle = await getCachedBundle(catalogue)
  const provider = getVideoProvider()
  const items: DownloadItem[] = []
  let unavailable = 0

  for (const title of bundle.titles) {
    if (!title.providerId) {
      unavailable += 1
      continue
    }
    /**
     * One film failing must not empty the list. A couple downloading their wedding at the end of
     * a plan is the least forgiving moment this product has, and "nine of ten films, and here is
     * the one we could not reach" beats an error page every time.
     */
    const file = await provider
      .getDownloadUrl({ providerId: title.providerId, ttlS: TTL_S })
      .catch(() => null)
    if (!file) {
      unavailable += 1
      continue
    }
    items.push({
      kind: 'film',
      name: title.name.en,
      url: file.url,
      quality: file.label,
      sizeBytes: title.sizeBytes,
    })
  }

  for (const photo of bundle.photos) {
    // Photographs are already files on a pull zone; there is nothing to sign or transcode.
    items.push({
      kind: 'photograph',
      name: photo.caption?.en ?? photo.url.split('/').pop() ?? 'photograph',
      url: photo.url,
      quality: null,
      sizeBytes: photo.sizeBytes,
    })
  }

  return { catalogue: catalogue.slug, items, unavailable }
}
