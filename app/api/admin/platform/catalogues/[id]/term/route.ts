import { z } from 'zod'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { revalidateCatalogue } from '@/lib/catalogue-cache'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { SERVING_SUB_STATUSES } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/catalogues/:id/term` — set when a wedding stops serving (D-39).
 *
 * This used to be a date field on the studio's own settings drawer, which meant a studio could
 * set its own renewal date for free. A term is what a renewal buys, so it is written here, by us,
 * with the reason on the audit row — and when the new date is in the future the lapse ladder is
 * put back to *included* at once, rather than leaving guests on the renewal screen until the
 * next cron run noticed.
 */
const bodySchema = z.object({
  includedUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  reason: z.string().trim().min(1).max(500),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/catalogue:term', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = await readJson(request, bodySchema)

    const repository = getRepository()
    const catalogue = await repository.getCatalogueById(id)
    if (!catalogue) throw new ApiError('NOT_FOUND', 'Catalogue not found')
    const org = await repository.getOrg(catalogue.orgId)

    const includedUntil = `${body.includedUntil}T00:00:00.000Z`
    const stillRunning = new Date(includedUntil).getTime() > Date.now()
    const updated = await repository.updateCatalogue(id, catalogue.orgId, {
      includedUntil,
      // A term that has been paid for is `active`, not the included first year.
      ...(stillRunning && !SERVING_SUB_STATUSES.includes(catalogue.subStatus) ? { subStatus: 'active' as const } : {}),
    })

    await recordPlatformAction({
      admin,
      action: 'catalogue.term',
      org: org ? { id: org.id, slug: org.slug } : null,
      detail: {
        catalogueId: catalogue.id,
        slug: catalogue.slug,
        from: catalogue.includedUntil,
        to: includedUntil,
        reason: body.reason,
      },
    })
    revalidateCatalogue(updated.slug)
    log.info('platform: catalogue term set', { catalogueId: id, to: includedUntil, actor: admin.email })

    return noStore({ catalogue: updated })
  })
}
