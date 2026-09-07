import { z } from 'zod'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { orgStatusSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/orgs/:id/status` — suspend or restore a studio (N-27, doc 15 §1).
 *
 * **The first write the platform console has ever had.** doc 15 §1 keeps read-only as the default
 * stance and says to add writes one at a time with an audit trail, and this is that: one field,
 * one action, one recorded row.
 *
 * Suspension stops the studio signing in and stops every write it could make. It deliberately
 * does **not** touch a single catalogue: the weddings a studio has already delivered are the
 * couples', and a billing dispute between us and a studio must never take a wedding off the air.
 * That separation is the whole reason `status` is on `orgs` and not on `catalogues`.
 */
const bodySchema = z.object({
  status: orgStatusSchema,
  // Free text, stored on the audit row. Not required — an unexplained suspension is still better
  // recorded than not recorded — but the console asks for one.
  reason: z.string().max(500).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/org:status', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = bodySchema.parse(await request.json())

    const repository = getRepository()
    const org = await repository.getOrg(id)
    if (!org) throw new ApiError('NOT_FOUND', 'Org not found')

    // Nothing to record and nothing to change. Returning early keeps the audit trail a log of
    // changes rather than of clicks.
    if (org.status === body.status) return noStore({ org })

    const updated = await repository.setOrgStatus(org.id, body.status)

    await recordPlatformAction({
      admin,
      action: body.status === 'suspended' ? 'org.suspend' : 'org.restore',
      org: { id: org.id, slug: org.slug },
      detail: { from: org.status, to: body.status, ...(body.reason ? { reason: body.reason } : {}) },
    })

    log.info('platform: org status changed', {
      orgId: org.id,
      from: org.status,
      to: body.status,
      actor: admin.email,
    })

    return noStore({ org: updated })
  })
}
