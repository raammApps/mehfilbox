import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { generateCouponCode } from '@/lib/admin/coupons'
import { recordPlatformAction, requirePlatformAdmin } from '@/lib/admin/platform'
import { normalizeCode } from '@/lib/coupons'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { noStore, readJson, route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { CREDIT_PLAN_IDS } from '@/lib/plans'
import { COUPON_DOORS, COUPON_KINDS, couponSchema } from '@/lib/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * `POST /api/admin/platform/coupons` — create a coupon (N-121, D-61). Platform admins only: to anyone
 * else the route does not exist.
 *
 * The body says what the coupon *does*; everything else is decided here. The code is normalised (or
 * generated when left blank), a reward is forced to studios only, dates are days in India's timezone —
 * a window that "ends 30 November" ends at the end of that day for the people using it — and the
 * finished object is parsed by `couponSchema`, the same rules the database's check constraints
 * enforce, so a coupon that would be refused there is refused here first with a sentence.
 */
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

const bodySchema = z.object({
  code: z.string().max(64).optional(),
  kind: z.enum(COUPON_KINDS),
  value: z.number().int().positive(),
  rewardPlanId: z.enum(CREDIT_PLAN_IDS).optional(),
  campaign: z.string().trim().min(1, 'A campaign label is required').max(80),
  validFrom: day.nullable().optional(),
  validUntil: day.nullable().optional(),
  maxRedemptions: z.number().int().positive().nullable().optional(),
  maxPerPayer: z.number().int().positive().nullable().optional(),
  doors: z.array(z.enum(COUPON_DOORS)).min(1).optional(),
  planIds: z.array(z.string().min(1)).optional(),
})

/** Start of a day in India, as an instant. */
const startOf = (date: string) => new Date(`${date}T00:00:00+05:30`).toISOString()
/** The last millisecond of a day in India: "valid until the 30th" includes the whole of the 30th. */
const endOf = (date: string) => new Date(`${date}T23:59:59.999+05:30`).toISOString()

export async function POST(request: Request) {
  return route('platform/coupons:create', async () => {
    const admin = await requirePlatformAdmin()
    const body = await readJson(request, bodySchema)
    const repository = getRepository()

    // A blank code is a request for a random one; a typed one must be a real code.
    const typed = body.code?.trim()
    const code = typed ? normalizeCode(typed) : generateCouponCode()
    if (!code) {
      throw new ApiError('VALIDATION_FAILED', 'That is not a usable code', {
        fields: { code: 'Six to thirty-two letters, digits or hyphens' },
      })
    }

    // A discount may be limited to some products, and only ones that exist: a typo would otherwise
    // make a coupon that quietly applies to nothing.
    const planIds = body.planIds ?? []
    if (planIds.length > 0) {
      const known = new Set((await repository.listPlans()).map((plan) => plan.id))
      const unknown = planIds.filter((id) => !known.has(id))
      if (unknown.length > 0) {
        throw new ApiError('VALIDATION_FAILED', 'Some products are not on the price list', {
          fields: { planIds: `Not on the price list: ${unknown.join(', ')}` },
        })
      }
    }

    const coupon = couponSchema.parse({
      id: randomUUID(),
      code,
      kind: body.kind,
      value: body.value,
      rewardPlanId: body.kind === 'reward' ? (body.rewardPlanId ?? null) : null,
      campaign: body.campaign,
      validFrom: body.validFrom ? startOf(body.validFrom) : null,
      validUntil: body.validUntil ? endOf(body.validUntil) : null,
      maxRedemptions: body.maxRedemptions ?? null,
      // Unsaid means one per payer — the usual meaning of a code. `null` in the body means no limit.
      maxPerPayer: body.maxPerPayer === undefined ? 1 : body.maxPerPayer,
      // A reward is for studios only; unsaid doors mean both, for a discount.
      doors: body.kind === 'reward' ? ['studio'] : (body.doors ?? ['studio', 'couple']),
      // A reward names its basket; a product list means nothing to it.
      planIds: body.kind === 'reward' ? [] : planIds,
      active: true,
      createdBy: admin.email,
      createdAt: new Date().toISOString(),
    })

    const created = await repository.createCoupon(coupon)

    await recordPlatformAction({
      admin,
      action: 'coupon.create',
      detail: {
        couponId: created.id,
        code: created.code,
        kind: created.kind,
        value: created.value,
        rewardPlanId: created.rewardPlanId,
        campaign: created.campaign,
        validFrom: created.validFrom,
        validUntil: created.validUntil,
        maxRedemptions: created.maxRedemptions,
        maxPerPayer: created.maxPerPayer,
        doors: created.doors,
        planIds: created.planIds,
      },
    })
    log.info('platform: coupon created', { couponId: created.id, campaign: created.campaign, actor: admin.email })

    return noStore({ coupon: created }, 201)
  })
}
