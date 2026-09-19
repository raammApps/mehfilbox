import { beforeEach, describe, expect, it } from 'vitest'
import { PATCH as patchCatalogue } from '@/app/api/admin/catalogues/[id]/route'
import { DELETE as unpublish, POST as publish } from '@/app/api/admin/catalogues/[id]/publish/route'
import { POST as createCatalogue } from '@/app/api/admin/catalogues/route'
import { POST as requestCredit } from '@/app/api/admin/credits/request/route'
import { POST as grant } from '@/app/api/admin/platform/orgs/[id]/credits/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { makeCredits } from '@/lib/admin/credits'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { CREDIT_PLAN_IDS, type CreditPlanId } from '@/lib/plans'
import { catalogueSchema, operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'

/**
 * N-119, D-61 — a studio's credits are typed, and a wedding is published on the plan it is on.
 *
 * The sentences a studio would say: "I have Deliver credits, this wedding is Cinema, so I cannot
 * publish it — and it tells me so, by name"; "I changed its plan and now I can"; "once it is live,
 * that is what it was published on". Each is a test, and the refusal tests also prove that nothing
 * was spent, because a refused publish that quietly ate a credit is the worse bug.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const OTHER_ORG = '11111111-1111-4111-8111-11111111111b'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const OTHER_OPERATOR = '00000000-0000-4000-8000-000000000002'
const ADMIN = '00000000-0000-4000-8000-00000000000a'
const KEEP = '22222222-2222-4222-8222-22222222222a'
const CINEMA = '22222222-2222-4222-8222-22222222222b'
const DELIVER = '22222222-2222-4222-8222-22222222222c'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository
let slugs = 0

function catalogue(id: string, slug: string, planId: CreditPlanId) {
  return catalogueSchema.parse({
    id,
    orgId: ORG,
    tenantSlug: 'kalyanam',
    slug,
    coupleName: { en: slug },
    appName: { en: `${slug} Originals` },
    weddingDate: '2026-02-14',
    includedUntil: '2027-02-14',
    createdAt: AT,
    planId,
  })
}

function signedInAs(id: string, email: string): AuthProvider {
  return {
    name: 'stub',
    currentUser: async () => ({ id, email }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider
}

const asOperator = () => setAuthProvider(signedInAs(OPERATOR, 'operator@example.test'))
const asOtherStudio = () => setAuthProvider(signedInAs(OTHER_OPERATOR, 'other@example.test'))
const asAdmin = () => setAuthProvider(signedInAs(ADMIN, 'root@mehfilbox.test'))

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.plans = structuredClone(SEED_PLANS)
  snapshot.orgs.push(
    orgSchema.parse({ id: ORG, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }),
    orgSchema.parse({ id: OTHER_ORG, name: 'Other Studio', slug: 'other', createdAt: AT }),
  )
  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: ORG,
      email: 'operator@example.test',
      name: 'Operator',
      role: 'admin',
      passwordHash: '',
      createdAt: AT,
    }),
    operatorSchema.parse({
      id: OTHER_OPERATOR,
      orgId: OTHER_ORG,
      email: 'other@example.test',
      name: 'Other',
      role: 'admin',
      passwordHash: '',
      createdAt: AT,
    }),
  )
  snapshot.platformAdmins.push(
    platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }),
  )
  snapshot.catalogues.push(
    catalogue(KEEP, 'keep-wedding', 'keep'),
    catalogue(CINEMA, 'cinema-wedding', 'cinema'),
    catalogue(DELIVER, 'deliver-wedding', 'deliver'),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  asOperator()
})

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const publishOf = (id: string) =>
  publish(new Request(`http://mehfilbox.test/api/admin/catalogues/${id}/publish`, { method: 'POST' }), params(id))
const unpublishOf = (id: string) =>
  unpublish(new Request(`http://mehfilbox.test/api/admin/catalogues/${id}/publish`, { method: 'DELETE' }), params(id))
const balance = () => repo.creditBalance(ORG, new Date().toISOString())
const give = (planId: CreditPlanId, count = 1, now?: Date) =>
  repo.grantCredits(makeCredits({ orgId: ORG, count, planId, grantedBy: 'test', now }))

function json(url: string, method: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const changePlan = (id: string, planId: unknown) =>
  patchCatalogue(json(`http://mehfilbox.test/api/admin/catalogues/${id}`, 'PATCH', { planId }), params(id))

describe('publishing spends a credit of the wedding’s own plan', () => {
  it('spends a Keep credit for a Keep wedding and leaves the Deliver one alone', async () => {
    await give('deliver')
    await give('keep')

    expect((await publishOf(KEEP)).status).toBe(200)

    const spent = (await repo.listCredits(ORG)).filter((credit) => credit.consumedAt !== null)
    expect(spent).toHaveLength(1)
    expect(spent[0]).toMatchObject({ planId: 'keep', consumedByCatalogueId: KEEP })
    expect((await balance()).byPlan).toMatchObject({
      deliver: { available: 1, consumed: 0 },
      keep: { available: 0, consumed: 1 },
      cinema: { available: 0, consumed: 0 },
    })
  })

  it('refuses a Cinema wedding while Deliver credits are held — naming both, spending nothing', async () => {
    await give('deliver', 2)

    const refused = await publishOf(CINEMA)

    expect(refused.status).toBe(402)
    const { error } = await refused.json()
    expect(error.code).toBe('CREDIT_REQUIRED')
    // Names the plan the wedding is on, and points at the basket that could pay for it.
    expect(error.message).toContain('Cinema')
    expect(error.message).toContain('2 Deliver credits')
    expect(error.message).toContain('change this wedding')
    // The wedding is untouched and so is every credit.
    expect((await repo.getCatalogue(CINEMA, ORG))?.status).toBe('draft')
    expect(await balance()).toMatchObject({ available: 2, consumed: 0 })
  })

  it('offers no way forward it does not have: with nothing held, it only says what is missing', async () => {
    const refused = await publishOf(CINEMA)

    expect(refused.status).toBe(402)
    const { error } = await refused.json()
    expect(error.message).toContain('no Cinema credits left')
    expect(error.message).not.toContain('You do have')
  })

  it('does not offer a basket whose credits have all expired', async () => {
    await give('deliver', 1, new Date('2024-01-01T00:00:00.000Z')) // two years ago

    const { error } = await (await publishOf(KEEP)).json()

    expect(error.message).toContain('no Keep credits left')
    expect(error.message).not.toContain('You do have')
  })

  it('takes the soonest-to-expire credit within the plan, never one from another plan', async () => {
    // A Deliver credit that expires before either Keep credit — it must still be left alone.
    await give('deliver', 1, new Date('2026-01-01T00:00:00.000Z'))
    const later = makeCredits({
      orgId: ORG,
      count: 1,
      planId: 'keep',
      grantedBy: 'later',
      now: new Date('2026-06-01T00:00:00.000Z'),
    })
    const sooner = makeCredits({
      orgId: ORG,
      count: 1,
      planId: 'keep',
      grantedBy: 'sooner',
      now: new Date('2026-03-01T00:00:00.000Z'),
    })
    await repo.grantCredits([...later, ...sooner])

    expect((await publishOf(KEEP)).status).toBe(200)

    const spent = (await repo.listCredits(ORG)).filter((credit) => credit.consumedAt !== null)
    expect(spent.map((credit) => credit.grantedBy)).toEqual(['sooner'])
    expect((await balance()).byPlan.deliver.available).toBe(1)
  })

  it('lets the studio change the plan, and then publishes on the credit it holds', async () => {
    await give('deliver')
    expect((await publishOf(KEEP)).status).toBe(402)

    expect((await changePlan(KEEP, 'deliver')).status).toBe(200)
    expect((await publishOf(KEEP)).status).toBe(200)

    expect((await repo.listCredits(ORG))[0]).toMatchObject({ planId: 'deliver', consumedByCatalogueId: KEEP })
  })

  it('republishing after an unpublish spends nothing, of any plan', async () => {
    await give('keep')
    await give('deliver')
    expect((await publishOf(KEEP)).status).toBe(200)
    expect((await unpublishOf(KEEP)).status).toBe(200)
    expect((await publishOf(KEEP)).status).toBe(200)

    expect(await balance()).toMatchObject({ available: 1, consumed: 1 })
  })
})

describe('the balance is a basket per plan', () => {
  it('always has all three baskets, empty ones included, and they add up to the total', async () => {
    const empty = await balance()
    expect(Object.keys(empty.byPlan).sort()).toEqual([...CREDIT_PLAN_IDS].sort())
    expect(empty.byPlan.cinema).toEqual({ available: 0, consumed: 0, expired: 0 })

    await give('deliver', 2)
    await give('cinema', 1)
    await give('keep', 1, new Date('2024-01-01T00:00:00.000Z')) // expired
    await publishOf(DELIVER)

    const now = await balance()
    expect(now.byPlan.deliver).toEqual({ available: 1, consumed: 1, expired: 0 })
    expect(now.byPlan.keep).toEqual({ available: 0, consumed: 0, expired: 1 })
    expect(now.byPlan.cinema).toEqual({ available: 1, consumed: 0, expired: 0 })
    for (const key of ['available', 'consumed', 'expired'] as const) {
      const sum = CREDIT_PLAN_IDS.reduce((total, id) => total + now.byPlan[id][key], 0)
      expect(sum).toBe(now[key])
    }
  })
})

describe('choosing the plan when a wedding is made', () => {
  const create = async (extra: Record<string, unknown>) => {
    const response = await createCatalogue(
      json('http://mehfilbox.test/api/admin/catalogues', 'POST', {
        coupleName: { en: 'Aanya & Vikram' },
        appName: { en: 'Aanya & Vikram Originals' },
        weddingDate: '2026-02-14',
        slug: `aanya-vikram-${++slugs}`,
        ...extra,
      }),
    )
    return { status: response.status, body: await response.json() }
  }

  it('is Deliver when nothing is said — what every catalogue was before there was a choice', async () => {
    const { status, body } = await create({})
    expect(status).toBe(201)
    expect(body.catalogue.planId).toBe('deliver')
  })

  it.each(['keep', 'cinema'] as const)('records %s when it is chosen', async (planId) => {
    const { status, body } = await create({ planId })
    expect(status).toBe(201)
    expect((await repo.getCatalogue(body.catalogue.id, ORG))?.planId).toBe(planId)
  })

  // `light` is a *storage* tier — the other ladder — and the two must not be confusable.
  it.each(['light', 'premium', ''])('refuses %j, which is not a credit plan', async (planId) => {
    expect((await create({ planId })).status).toBe(400)
  })
})

describe('changing the plan afterwards', () => {
  it('is allowed while the wedding has never been published', async () => {
    const response = await changePlan(DELIVER, 'cinema')

    expect(response.status).toBe(200)
    expect((await repo.getCatalogue(DELIVER, ORG))?.planId).toBe('cinema')
  })

  it('is refused once it has been published — publishing spent a credit of that plan', async () => {
    await give('deliver')
    await publishOf(DELIVER)

    const response = await changePlan(DELIVER, 'cinema')

    expect(response.status).toBe(400)
    expect((await response.json()).error.fields).toMatchObject({ planId: expect.stringContaining('Fixed') })
    expect((await repo.getCatalogue(DELIVER, ORG))?.planId).toBe('deliver')
  })

  it('stays refused after an unpublish, because `publishedAt` is what remembers', async () => {
    await give('deliver')
    await publishOf(DELIVER)
    await unpublishOf(DELIVER)

    expect((await changePlan(DELIVER, 'keep')).status).toBe(400)
    expect((await repo.getCatalogue(DELIVER, ORG))?.planId).toBe('deliver')
  })

  it('does not object to being sent the plan it already has — that is not a change', async () => {
    await give('deliver')
    await publishOf(DELIVER)

    expect((await changePlan(DELIVER, 'deliver')).status).toBe(200)
  })

  it('refuses a plan that does not exist, and leaves the one it had', async () => {
    expect((await changePlan(KEEP, 'platinum')).status).toBe(400)
    expect((await repo.getCatalogue(KEEP, ORG))?.planId).toBe('keep')
  })

  it('is a 404 to another studio, which is not told the wedding exists', async () => {
    asOtherStudio()

    expect((await changePlan(KEEP, 'cinema')).status).toBe(404)
    expect((await repo.getCatalogue(KEEP, ORG))?.planId).toBe('keep')
  })
})

describe('the platform grants into a basket', () => {
  const grantTo = (body: unknown) =>
    grant(json(`http://mehfilbox.test/api/admin/platform/orgs/${ORG}/credits`, 'POST', body), params(ORG))

  it('puts them where it was told, and writes the basket on the audit row', async () => {
    asAdmin()

    const response = await grantTo({ count: 3, planId: 'cinema', reason: 'Paid by transfer' })

    expect(response.status).toBe(201)
    expect((await response.json()).balance.byPlan.cinema).toEqual({ available: 3, consumed: 0, expired: 0 })
    const audit = await repo.listPlatformAudit({ orgId: ORG, limit: 5 })
    expect(audit[0]!.detail).toMatchObject({ count: 3, planId: 'cinema', reason: 'Paid by transfer' })
    expect((await repo.listCredits(ORG)).every((credit) => credit.planId === 'cinema')).toBe(true)
  })

  it('is Deliver when the basket is not named, as every grant was before there were three', async () => {
    asAdmin()

    const response = await grantTo({ count: 2, reason: 'Old form, no plan' })

    expect(response.status).toBe(201)
    expect((await response.json()).balance.byPlan.deliver.available).toBe(2)
  })

  it('refuses a basket that does not exist, granting nothing', async () => {
    asAdmin()

    expect((await grantTo({ count: 2, planId: 'light', reason: 'typo' })).status).toBe(400)
    expect(await repo.listCredits(ORG)).toHaveLength(0)
    expect(await repo.listPlatformAudit({ orgId: ORG, limit: 5 })).toHaveLength(0)
  })

  it('lets the studio publish the wedding the credit was for, and no other', async () => {
    asAdmin()
    await grantTo({ count: 1, planId: 'cinema', reason: 'Cinema wedding' })
    asOperator()

    expect((await publishOf(KEEP)).status).toBe(402)
    expect((await publishOf(CINEMA)).status).toBe(200)
  })
})

describe('asking for a credit names the plan that is short', () => {
  const ask = (catalogueId: string) =>
    requestCredit(json('http://mehfilbox.test/api/admin/credits/request', 'POST', { catalogueId }))

  it('says which plan the wedding is on and what the studio does hold', async () => {
    await give('deliver', 2)

    expect((await ask(CINEMA)).status).toBe(200)

    const [message] = await repo.listQueuedNotifications(10)
    expect(message!.bodyText).toContain('has no Cinema credit left')
    expect(message!.bodyText).toContain('2 Deliver credits')
  })

  it('is once a day per plan, not once a day per studio — Keep short and Cinema short are two asks', async () => {
    const first = await (await ask(KEEP)).json()
    const again = await (await ask(KEEP)).json()
    const other = await (await ask(CINEMA)).json()

    expect(first.repeated).toBe(false)
    expect(again.repeated).toBe(true)
    expect(other.repeated).toBe(false)
    expect(await repo.listQueuedNotifications(10)).toHaveLength(2)
  })

  it('still reads as a sentence when the price list could not be read', async () => {
    // The fallback is the id capitalised, which is what the three plans are actually called.
    const snapshot = emptySnapshot()
    snapshot.orgs.push(orgSchema.parse({ id: ORG, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }))
    snapshot.operators.push(
      operatorSchema.parse({
        id: OPERATOR,
        orgId: ORG,
        email: 'operator@example.test',
        name: 'Operator',
        role: 'admin',
        passwordHash: '',
        createdAt: AT,
      }),
    )
    snapshot.catalogues.push(catalogue(CINEMA, 'cinema-wedding', 'cinema'))
    repo = new MemoryRepository(snapshot)
    setRepository(repo)

    await ask(CINEMA)

    const [message] = await repo.listQueuedNotifications(10)
    expect(message!.bodyText).toContain('has no Cinema credit left')
  })
})
