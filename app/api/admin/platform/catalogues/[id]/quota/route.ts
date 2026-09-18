import { z } from 'zod'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { DEFAULT_LIMITS } from '@/lib/entitlements'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/catalogues/:id/quota` — set or clear one wedding's storage allowance
 * by hand (N-79, D-60). The catalogue-scoped sibling of `orgs/:id/quota` (N-27b): quota moved to
 * the catalogue once tiers did, so a one-off grant belongs here, not on the studio as a whole —
 * exactly the reason `resolveLimits` was already built to let a catalogue's own grant win.
 */
const bodySchema = z.object({
  storageGb: z.number().int().positive().max(10_000).nullable(),
  reason: z.string().max(500).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/catalogue:quota', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = bodySchema.parse(await request.json())

    const repository = getRepository()
    const catalogue = await repository.getCatalogueById(id)
    if (!catalogue) throw new ApiError('NOT_FOUND', 'Catalogue not found')
    const org = await repository.getOrg(catalogue.orgId)

    const before = await repository.getCatalogueEntitlement(catalogue.id)
    const updated = await repository.setCatalogueStorageQuota(catalogue.id, body.storageGb)

    await recordPlatformAction({
      admin,
      action: body.storageGb === null ? 'catalogue.quota.clear' : 'catalogue.quota.set',
      org: org ? { id: org.id, slug: org.slug } : null,
      detail: {
        catalogueId: catalogue.id,
        slug: catalogue.slug,
        // The default is recorded explicitly, the same reason setOrgStorageQuota does — an
        // audit row that says "from 20" still reads correctly years after the default changes.
        from: before?.storageGb ?? DEFAULT_LIMITS.storageGb,
        to: body.storageGb ?? DEFAULT_LIMITS.storageGb,
        ...(body.reason ? { reason: body.reason } : {}),
      },
    })

    log.info('platform: catalogue quota changed', {
      catalogueId: catalogue.id,
      to: body.storageGb,
      actor: admin.email,
    })

    return noStore({ storageGb: updated?.storageGb ?? null })
  })
}
