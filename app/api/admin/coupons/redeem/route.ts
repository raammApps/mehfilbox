import { z } from 'zod'
import { COUPON_INVALID_MESSAGE, enforceCouponLookup, redeemReward } from '@/lib/admin/coupons'
import { requireOperator } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { clientIp } from '@/lib/http/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/coupons/redeem` — a studio enters a reward code and receives its credits (N-121).
 *
 * The one place a person types a code, so it is where the two protections live. Every lookup is
 * counted against the studio *and* the address before anything is read, whether or not the code was
 * right; and every way a code can fail — mistyped, unknown, disabled, expired, used up, not a reward,
 * for someone else — is the same 400 with the same words, so the response teaches a guesser nothing.
 *
 * The body is any string, not a validated code: a malformed one must be indistinguishable from an
 * unknown one, and a 400 with field errors for the first and a different 400 for the second would
 * not be.
 */
const bodySchema = z.object({ code: z.string().max(200) })

export async function POST(request: Request) {
  return route('admin/coupons:redeem', async () => {
    const { orgId } = await requireOperator()
    const body = await readJson(request, bodySchema)

    await enforceCouponLookup(orgId, clientIp(request))

    const result = await redeemReward(body.code, { orgId })
    if (!result.ok) throw new ApiError('COUPON_INVALID', COUPON_INVALID_MESSAGE)

    const balance = await getRepository().creditBalance(orgId, new Date().toISOString())
    return noStore({ granted: { count: result.count, planId: result.planId }, balance })
  })
}
