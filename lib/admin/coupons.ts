import 'server-only'
import { randomInt, randomUUID } from 'node:crypto'
import { makeCredits } from '@/lib/admin/credits'
import { discountPaise, doorOf, inScope, normalizeCode, windowOpen } from '@/lib/coupons'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { consume } from '@/lib/http/rate-limit'
import { log } from '@/lib/log'
import type { CreditPlanId } from '@/lib/plans'
import { getPrice } from '@/lib/pricing'
import type { Coupon } from '@/lib/schema'

/**
 * Coupon codes, server side (N-121, D-61).
 *
 * A code is a password for money, so two things are true of everything here. **The answer to a bad
 * code is always the same** — unknown, malformed, disabled, expired, used up, for the other door, for
 * another product: `{ ok: false }` and nothing more, because a caller who can tell *expired* from
 * *unknown* can enumerate which codes exist. And **the browser never supplies a price or a discount**:
 * the list price comes from the price list and the discount from the coupon row, both read here.
 *
 * Why it is refused is logged, with the coupon's id when there is one and never the typed string —
 * that is what an operator needs to answer "why did this not work for them" without the log itself
 * becoming a list of guesses.
 */

export const COUPON_INVALID_MESSAGE = 'That code did not work.'

/**
 * Lookups per window, per studio and per address — counted whether or not the code was right, because
 * the point is to bound guessing. Looser than the passcode's five: a studio typing a code off a
 * flyer is expected to mistype it once or twice.
 */
export const LOOKUPS_PER_ORG = 8
export const LOOKUPS_PER_IP = 20
export const LOOKUP_WINDOW_S = 15 * 60

/** Consumes both buckets *before* looking anything up, then refuses with how long to wait. */
export async function enforceCouponLookup(orgId: string, ip: string): Promise<void> {
  const org = await consume(`coupon:org:${orgId}`, LOOKUPS_PER_ORG, LOOKUP_WINDOW_S)
  const address = await consume(`coupon:ip:${ip}`, LOOKUPS_PER_IP, LOOKUP_WINDOW_S)
  if (!org.allowed || !address.allowed) {
    throw new ApiError('RATE_LIMITED', 'Too many attempts — try again a little later', {
      retryAfterS: Math.max(org.retryAfterS, address.retryAfterS),
    })
  }
}

/** No 0/O, 1/I or L — a code read off a screen or a flyer must survive being read aloud. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** A random code with about fifty bits of entropy — for a campaign nobody wants to name by hand. */
export function generateCouponCode(length = 10): string {
  return Array.from({ length }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

type Resolved = { ok: true; coupon: Coupon } | { ok: false }

/**
 * Everything both entry points check, in one place so they cannot drift: the code is well formed and
 * exists, is enabled and inside its window, is the kind being asked for, covers this payer's door and
 * this product, and has redemptions left overall and for this payer. The last two are a *read* — the
 * decision is `Repository.redeemCoupon`'s, under a lock; this only avoids offering what will be refused.
 */
async function resolve(
  code: string,
  payerOrgId: string,
  want: { kind: 'discount' | 'reward'; planId: string },
  now: Date,
): Promise<Resolved> {
  const refuse = (reason: string, couponId?: string): Resolved => {
    log.info('coupon: refused', { reason, couponId: couponId ?? null, orgId: payerOrgId })
    return { ok: false }
  }

  const normalized = normalizeCode(code)
  if (!normalized) return refuse('malformed')

  const repository = getRepository()
  const coupon = await repository.getCouponByCode(normalized)
  if (!coupon) return refuse('unknown')
  if (!coupon.active) return refuse('disabled', coupon.id)
  if (!windowOpen(coupon, now)) return refuse('outside its window', coupon.id)
  if ((coupon.kind === 'reward') !== (want.kind === 'reward')) return refuse('wrong kind', coupon.id)

  const org = await repository.getOrg(payerOrgId)
  if (!org) return refuse('no such payer', coupon.id)
  if (!inScope(coupon, { door: doorOf(org.kind), planId: want.planId })) return refuse('out of scope', coupon.id)

  const { total, byPayer } = await repository.countCouponRedemptions(coupon.id, payerOrgId)
  if (coupon.maxRedemptions !== null && total >= coupon.maxRedemptions) return refuse('exhausted', coupon.id)
  if (coupon.maxPerPayer !== null && byPayer >= coupon.maxPerPayer) return refuse('used by this payer', coupon.id)

  return { ok: true, coupon }
}

export type CouponQuote =
  | {
      ok: true
      couponId: string
      code: string
      campaign: string
      /** The list price, from the price list — never from the caller. */
      listPricePaise: number
      /** What the coupon takes off, in whole paise. */
      amountOffPaise: number
      /** What the payer is charged: never below zero. Zero means nothing to pay. */
      payablePaise: number
    }
  | { ok: false }

/**
 * What a discount coupon would take off one product for one payer — the number N-20's checkout charges.
 *
 * Reads only: it does not use the coupon up. Recording the redemption is `Repository.redeemCoupon`'s
 * job, called by the checkout once there is a payment to attach it to, and that call re-checks every
 * limit atomically. One code per call: there is no way to pass two, so nothing stacks.
 */
export async function applyCoupon(
  code: string,
  product: { planId: string },
  payer: { orgId: string },
  now: Date = new Date(),
): Promise<CouponQuote> {
  const resolved = await resolve(code, payer.orgId, { kind: 'discount', planId: product.planId }, now)
  if (!resolved.ok) return { ok: false }

  // Strict, like a checkout: a product with no price is not for sale, and quoting a discount on
  // something that cannot be bought would only confuse the payer.
  const listPricePaise = await getPrice(product.planId)
  if (listPricePaise === null) {
    log.info('coupon: refused', { reason: 'not for sale', couponId: resolved.coupon.id, orgId: payer.orgId })
    return { ok: false }
  }

  const amountOffPaise = discountPaise(resolved.coupon, listPricePaise)
  return {
    ok: true,
    couponId: resolved.coupon.id,
    code: resolved.coupon.code,
    campaign: resolved.coupon.campaign,
    listPricePaise,
    amountOffPaise,
    payablePaise: listPricePaise - amountOffPaise,
  }
}

export type RewardResult =
  | { ok: true; count: number; planId: CreditPlanId; campaign: string }
  | { ok: false }

/**
 * Redeem a reward code: grant the studio its typed credits, with no payment.
 *
 * Studios only — a reward's own row says so and `resolve` checks the payer's door — and each
 * credit's `grantedBy` carries the code, so a credit reads as its own receipt the way a manual grant's
 * does. The redemption and the credits are written in one atomic step, so a code that was counted
 * always paid out and one that paid out was always counted.
 */
export async function redeemReward(
  code: string,
  payer: { orgId: string },
  now: Date = new Date(),
): Promise<RewardResult> {
  const resolved = await resolve(code, payer.orgId, { kind: 'reward', planId: '' }, now)
  if (!resolved.ok) return { ok: false }
  const { coupon } = resolved
  if (!coupon.rewardPlanId) return { ok: false }

  const credits = makeCredits({
    orgId: payer.orgId,
    count: coupon.value,
    planId: coupon.rewardPlanId,
    grantedBy: `coupon:${coupon.code}`,
    reason: `Coupon ${coupon.code} — ${coupon.campaign}`,
    now,
  })
  const redemption = await getRepository().redeemCoupon({
    redemption: {
      id: randomUUID(),
      couponId: coupon.id,
      payerOrgId: payer.orgId,
      paymentId: null,
      amountOffPaise: 0,
      creditsGranted: credits.length,
      createdAt: now.toISOString(),
    },
    credits,
    nowIso: now.toISOString(),
  })
  if (!redemption) {
    // Lost the race for the last redemption, or a limit was reached between the read and the write.
    log.info('coupon: refused', { reason: 'lost the atomic check', couponId: coupon.id, orgId: payer.orgId })
    return { ok: false }
  }

  log.info('coupon: reward redeemed', {
    couponId: coupon.id,
    campaign: coupon.campaign,
    orgId: payer.orgId,
    credits: credits.length,
    planId: coupon.rewardPlanId,
  })
  return { ok: true, count: credits.length, planId: coupon.rewardPlanId, campaign: coupon.campaign }
}
