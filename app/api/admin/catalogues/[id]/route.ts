import { z } from 'zod'
import { requireEditableCatalogue, requireOwnedCatalogue } from '@/lib/admin/session'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { hashSecret } from '@/lib/auth'
import { getRepository } from '@/lib/db'
import { resolveLimits } from '@/lib/entitlements'
import { log } from '@/lib/log'
import { getPhotoProvider, PHOTO_WIDTHS } from '@/lib/photos'
import { getVideoProvider } from '@/lib/video'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import {
  brandingSchema,
  localeSchema,
  localisedRequiredSchema,
  localisedStringSchema,
  privacySchema,
  slugSchema,
} from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  coupleName: localisedRequiredSchema.optional(),
  city: localisedStringSchema.optional(),
  synopsis: localisedStringSchema.optional(),
  weddingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  slug: slugSchema.optional(),
  /**
   * Draft only (N-56). The live `branding` field is deliberately **not** accepted here: the
   * console's only branding writer was this route, and accepting the live field is what let a
   * studio repaint a couple's page while still choosing a colour. Publish promotes it.
   *
   * `/api/claim` still sets live branding through the repository, which is correct — that is the
   * system stamping "Presented by" at handover, not an operator editing.
   */
  draftBranding: brandingSchema.nullable().optional(),
  /**
   * The language this wedding opens in (N-29c). A **setting**, not part of the page's draft: it
   * lives with passcode and address and takes effect immediately (D-31).
   *
   * The customizer's branding panel is where a studio shapes the page and would be the obvious
   * home, but everything there waits for Publish — and two save models in one panel is the exact
   * confusion N-56 removed. Better in the drawer where every control behaves the same way.
   */
  locale: localeSchema.optional(),
  featuredTitleId: z.string().uuid().nullable().optional(),
  privacy: privacySchema.optional(),
  /**
   * A domain the couple owns, pointed at us. Stored bare and lowercased — `resolveTenant`
   * normalises the `Host` header the same way, and the two must agree or the lookup misses.
   */
  customDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/, 'Enter a domain like ours.example.com')
    .max(253)
    .nullable()
    .optional(),
  /**
   * When the catalogue stops serving. Past this, guests get the renewal screen rather than a
   * 404 — doc 01 is explicit that a lapsed wedding is never a dead link.
   */
  includedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  /** Empty string clears the passcode; anything else is hashed before it touches the row. */
  passcode: z.string().max(64).nullable().optional(),
})

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:get', async () => {
    const { id } = await params
    const { catalogue } = await requireEditableCatalogue(id)
    const repository = getRepository()
    const [titles, albums, photos, grants] = await Promise.all([
      repository.listTitles(catalogue.id),
      repository.listAlbums(catalogue.id),
      repository.listPhotosForCatalogue(catalogue.id),
      repository.getEntitlements(catalogue.id, catalogue.orgId),
    ])
    // The caps travel with the data. A client that imports a constant is a client that shows the
    // wrong number the moment the catalogue is upgraded (doc 15 §3).
    const limits = resolveLimits(grants.catalogue, grants.org)
    return noStore({ catalogue, titles, albums, photos, limits })
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:patch', async () => {
    const { id } = await params
    const body = await readJson(request, patchSchema)

    /**
     * What a studio may change on the couple's invitation is the look of the page and which film
     * leads it — the things it came back to fix. Everything else on this schema is a setting, and
     * settings stay with the owner (doc 16 §3). Decided by the keys actually sent, so the
     * customizer's autosave and the settings drawer hit the same route and get different answers.
     */
    const SUPPORT_FIELDS = new Set(['draftBranding', 'featuredTitleId'])
    const supportOnly = Object.keys(body).every((key) => SUPPORT_FIELDS.has(key))
    const { catalogue } = supportOnly
      ? await requireEditableCatalogue(id)
      : await requireOwnedCatalogue(id)
    const repository = getRepository()

    if (body.slug && body.slug !== catalogue.slug && !(await repository.slugAvailable(body.slug))) {
      throw new ApiError('VALIDATION_FAILED', 'That address is taken', {
        fields: { slug: 'That address is already in use' },
      })
    }

    const { passcode, ...rest } = body
    const patch: Parameters<typeof repository.updateCatalogue>[2] = { ...rest }

    if (passcode !== undefined) {
      patch.passcodeHash = passcode ? hashSecret(passcode) : null
    }
    // Switching privacy back to unlisted must not leave a live passcode hash behind.
    if (body.privacy === 'unlisted') patch.passcodeHash = null

    /**
     * A new guest code signs out everyone holding the old one (N-71): the grant cookie carries the
     * version it was issued under, and this is the bump that stops it matching.
     */
    if (passcode !== undefined || body.privacy === 'unlisted') {
      patch.passcodeVersion = catalogue.passcodeVersion + 1
    }

    const updated = await repository.updateCatalogue(id, catalogue.orgId, patch)
    // Both slugs: the address a guest may already be holding, and the one they will use next.
    revalidateCatalogue(catalogue.slug)
    if (updated.slug !== catalogue.slug) revalidateCatalogue(updated.slug)
    return noStore({ catalogue: updated })
  })
}

/**
 * Delete a catalogue and everything it owns.
 *
 * Order matters: provider assets first, the row last. The rows are the only manifest of what
 * was stored, so deleting them first would strand every film in Bunny with nothing left to say
 * they existed — paid for, invisible, unreclaimable. Doing it this way means a failure halfway
 * leaves the catalogue intact and the operation safe to retry.
 *
 * Asset failures do not abort the delete. A film the provider has already lost must not make a
 * catalogue permanently undeletable.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:delete', async () => {
    const { id } = await params
    const { session, catalogue } = await requireOwnedCatalogue(id)

    const repository = getRepository()
    const [titles, photos] = await Promise.all([
      repository.listTitles(id),
      repository.listPhotosForCatalogue(id),
    ])

    const video = getVideoProvider()
    for (const title of titles) {
      if (!title.providerId) continue
      await video.deleteAsset(title.providerId).catch((error: unknown) => {
        log.warn('catalogue delete: asset remained', { titleId: title.id, error: String(error) })
      })
    }

    const photoStore = getPhotoProvider()
    for (const photo of photos) {
      // Every rendition, not just the master — otherwise the narrower files linger for good.
      for (const width of PHOTO_WIDTHS) {
        const key = photoKeyFromUrl(photo.url).replace(`/w${PHOTO_WIDTHS[0]}/`, `/w${width}/`)
        await photoStore.remove(key).catch(() => {})
      }
    }

    await repository.deleteCatalogue(id, session.orgId)
    revalidateCatalogue(catalogue.slug)
    log.info('catalogue deleted', {
      catalogueId: id,
      slug: catalogue.slug,
      films: titles.length,
      photos: photos.length,
    })

    return noStore({ deleted: id })
  })
}

/** `photos.url` stores the public URL; the storage key is its path. */
function photoKeyFromUrl(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return url.replace(/^\//, '')
  }
}
