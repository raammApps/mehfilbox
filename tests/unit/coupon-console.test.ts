import { beforeEach, describe, expect, it } from 'vitest'
import * as couponRoute from '@/app/api/admin/platform/coupons/[id]/route'
import { POST as toggle } from '@/app/api/admin/platform/coupons/[id]/route'
import { POST as create } from '@/app/api/admin/platform/coupons/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { redeemReward } from '@/lib/admin/coupons'
import { normalizeCode, windowOpen } from '@/lib/coupons'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'

/**
 * N-121 — the platform console's two writes on a coupon: create it, and switch it off (or on again).
 *
 * What matters: only a platform admin can (to anyone else the routes do not exist), a coupon that the
 * database's check constraints would refuse is refused here first with a sentence, dates are days in
 * India's timezone, every change is on the audit trail — and there is no way to delete one, because a
 * code somebody redeemed is history.
 */

const STUDIO = '11111111-1111-4111-8111-11111111111a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const ADMIN = '00000000-0000-4000-8000-00000000000a'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository

function signedInAs(id: string, email: string): AuthProvider {
  return {
    name: 'stub',
    currentUser: async () => ({ id, email }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider
}
const asAdmin = () => setAuthProvider(signedInAs(ADMIN, 'root@mehfilbox.test'))
const asOperator = () => setAuthProvider(signedInAs(OPERATOR, 'operator@example.test'))

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.plans = structuredClone(SEED_PLANS)
  snapshot.orgs.push(orgSchema.parse({ id: STUDIO, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }))
  snapshot.operators.push(
    operatorSchema.parse({ id: OPERATOR, orgId: STUDIO, email: 'operator@example.test', name: 'Op', role: 'admin', passwordHash: '', createdAt: AT }),
  )
  snapshot.platformAdmins.push(
    platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  asAdmin()
})

const post = (body: unknown) =>
  create(
    new Request('http://mehfilbox.test/api/admin/platform/coupons', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )

const percent = (over: Record<string, unknown> = {}) => ({
  code: 'spring-26',
  kind: 'percent',
  value: 20,
  campaign: 'Spring 2026',
  ...over,
})

const flip = (id: string, active: unknown) =>
  toggle(
    new Request(`http://mehfilbox.test/api/admin/platform/coupons/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ active }),
    }),
    { params: Promise.resolve({ id }) },
  )

describe('who may make a coupon', () => {
  it('is a 404 to an operator, and nothing is created', async () => {
    asOperator()

    expect((await post(percent())).status).toBe(404)
    expect(await repo.listCoupons()).toHaveLength(0)
  })

  it('is a 404 to anyone signed out', async () => {
    setAuthProvider({ name: 'stub', currentUser: async () => null, signIn: async () => null, signOut: async () => {} } as unknown as AuthProvider)

    expect((await post(percent())).status).toBe(404)
  })
})

describe('creating one', () => {
  it('stores the code upper-case, with the campaign, the creator and one use per studio unless told otherwise', async () => {
    const response = await post(percent())

    expect(response.status).toBe(201)
    const { coupon } = await response.json()
    expect(coupon).toMatchObject({
      code: 'SPRING-26',
      kind: 'percent',
      value: 20,
      campaign: 'Spring 2026',
      createdBy: 'root@mehfilbox.test',
      active: true,
      maxPerPayer: 1,
      maxRedemptions: null,
      doors: ['studio', 'couple'],
      planIds: [],
    })
    expect(await repo.getCouponByCode('SPRING-26')).toMatchObject({ id: coupon.id })
  })

  it('makes a random code when none is typed, and it is a valid one', async () => {
    const { coupon } = await (await post(percent({ code: '' }))).json()
    const { coupon: other } = await (await post(percent({ code: undefined }))).json()

    expect(normalizeCode(coupon.code)).toBe(coupon.code)
    expect(coupon.code).not.toBe(other.code)
  })

  it('records it on the audit trail, with the code', async () => {
    await post(percent())

    const [entry] = await repo.listPlatformAudit({ limit: 5 })
    expect(entry).toMatchObject({ action: 'coupon.create', actorEmail: 'root@mehfilbox.test' })
    expect(entry!.detail).toMatchObject({ code: 'SPRING-26', kind: 'percent', value: 20, campaign: 'Spring 2026' })
  })

  it('can be limited to some products, doors, a count and a count each', async () => {
    const { coupon } = await (
      await post(percent({ planIds: ['keep'], doors: ['couple'], maxRedemptions: 50, maxPerPayer: 2 }))
    ).json()

    expect(coupon).toMatchObject({ planIds: ['keep'], doors: ['couple'], maxRedemptions: 50, maxPerPayer: 2 })
  })

  it('treats a null per-payer limit as no limit, and an unsaid one as one', async () => {
    expect((await (await post(percent({ code: 'NO-LIMIT-1', maxPerPayer: null }))).json()).coupon.maxPerPayer).toBeNull()
    expect((await (await post(percent({ code: 'DEFAULT-ONE' }))).json()).coupon.maxPerPayer).toBe(1)
  })
})

describe('a reward', () => {
  it('is forced to studios only, whatever the request says, and grants the plan it names', async () => {
    const response = await post({ code: 'WELCOME-2', kind: 'reward', value: 2, rewardPlanId: 'cinema', campaign: 'Welcome' })

    expect(response.status).toBe(201)
    expect((await response.json()).coupon).toMatchObject({ kind: 'reward', rewardPlanId: 'cinema', doors: ['studio'], planIds: [] })
  })

  it('ignores doors and products sent with it, since neither means anything to a reward', async () => {
    const { coupon } = await (
      await post({ code: 'WELCOME-2', kind: 'reward', value: 1, rewardPlanId: 'keep', campaign: 'Welcome', doors: ['couple'], planIds: ['deliver'] })
    ).json()

    expect(coupon).toMatchObject({ doors: ['studio'], planIds: [] })
  })

  it('refuses one that does not say which credit', async () => {
    const response = await post({ code: 'WELCOME-2', kind: 'reward', value: 2, campaign: 'Welcome' })

    expect(response.status).toBe(400)
    expect((await response.json()).error.fields.rewardPlanId).toMatch(/which credit/)
  })

  it('can then be redeemed by a studio — the console and the redeem path agree', async () => {
    await post({ code: 'WELCOME-2', kind: 'reward', value: 2, rewardPlanId: 'deliver', campaign: 'Welcome' })

    expect(await redeemReward('welcome-2', { orgId: STUDIO })).toMatchObject({ ok: true, count: 2, planId: 'deliver' })
  })
})

describe('what it refuses, with a sentence', () => {
  it.each([
    ['a percentage over a hundred', percent({ value: 101 }), 'value'],
    ['a reward over the ceiling', { code: 'BIG-REWARD', kind: 'reward', value: 51, rewardPlanId: 'keep', campaign: 'x' }, 'value'],
    ['no campaign', percent({ campaign: '   ' }), 'campaign'],
    ['a code that is too short', percent({ code: 'ABC' }), 'code'],
    ['a code with a space in it', percent({ code: 'SPRING 26' }), 'code'],
    ['an end before its start', percent({ validFrom: '2026-10-01', validUntil: '2026-09-01' }), 'validUntil'],
    ['a date that is not a date', percent({ validUntil: 'next week' }), 'validUntil'],
    ['a product that is not on the price list', percent({ planIds: ['keep', 'platinum'] }), 'planIds'],
    ['a kind that does not exist', percent({ kind: 'bogo' }), 'kind'],
    ['a limit of zero', percent({ maxRedemptions: 0 }), 'maxRedemptions'],
  ])('%s', async (_what, body, field) => {
    const response = await post(body)

    expect(response.status).toBe(400)
    expect(Object.keys((await response.json()).error.fields)).toContain(field)
    expect(await repo.listCoupons()).toHaveLength(0)
  })

  it('a code somebody already has, in any letter case', async () => {
    await post(percent({ code: 'SPRING-26' }))

    const response = await post(percent({ code: 'spring-26', campaign: 'Another' }))

    expect(response.status).toBe(400)
    expect((await response.json()).error.fields.code).toMatch(/already/)
    expect(await repo.listCoupons()).toHaveLength(1)
  })
})

describe('a window is days in India', () => {
  it('starts at midnight in India and ends at the end of the last day there', async () => {
    const { coupon } = await (await post(percent({ validFrom: '2026-09-20', validUntil: '2026-09-30' }))).json()

    // 20 September 00:00 IST is 19 September 18:30 UTC.
    expect(windowOpen(coupon, new Date('2026-09-19T18:29:59.999Z'))).toBe(false)
    expect(windowOpen(coupon, new Date('2026-09-19T18:30:00.000Z'))).toBe(true)
    // 30 September 23:59:59.999 IST is 18:29:59.999 UTC the same day — the whole of the 30th counts.
    expect(windowOpen(coupon, new Date('2026-09-30T18:29:59.999Z'))).toBe(true)
    expect(windowOpen(coupon, new Date('2026-09-30T18:30:00.000Z'))).toBe(false)
  })

  it('may be open at either end', async () => {
    const { coupon } = await (await post(percent({ code: 'OPEN-ENDED' }))).json()

    expect(coupon).toMatchObject({ validFrom: null, validUntil: null })
  })
})

describe('switching one off, and on again', () => {
  const made = async () => (await (await post(percent())).json()).coupon as { id: string }

  it('stops new redemptions and is on the audit trail', async () => {
    await post({ code: 'WELCOME-2', kind: 'reward', value: 1, rewardPlanId: 'deliver', campaign: 'Welcome' })
    const { id } = (await repo.getCouponByCode('WELCOME-2'))!

    expect((await flip(id, false)).status).toBe(200)

    expect(await redeemReward('WELCOME-2', { orgId: STUDIO })).toStrictEqual({ ok: false })
    const audit = await repo.listPlatformAudit({ limit: 5 })
    expect(audit.map((entry) => entry.action)).toContain('coupon.disable')
    expect(audit.find((entry) => entry.action === 'coupon.disable')!.detail).toMatchObject({ code: 'WELCOME-2', was: true })
  })

  it('can be switched back on, and says so on the audit trail', async () => {
    const { id } = await made()
    await flip(id, false)

    await flip(id, true)

    expect((await repo.getCoupon(id))?.active).toBe(true)
    expect((await repo.listPlatformAudit({ limit: 5 })).map((entry) => entry.action)).toContain('coupon.enable')
  })

  it('leaves what was redeemed exactly where it was', async () => {
    await post({ code: 'WELCOME-2', kind: 'reward', value: 2, rewardPlanId: 'deliver', campaign: 'Welcome' })
    const { id } = (await repo.getCouponByCode('WELCOME-2'))!
    await redeemReward('WELCOME-2', { orgId: STUDIO })

    await flip(id, false)

    expect(await repo.listCouponRedemptions()).toHaveLength(1)
    expect((await repo.creditBalance(STUDIO, new Date().toISOString())).available).toBe(2)
  })

  it('is a 404 for a coupon that does not exist, and to an operator', async () => {
    const { id } = await made()

    expect((await flip('99999999-9999-4999-8999-999999999999', false)).status).toBe(404)
    asOperator()
    expect((await flip(id, false)).status).toBe(404)
    expect((await repo.getCoupon(id))?.active).toBe(true)
  })

  it('needs a yes or a no', async () => {
    const { id } = await made()

    expect((await flip(id, 'maybe')).status).toBe(400)
  })

  it('has no way to delete one — the route offers switching off and nothing else', () => {
    expect(Object.keys(couponRoute).filter((name) => /^(GET|PUT|PATCH|DELETE)$/.test(name))).toEqual([])
    expect(typeof (repo as unknown as Record<string, unknown>).deleteCoupon).toBe('undefined')
  })
})
