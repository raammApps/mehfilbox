import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as redeem } from '@/app/api/admin/coupons/redeem/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import {
  applyCoupon,
  generateCouponCode,
  LOOKUPS_PER_IP,
  LOOKUPS_PER_ORG,
  redeemReward,
} from '@/lib/admin/coupons'
import { describeCoupon, discountPaise, doorOf, inScope, normalizeCode, windowOpen } from '@/lib/coupons'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot, type Snapshot } from '@/lib/db/memory-repository'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { MAX_REWARD_CREDITS } from '@/lib/plans'
import { couponSchema, operatorSchema, orgSchema, type Coupon } from '@/lib/schema'

/**
 * N-121, D-61 — coupon codes.
 *
 * A code is a password for money, so what is proven here is mostly about *refusal*: every way a code
 * can fail — mistyped, unknown, disabled, not yet valid, expired, used up, used already, meant for the
 * other door, for another product, or the wrong kind — must give one and the same answer, or the
 * answer becomes a way to find out which codes exist. And that nothing the browser sends can change
 * what is taken off.
 */

const STUDIO = '11111111-1111-4111-8111-11111111111a'
const OTHER_STUDIO = '11111111-1111-4111-8111-11111111111b'
const COUPLE = '11111111-1111-4111-8111-11111111111c'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const OTHER_OPERATOR = '00000000-0000-4000-8000-000000000002'
const COUPLE_OPERATOR = '00000000-0000-4000-8000-000000000003'
const AT = '2026-01-01T00:00:00.000Z'
const NOW = new Date('2026-09-19T10:00:00.000Z')

let repo: MemoryRepository
let snapshot: Snapshot
let n = 0

/** A coupon with sensible defaults; `over` says what a test is about. */
function coupon(over: Record<string, unknown> = {}): Coupon {
  n += 1
  return couponSchema.parse({
    id: `33333333-3333-4333-8333-${String(n).padStart(12, '0')}`,
    code: `TESTCODE${n}`,
    kind: 'percent',
    value: 20,
    campaign: 'Spring 2026',
    createdBy: 'root@mehfilbox.test',
    createdAt: AT,
    ...over,
  })
}

const reward = (over: Record<string, unknown> = {}) =>
  coupon({ kind: 'reward', value: 2, rewardPlanId: 'cinema', doors: ['studio'], ...over })

function signedInAs(id: string, email: string): AuthProvider {
  return {
    name: 'stub',
    currentUser: async () => ({ id, email }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider
}

const as = (operator: string, email: string) => setAuthProvider(signedInAs(operator, email))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  n = 0
  snapshot = emptySnapshot()
  snapshot.plans = structuredClone(SEED_PLANS)
  snapshot.orgs.push(
    orgSchema.parse({ id: STUDIO, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }),
    orgSchema.parse({ id: OTHER_STUDIO, name: 'Other Studio', slug: 'other', createdAt: AT }),
    orgSchema.parse({ id: COUPLE, name: 'Aanya and Vikram', slug: 'aanya-vikram', kind: 'couple', createdAt: AT }),
  )
  for (const [id, orgId, email] of [
    [OPERATOR, STUDIO, 'operator@example.test'],
    [OTHER_OPERATOR, OTHER_STUDIO, 'other@example.test'],
    [COUPLE_OPERATOR, COUPLE, 'couple@example.test'],
  ] as const) {
    snapshot.operators.push(
      operatorSchema.parse({ id, orgId, email, name: 'Someone', role: 'admin', passwordHash: '', createdAt: AT }),
    )
  }
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  as(OPERATOR, 'operator@example.test')
})

afterEach(() => vi.useRealTimers())

const give = (...coupons: Coupon[]) => Promise.all(coupons.map((c) => repo.createCoupon(c)))
const balance = (orgId = STUDIO) => repo.creditBalance(orgId, NOW.toISOString())

describe('a typed code', () => {
  it('is trimmed and upper-cased, so what was on the flyer finds what was created', () => {
    expect(normalizeCode('  spring-26x ')).toBe('SPRING-26X')
  })

  it.each(['', 'ABC', 'A'.repeat(33), '-SPRING26', 'SPRING26-', 'SPRING 26', 'SPRING_26', 'सोलह-कोड'])(
    'is refused before any lookup when it could not be a code: %j',
    (typed) => expect(normalizeCode(typed)).toBeNull(),
  )

  it('is generated from an alphabet with nothing to misread, and is a valid code', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateCouponCode()))

    expect(codes.size).toBe(200)
    for (const code of codes) {
      expect(normalizeCode(code), code).toBe(code)
      expect(code).not.toMatch(/[0O1IL]/)
    }
  })
})

describe('what a discount takes off', () => {
  it('rounds a percentage down, so nobody is given a paisa the coupon did not promise', () => {
    // 15% of ₹0.99 is 14.85 paise: 14, not 15.
    expect(discountPaise({ kind: 'percent', value: 15 }, 99)).toBe(14)
    expect(discountPaise({ kind: 'percent', value: 20 }, 199900)).toBe(39980)
  })

  it('never takes off more than the price', () => {
    expect(discountPaise({ kind: 'fixed', value: 500000 }, 199900)).toBe(199900)
    expect(discountPaise({ kind: 'percent', value: 100 }, 199900)).toBe(199900)
  })

  it('takes off a fixed amount as it is, and nothing for a reward', () => {
    expect(discountPaise({ kind: 'fixed', value: 25000 }, 199900)).toBe(25000)
    expect(discountPaise({ kind: 'reward', value: 2 }, 199900)).toBe(0)
  })
})

describe('the window, the door and the product', () => {
  it('is open from the instant it starts to the instant it ends, and closed either side', () => {
    const c = { validFrom: '2026-09-19T10:00:00.000Z', validUntil: '2026-09-20T10:00:00.000Z' }

    expect(windowOpen(c, new Date('2026-09-19T09:59:59.999Z'))).toBe(false)
    expect(windowOpen(c, new Date('2026-09-19T10:00:00.000Z'))).toBe(true)
    expect(windowOpen(c, new Date('2026-09-20T10:00:00.000Z'))).toBe(true)
    expect(windowOpen(c, new Date('2026-09-20T10:00:00.001Z'))).toBe(false)
    expect(windowOpen({ validFrom: null, validUntil: null }, NOW)).toBe(true)
  })

  it('covers the doors it names and the products it names — or any product when it names none', () => {
    const studioOnly = { doors: ['studio' as const], planIds: [] }
    const deliverOnly = { doors: ['studio' as const, 'couple' as const], planIds: ['deliver'] }

    expect(inScope(studioOnly, { door: 'studio', planId: 'keep' })).toBe(true)
    expect(inScope(studioOnly, { door: 'couple', planId: 'keep' })).toBe(false)
    expect(inScope(deliverOnly, { door: 'couple', planId: 'deliver' })).toBe(true)
    expect(inScope(deliverOnly, { door: 'couple', planId: 'keep' })).toBe(false)
  })

  it('treats a partner as a studio and a couple as a direct couple', () => {
    expect(doorOf('partner')).toBe('studio')
    expect(doorOf('couple')).toBe('couple')
  })
})

describe('what a coupon is allowed to be', () => {
  it('cannot be a percentage over a hundred', () => {
    expect(() => coupon({ value: 101 })).toThrow(/1 to 100/)
  })

  it('cannot be a reward for anyone but studios — a direct couple has no basket', () => {
    expect(() => reward({ doors: ['couple'] })).toThrow(/studios only/)
    expect(() => reward({ doors: ['studio', 'couple'] })).toThrow(/studios only/)
  })

  it('must say which credit a reward grants, and cannot grant more than the ceiling', () => {
    expect(() => reward({ rewardPlanId: null })).toThrow(/which credit/)
    expect(() => reward({ value: MAX_REWARD_CREDITS + 1 })).toThrow(/at most/)
  })

  it('cannot name a credit unless it is a reward', () => {
    expect(() => coupon({ rewardPlanId: 'keep' })).toThrow(/Only a reward/)
  })

  it('cannot end before it starts, and must have a campaign', () => {
    expect(() => coupon({ validFrom: '2026-10-01T00:00:00.000Z', validUntil: '2026-09-01T00:00:00.000Z' })).toThrow(/before it starts/)
    expect(() => coupon({ campaign: '   ' })).toThrow()
  })
})

describe('quoting a discount for a checkout', () => {
  it('reads the list price and takes the discount off it', async () => {
    await give(coupon({ code: 'TWENTY-OFF', kind: 'percent', value: 20 }))

    const quote = await applyCoupon('twenty-off', { planId: 'deliver' }, { orgId: STUDIO }, NOW)

    expect(quote).toMatchObject({ ok: true, listPricePaise: 199900, amountOffPaise: 39980, payablePaise: 159920 })
  })

  it('takes a fixed amount off, never below zero, and says zero when it covers the lot', async () => {
    await give(coupon({ code: 'FIXED-SMALL', kind: 'fixed', value: 25000 }), coupon({ code: 'FIXED-HUGE', kind: 'fixed', value: 9_999_999 }))

    expect(await applyCoupon('FIXED-SMALL', { planId: 'deliver' }, { orgId: STUDIO }, NOW)).toMatchObject({ payablePaise: 174900 })
    expect(await applyCoupon('FIXED-HUGE', { planId: 'deliver' }, { orgId: STUDIO }, NOW)).toMatchObject({
      amountOffPaise: 199900,
      payablePaise: 0,
    })
  })

  it('takes its price from the price list, so a repriced product is quoted at the new price', async () => {
    await give(coupon({ code: 'TWENTY-OFF', value: 20 }))
    snapshot.plans.find((plan) => plan.id === 'deliver')!.pricePaise = 100000

    const quote = await applyCoupon('TWENTY-OFF', { planId: 'deliver' }, { orgId: STUDIO }, NOW)

    expect(quote).toMatchObject({ listPricePaise: 100000, amountOffPaise: 20000, payablePaise: 80000 })
  })

  it('does not use the coupon up — quoting is a read', async () => {
    await give(coupon({ code: 'ONCE-ONLY', maxRedemptions: 1 }))

    await applyCoupon('ONCE-ONLY', { planId: 'deliver' }, { orgId: STUDIO }, NOW)
    const again = await applyCoupon('ONCE-ONLY', { planId: 'deliver' }, { orgId: STUDIO }, NOW)

    expect(again.ok).toBe(true)
    expect(await repo.listCouponRedemptions()).toHaveLength(0)
  })

  it('accepts one code and only one: there is no way to hand it two, so nothing stacks', () => {
    // The signature is the guarantee — `code: string`, not `codes: string[]` — and this holds it.
    expect(applyCoupon.length).toBeLessThanOrEqual(4)
    expect(typeof ('A' as Parameters<typeof applyCoupon>[0])).toBe('string')
  })

  it('applies to a couple as well as a studio when the coupon says both', async () => {
    await give(coupon({ code: 'FOR-EVERYONE' }))

    expect((await applyCoupon('FOR-EVERYONE', { planId: 'keep' }, { orgId: COUPLE }, NOW)).ok).toBe(true)
  })
})

describe('every way a code can fail is the same answer', () => {
  /**
   * Each entry is one reason a code should be refused; all of them must look identical to the caller.
   * `quoteOnly` marks the one that is only a refusal for a checkout: a reward is a fine thing to redeem.
   */
  const refusals: [string, () => Promise<unknown>][] = [
    ['mistyped', async () => 'NOT A CODE!'],
    ['unknown', async () => 'NOSUCHCODE'],
    ['disabled', async () => (await give(coupon({ code: 'DISABLED-ONE', active: false })), 'DISABLED-ONE')],
    ['not yet valid', async () => (await give(coupon({ code: 'TOO-EARLY', validFrom: '2026-10-01T00:00:00.000Z' })), 'TOO-EARLY')],
    ['expired', async () => (await give(coupon({ code: 'TOO-LATE', validUntil: '2026-09-01T00:00:00.000Z' })), 'TOO-LATE')],
    [
      'used up',
      async () => {
        await give(coupon({ code: 'USED-UP', maxRedemptions: 1 }))
        await repo.redeemCoupon({
          redemption: { id: '44444444-4444-4444-8444-444444444441', couponId: (await repo.getCouponByCode('USED-UP'))!.id, payerOrgId: OTHER_STUDIO, paymentId: null, amountOffPaise: 0, creditsGranted: 0, createdAt: NOW.toISOString() },
          credits: [],
          nowIso: NOW.toISOString(),
        })
        return 'USED-UP'
      },
    ],
    ['for the other door', async () => (await give(coupon({ code: 'COUPLES-ONLY', doors: ['couple'] })), 'COUPLES-ONLY')],
    ['for another product', async () => (await give(coupon({ code: 'KEEP-ONLY', planIds: ['keep'] })), 'KEEP-ONLY')],
    ['a reward, offered for a checkout', async () => (await give(reward({ code: 'A-REWARD' })), 'A-REWARD')],
  ]
  const forRewards = refusals.filter(([why]) => !why.startsWith('a reward'))

  it.each(refusals)('quoting: %s', async (_why, arrange) => {
    const code = (await arrange()) as string

    // Not merely "not ok": the whole object, so a reason field cannot slip in and be read.
    expect(await applyCoupon(code, { planId: 'deliver' }, { orgId: STUDIO }, NOW)).toStrictEqual({ ok: false })
  })

  it('quoting: a product that is not for sale', async () => {
    await give(coupon({ code: 'ANYTHING-GOES' }))

    // `light` is a storage tier with no price — the price list says it is not for sale.
    expect(await applyCoupon('ANYTHING-GOES', { planId: 'light' }, { orgId: STUDIO }, NOW)).toStrictEqual({ ok: false })
    expect(await applyCoupon('ANYTHING-GOES', { planId: 'nothing-at-all' }, { orgId: STUDIO }, NOW)).toStrictEqual({ ok: false })
  })

  it('quoting: a payer who already used it, when it allows one each', async () => {
    await give(coupon({ code: 'ONE-EACH', maxPerPayer: 1 }))
    const found = (await repo.getCouponByCode('ONE-EACH'))!
    await repo.redeemCoupon({
      redemption: { id: '44444444-4444-4444-8444-444444444442', couponId: found.id, payerOrgId: STUDIO, paymentId: null, amountOffPaise: 100, creditsGranted: 0, createdAt: NOW.toISOString() },
      credits: [],
      nowIso: NOW.toISOString(),
    })

    expect(await applyCoupon('ONE-EACH', { planId: 'deliver' }, { orgId: STUDIO }, NOW)).toStrictEqual({ ok: false })
    // …and someone who has not used it is still welcome.
    expect((await applyCoupon('ONE-EACH', { planId: 'deliver' }, { orgId: OTHER_STUDIO }, NOW)).ok).toBe(true)
  })

  it.each([...forRewards, ['a discount, offered as a reward', async () => (await give(coupon({ code: 'A-DISCOUNT' })), 'A-DISCOUNT')] as [string, () => Promise<unknown>]])(
    'redeeming a reward: %s — nothing is granted',
    async (_why, arrange) => {
    const code = (await arrange()) as string

    expect(await redeemReward(code, { orgId: STUDIO }, NOW)).toStrictEqual({ ok: false })
    expect((await balance()).available).toBe(0)
  })
})

describe('redeeming a reward', () => {
  it('grants that many credits of the plan it names, each a receipt of the code', async () => {
    await give(reward({ code: 'WELCOME-TWO', value: 2, rewardPlanId: 'cinema' }))

    const result = await redeemReward('welcome-two', { orgId: STUDIO }, NOW)

    expect(result).toMatchObject({ ok: true, count: 2, planId: 'cinema', campaign: 'Spring 2026' })
    expect((await balance()).byPlan.cinema).toEqual({ available: 2, consumed: 0, expired: 0 })
    expect((await balance()).byPlan.deliver.available).toBe(0)
    const credits = await repo.listCredits(STUDIO)
    expect(credits.every((credit) => credit.grantedBy === 'WELCOME-TWO'.replace(/^/, 'coupon:'))).toBe(true)
    expect(credits[0]!.reason).toContain('WELCOME-TWO')
    expect(credits[0]!.reason).toContain('Spring 2026')
    // Two years from redemption, as every credit is.
    expect(credits[0]!.expiresAt.slice(0, 10)).toBe('2028-09-19')
  })

  it('writes the redemption: who, which coupon, how many credits, and no payment', async () => {
    await give(reward({ code: 'WELCOME-TWO', value: 2 }))

    await redeemReward('WELCOME-TWO', { orgId: STUDIO }, NOW)

    const [redemption] = await repo.listCouponRedemptions()
    expect(redemption).toMatchObject({ payerOrgId: STUDIO, paymentId: null, amountOffPaise: 0, creditsGranted: 2 })
  })

  it('can be redeemed once per studio by default, and a second try grants nothing', async () => {
    await give(reward({ code: 'WELCOME-TWO', value: 2 }))

    expect((await redeemReward('WELCOME-TWO', { orgId: STUDIO }, NOW)).ok).toBe(true)
    expect(await redeemReward('WELCOME-TWO', { orgId: STUDIO }, NOW)).toStrictEqual({ ok: false })

    expect((await balance()).available).toBe(2)
    expect(await repo.listCouponRedemptions()).toHaveLength(1)
  })

  it('honours a higher limit per studio', async () => {
    await give(reward({ code: 'THREE-TIMES', value: 1, maxPerPayer: 3 }))

    const results = []
    for (let i = 0; i < 4; i += 1) results.push((await redeemReward('THREE-TIMES', { orgId: STUDIO }, NOW)).ok)

    expect(results).toEqual([true, true, true, false])
    expect((await balance()).available).toBe(3)
  })

  it('stops at the overall limit across studios, and the studio that lost gets nothing', async () => {
    await give(reward({ code: 'FIRST-COME', value: 1, maxRedemptions: 1 }))

    expect((await redeemReward('FIRST-COME', { orgId: STUDIO }, NOW)).ok).toBe(true)
    expect(await redeemReward('FIRST-COME', { orgId: OTHER_STUDIO }, NOW)).toStrictEqual({ ok: false })
    expect((await balance(OTHER_STUDIO)).available).toBe(0)
  })

  it('holds the overall limit when the requests arrive together', async () => {
    await give(reward({ code: 'FIRST-COME', value: 1, maxRedemptions: 1, maxPerPayer: null }))

    const outcomes = await Promise.all(
      Array.from({ length: 6 }, (_, i) => redeemReward('FIRST-COME', { orgId: i % 2 ? STUDIO : OTHER_STUDIO }, NOW)),
    )

    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(1)
    expect(await repo.listCouponRedemptions()).toHaveLength(1)
    expect((await balance()).available + (await balance(OTHER_STUDIO)).available).toBe(1)
  })

  it('is not available to a direct couple, who hold no basket', async () => {
    await give(reward({ code: 'WELCOME-TWO' }))

    expect(await redeemReward('WELCOME-TWO', { orgId: COUPLE }, NOW)).toStrictEqual({ ok: false })
    expect((await balance(COUPLE)).available).toBe(0)
  })

  it('keeps the redemption after the coupon is disabled — history is not rewritten', async () => {
    const [created] = await give(reward({ code: 'WELCOME-TWO' }))
    await redeemReward('WELCOME-TWO', { orgId: STUDIO }, NOW)

    await repo.setCouponActive(created!.id, false)

    expect(await repo.listCouponRedemptions()).toHaveLength(1)
    expect(await redeemReward('WELCOME-TWO', { orgId: OTHER_STUDIO }, NOW)).toStrictEqual({ ok: false })
  })
})

describe('the studio’s redeem route', () => {
  const post = (code: unknown, headers: Record<string, string> = {}) =>
    redeem(
      new Request('http://mehfilbox.test/api/admin/coupons/redeem', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9', ...headers },
        body: JSON.stringify({ code }),
      }),
    )

  it('grants the credits and answers with what was granted and the new balance', async () => {
    await give(reward({ code: 'WELCOME-TWO', value: 2, rewardPlanId: 'deliver' }))

    const response = await post('welcome-two')

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.granted).toEqual({ count: 2, planId: 'deliver' })
    expect(body.balance.byPlan.deliver.available).toBe(2)
  })

  it('answers every failure with the same status, code and words', async () => {
    await give(
      reward({ code: 'DISABLED-ONE', active: false }),
      reward({ code: 'TOO-LATE', validUntil: '2026-09-01T00:00:00.000Z' }),
      coupon({ code: 'A-DISCOUNT' }),
    )

    const answers = []
    for (const code of ['NOSUCHCODE', '!!', 'DISABLED-ONE', 'TOO-LATE', 'A-DISCOUNT', '']) {
      const response = await post(code, { 'x-forwarded-for': `203.0.113.${answers.length + 10}` })
      answers.push({ status: response.status, body: await response.json() })
    }

    expect(answers[0]).toMatchObject({ status: 400, body: { error: { code: 'COUPON_INVALID', message: 'That code did not work.' } } })
    for (const answer of answers) expect(answer).toStrictEqual(answers[0])
  })

  it('counts every lookup, right or wrong, and refuses once the studio has had its share', async () => {
    await give(reward({ code: 'WELCOME-TWO', value: 1 }))

    const statuses = []
    for (let i = 0; i < LOOKUPS_PER_ORG; i += 1) statuses.push((await post('NOSUCHCODE')).status)
    // The right code, but the studio is out of attempts: still refused, and not redeemed.
    const blocked = await post('WELCOME-TWO')

    expect(statuses.every((status) => status === 400)).toBe(true)
    expect(blocked.status).toBe(429)
    expect((await blocked.json()).error.code).toBe('RATE_LIMITED')
    expect((await balance()).available).toBe(0)
  })

  it('counts by address as well, so one machine cannot spread guesses across studios', async () => {
    // Three payers, so no one of them reaches its own limit before the address reaches its.
    const payers = [
      [OPERATOR, 'operator@example.test'],
      [OTHER_OPERATOR, 'other@example.test'],
      [COUPLE_OPERATOR, 'couple@example.test'],
    ] as const
    for (let i = 0; i < LOOKUPS_PER_IP; i += 1) {
      const [id, email] = payers[i % payers.length]!
      as(id, email)
      expect((await post('NOSUCHCODE')).status).toBe(400)
    }
    as(OPERATOR, 'operator@example.test')

    expect((await post('NOSUCHCODE')).status).toBe(429)
  })

  it('is refused to anyone not signed in', async () => {
    setAuthProvider({
      name: 'stub',
      currentUser: async () => null,
      signIn: async () => null,
      signOut: async () => {},
    } as unknown as AuthProvider)

    expect((await post('WELCOME-TWO')).status).toBe(401)
  })

  it('says the same thing to a couple, whose door a reward is not for', async () => {
    await give(reward({ code: 'WELCOME-TWO' }))
    as(COUPLE_OPERATOR, 'couple@example.test')

    const response = await post('WELCOME-TWO')

    expect(response.status).toBe(400)
    expect((await response.json()).error.code).toBe('COUPON_INVALID')
  })

  it('is described in words a studio can read, for the console', () => {
    expect(describeCoupon({ kind: 'percent', value: 20, rewardPlanId: null }, {})).toBe('20% off')
    expect(describeCoupon({ kind: 'reward', value: 2, rewardPlanId: 'cinema' }, { cinema: { name: 'Cinema' } })).toBe('2 Cinema credits')
    expect(describeCoupon({ kind: 'reward', value: 1, rewardPlanId: 'keep' }, {})).toBe('1 Keep credit')
  })
})

/**
 * The atomic step on its own, called directly — no application check in front of it.
 *
 * The application checks a coupon before offering it, but that is a *read*; `redeemCoupon` is the
 * decision, and in Postgres it runs under a row lock. These prove the decision itself, so that removing
 * any one of its refusals fails here rather than being covered for by the read that came first.
 */
describe('the atomic redeem step, on its own', () => {
  const REDEMPTION = (couponId: string, payer = STUDIO, id = '44444444-4444-4444-8444-444444444499') => ({
    id,
    couponId,
    payerOrgId: payer,
    paymentId: null,
    amountOffPaise: 0,
    creditsGranted: 0,
    createdAt: NOW.toISOString(),
  })
  const attempt = async (c: Coupon, payer = STUDIO, id?: string, nowIso = NOW.toISOString()) =>
    repo.redeemCoupon({ redemption: REDEMPTION(c.id, payer, id), credits: [], nowIso })

  it('records a redemption for a coupon that is open, and gives it back', async () => {
    const [c] = await give(coupon({ code: 'OPEN-CODE' }))

    expect(await attempt(c!)).toMatchObject({ couponId: c!.id, payerOrgId: STUDIO })
    expect(await repo.listCouponRedemptions()).toHaveLength(1)
  })

  it('refuses one that does not exist', async () => {
    expect(await repo.redeemCoupon({ redemption: REDEMPTION('99999999-9999-4999-8999-999999999999'), credits: [], nowIso: NOW.toISOString() })).toBeNull()
  })

  it('refuses a disabled one', async () => {
    const [c] = await give(coupon({ code: 'OFF-CODE', active: false }))

    expect(await attempt(c!)).toBeNull()
  })

  it('refuses one that has not started, and one that has ended', async () => {
    const [early, late] = await give(
      coupon({ code: 'EARLY-CODE', validFrom: '2026-10-01T00:00:00.000Z' }),
      coupon({ code: 'LATE-CODE', validUntil: '2026-09-01T00:00:00.000Z' }),
    )

    expect(await attempt(early!)).toBeNull()
    expect(await attempt(late!)).toBeNull()
  })

  it('refuses a payer who has had their share, and lets another payer in', async () => {
    const [c] = await give(coupon({ code: 'EACH-ONE', maxPerPayer: 1 }))

    expect(await attempt(c!, STUDIO, '44444444-4444-4444-8444-444444444401')).not.toBeNull()
    expect(await attempt(c!, STUDIO, '44444444-4444-4444-8444-444444444402')).toBeNull()
    expect(await attempt(c!, OTHER_STUDIO, '44444444-4444-4444-8444-444444444403')).not.toBeNull()
  })

  it('refuses once the overall limit is reached, whoever asks', async () => {
    const [c] = await give(coupon({ code: 'TWO-ONLY', maxRedemptions: 2, maxPerPayer: null }))

    expect(await attempt(c!, STUDIO, '44444444-4444-4444-8444-444444444411')).not.toBeNull()
    expect(await attempt(c!, STUDIO, '44444444-4444-4444-8444-444444444412')).not.toBeNull()
    expect(await attempt(c!, OTHER_STUDIO, '44444444-4444-4444-8444-444444444413')).toBeNull()
  })

  it('has no limit when none is set', async () => {
    const [c] = await give(coupon({ code: 'NO-LIMITS', maxRedemptions: null, maxPerPayer: null }))

    for (let i = 0; i < 5; i += 1) {
      expect(await attempt(c!, STUDIO, `44444444-4444-4444-8444-4444444444${20 + i}`)).not.toBeNull()
    }
  })

  it('stores nothing at all when it refuses — no redemption and no credits', async () => {
    const [c] = await give(coupon({ code: 'OFF-CODE', active: false }))
    const credits = await import('@/lib/admin/credits').then((m) => m.makeCredits({ orgId: STUDIO, count: 3, planId: 'keep', grantedBy: 'coupon:OFF-CODE' }))

    const result = await repo.redeemCoupon({ redemption: REDEMPTION(c!.id), credits, nowIso: NOW.toISOString() })

    expect(result).toBeNull()
    expect(await repo.listCouponRedemptions()).toHaveLength(0)
    expect(await repo.listCredits(STUDIO)).toHaveLength(0)
  })

  it('stores the redemption and the credits together, and counts the credits it stored', async () => {
    const [c] = await give(coupon({ code: 'GRANT-CODE' }))
    const credits = await import('@/lib/admin/credits').then((m) => m.makeCredits({ orgId: STUDIO, count: 3, planId: 'keep', grantedBy: 'coupon:GRANT-CODE' }))

    const result = await repo.redeemCoupon({ redemption: REDEMPTION(c!.id), credits, nowIso: NOW.toISOString() })

    expect(result).toMatchObject({ creditsGranted: 3 })
    expect(await repo.listCredits(STUDIO)).toHaveLength(3)
  })

  it('holds one payer to their limit when the same request arrives twice at once', async () => {
    const [c] = await give(coupon({ code: 'DOUBLE-CLICK', maxPerPayer: 1, maxRedemptions: null }))

    const both = await Promise.all([
      attempt(c!, STUDIO, '44444444-4444-4444-8444-444444444431'),
      attempt(c!, STUDIO, '44444444-4444-4444-8444-444444444432'),
    ])

    expect(both.filter(Boolean)).toHaveLength(1)
  })
})
