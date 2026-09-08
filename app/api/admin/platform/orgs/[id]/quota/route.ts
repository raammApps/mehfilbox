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
 * `POST /api/admin/platform/orgs/:id/quota` — set or clear a studio's storage allowance (N-27b).
 *
 * The second platform write, and the second half of doc 15 §1's "add writes one at a time, with an
 * audit trail". Until now this was `update entitlements …` in a SQL editor, which is both a thing
 * nobody wants to do at nine on a Saturday and a change with no record of who made it.
 *
 * **Only storage.** `entitlements` also carries `plan_id`, `max_titles` and `max_photos`, and
 * `resolveLimits` reads none of them — `plans` has no rows and nothing in the product consumes a
 * plan id. A console that assigned one would be writing a foreign key nobody reads, which looks
 * like a feature and is furniture. Storage is the field that actually decides whether an upload is
 * refused, so storage is the field this sets.
 */
const bodySchema = z.object({
  /** `null` clears the override, so `DEFAULT_LIMITS` applies again. */
  storageGb: z.number().int().positive().max(10_000).nullable(),
  reason: z.string().max(500).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/org:quota', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = bodySchema.parse(await request.json())

    const repository = getRepository()
    const org = await repository.getOrg(id)
    if (!org) throw new ApiError('NOT_FOUND', 'Org not found')

    const before = await repository.getOrgEntitlement(org.id)
    const updated = await repository.setOrgStorageQuota(org.id, body.storageGb)

    await recordPlatformAction({
      admin,
      action: body.storageGb === null ? 'org.quota.clear' : 'org.quota.set',
      org: { id: org.id, slug: org.slug },
      detail: {
        // The default is recorded explicitly rather than as null, so an audit row still reads
        // years later without the reader having to know what the default was at the time.
        from: before?.storageGb ?? DEFAULT_LIMITS.storageGb,
        to: body.storageGb ?? DEFAULT_LIMITS.storageGb,
        ...(body.reason ? { reason: body.reason } : {}),
      },
    })

    log.info('platform: org quota changed', {
      orgId: org.id,
      to: body.storageGb,
      actor: admin.email,
    })

    return noStore({ storageGb: updated?.storageGb ?? null })
  })
}
