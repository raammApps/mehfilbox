import { requireEditableCatalogue } from '@/lib/admin/session'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/catalogues/:id/publish` (doc 07, doc 09 P0-26).
 *
 * Copies `draft_modules` → `modules`, sets `published_at`, and revalidates ISR. This is the
 * only path that writes `modules`, which is what makes "the published page matches the preview
 * exactly" (doc 14 §7) a property of the system rather than a hope.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:publish', async () => {
    const { id } = await params
    const { catalogue } = await requireEditableCatalogue(id)

    const modules = catalogue.draftModules ?? catalogue.modules
    const now = new Date().toISOString()

    const published = await getRepository().updateCatalogue(id, catalogue.orgId, {
      modules,
      /**
       * Branding is promoted here too (N-56), and this is the line that makes "nothing reaches
       * the couple before Publish" true rather than nearly true. Sections were always held back;
       * branding was written live, so colour, logo and "Presented by" reached the couple the
       * moment they were typed.
       */
      branding: catalogue.draftBranding ?? catalogue.branding,
      draftBranding: null,
      // The draft is cleared so "unpublished changes" means something afterwards.
      draftModules: null,
      status: 'published',
      publishedAt: catalogue.publishedAt ?? now,
    })

    /**
     * Content moves with everything else (N-57).
     *
     * Sections wait in `draft_modules`, branding waits in `draft_branding`, and films and
     * photographs waited for nothing at all — ticking a film published it instantly and a
     * photograph appeared the moment it uploaded. One wedding page had three different answers to
     * "when does the couple see this". This is the third.
     */
    const content = await getRepository().publishCatalogueContent(id)
    if (content.published > 0 || content.withdrawn > 0) {
      log.info('catalogue content published', { catalogueId: id, ...content })
    }

    // The tag, not the path: this route renders per request for cookies, so there is no route
    // cache — the cached reads are what a guest would otherwise see stale.
    revalidateCatalogue(published.slug)
    log.info('catalogue published', { catalogueId: id, sections: modules.length })

    revalidateCatalogue(published.slug)
    return noStore({ catalogue: published })
  })
}

/** Unpublish. Guests get "not yet available", never a 404 (doc 02 §5). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('admin/catalogue:unpublish', async () => {
    const { id } = await params
    const { catalogue } = await requireEditableCatalogue(id)
    const updated = await getRepository().updateCatalogue(id, catalogue.orgId, { status: 'draft' })
    revalidateCatalogue(updated.slug)
    return noStore({ catalogue: updated })
  })
}
