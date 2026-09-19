import { formatRupees } from '@/lib/format'
import { planLabel } from '@/lib/plans'
import { COUPON_CODE_PATTERN, type Coupon, type CouponDoor, type Org } from '@/lib/schema'

/**
 * The rules of a coupon that need no database (N-121, D-61) — pure, so each is provable on its own and
 * the console can use them too. Anything that reads or writes lives in `lib/admin/coupons.ts`.
 */

/**
 * A typed code, made comparable: trimmed and upper-cased. `null` when it could not be a code at all,
 * so a lookup for gibberish never reaches the database.
 */
export function normalizeCode(input: string): string | null {
  const code = input.trim().toUpperCase()
  return COUPON_CODE_PATTERN.test(code) ? code : null
}

/** Which door an org walks through: a partner is a studio, a couple is a direct couple. */
export function doorOf(kind: Org['kind']): CouponDoor {
  return kind === 'couple' ? 'couple' : 'studio'
}

/** Is `now` inside the window? Either end may be open. Instants, not dates: it ends when it says. */
export function windowOpen(coupon: Pick<Coupon, 'validFrom' | 'validUntil'>, now: Date): boolean {
  if (coupon.validFrom && now.getTime() < Date.parse(coupon.validFrom)) return false
  if (coupon.validUntil && now.getTime() > Date.parse(coupon.validUntil)) return false
  return true
}

/** Does the coupon cover this payer and this product? An empty product list means any. */
export function inScope(coupon: Pick<Coupon, 'doors' | 'planIds'>, target: { door: CouponDoor; planId: string }): boolean {
  return coupon.doors.includes(target.door) && (coupon.planIds.length === 0 || coupon.planIds.includes(target.planId))
}

/**
 * What a discount takes off a list price, in whole paise — never more than the price, never a
 * fraction. A percentage rounds **down**: the customer is never given a paisa the coupon did not
 * promise, and the same rule on every code means nobody has to guess which way it went. A reward
 * takes nothing off a checkout; it grants credits instead.
 */
export function discountPaise(coupon: Pick<Coupon, 'kind' | 'value'>, listPricePaise: number): number {
  if (coupon.kind === 'percent') return Math.floor((listPricePaise * coupon.value) / 100)
  if (coupon.kind === 'fixed') return Math.min(coupon.value, listPricePaise)
  return 0
}

/** "20% off", "₹500 off", "2 Cinema credits" — how a coupon reads in the console. */
export function describeCoupon(
  coupon: Pick<Coupon, 'kind' | 'value' | 'rewardPlanId'>,
  plans: Record<string, { name: string }>,
): string {
  if (coupon.kind === 'percent') return `${coupon.value}% off`
  if (coupon.kind === 'fixed') return `${formatRupees(coupon.value)} off`
  const plan = planLabel(plans, coupon.rewardPlanId ?? 'deliver')
  return `${coupon.value} ${plan} credit${coupon.value === 1 ? '' : 's'}`
}
