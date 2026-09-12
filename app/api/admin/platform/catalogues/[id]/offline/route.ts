import { z } from 'zod'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/catalogues/:id/offline` — take a wedding off the air, or put it back
 * (D-39). For abuse, and for nothing else: a billing question is a term (see `term`), never this.
 *
 * Offline is the studio's own "take offline" — status back to draft, guests see "not yet
 * available", nothing deleted. Putting it back republishes what was live; it spends no credit,
 * because a wedding that was up has already spent its one.
 */
const bodySchema = z.object({
  offline: z.boolean(),
  reason: z.string().trim().min(1).max(500),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/catalogue:offline', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = await readJson(request, bodySchema)

    const repository = getRepository()
    const catalogue = await repository.getCatalogueById(id)
    if (!catalogue) throw new ApiError('NOT_FOUND', 'Catalogue not found')
    const org = await repository.getOrg(catalogue.orgId)

    if (!body.offline && catalogue.publishedAt === null) {
      throw new ApiError('VALIDATION_FAILED', 'This wedding has never been published; its studio publishes it')
    }
    const next = body.offline ? 'draft' : 'published'
    if (catalogue.status === next) return noStore({ catalogue })

    const updated = await repository.updateCatalogue(id, catalogue.orgId, { status: next })

    await recordPlatformAction({
      admin,
      action: body.offline ? 'catalogue.offline' : 'catalogue.online',
      org: org ? { id: org.id, slug: org.slug } : null,
      detail: { catalogueId: catalogue.id, slug: catalogue.slug, reason: body.reason },
    })
    revalidateCatalogue(updated.slug)
    log.info('platform: catalogue availability changed', { catalogueId: id, to: next, actor: admin.email })

    return noStore({ catalogue: updated })
  })
}
