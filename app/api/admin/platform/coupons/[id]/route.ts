import { z } from 'zod'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/coupons/:id` — disable or re-enable a coupon (N-121, D-61).
 *
 * The only change a coupon allows, and there is no delete: a redeemed code is history, and what it was
 * worth is never rewritten after somebody used it. Disabling stops new redemptions and touches none
 * that happened. Both directions are on the audit trail.
 */
const bodySchema = z.object({ active: z.boolean() })

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return route('platform/coupons:toggle', async () => {
    const admin = await requirePlatformAdmin()
    const { id } = await params
    const body = await readJson(request, bodySchema)

    const repository = getRepository()
    const before = await repository.getCoupon(id)
    if (!before) throw new ApiError('NOT_FOUND', 'Coupon not found')

    const updated = await repository.setCouponActive(id, body.active)
    if (!updated) throw new ApiError('NOT_FOUND', 'Coupon not found')

    await recordPlatformAction({
      admin,
      action: body.active ? 'coupon.enable' : 'coupon.disable',
      detail: { couponId: before.id, code: before.code, campaign: before.campaign, was: before.active },
    })
    log.info('platform: coupon toggled', { couponId: id, active: body.active, actor: admin.email })

    return noStore({ coupon: updated })
  })
}
