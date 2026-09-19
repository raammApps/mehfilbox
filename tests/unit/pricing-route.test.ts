import { beforeEach, describe, expect, it } from 'vitest'
import { POST as changePricing } from '@/app/api/admin/platform/pricing/[id]/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { MAX_PRICE_PAISE } from '@/lib/plans'
import { operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'

/**
 * N-118, D-61 — the route that edits the price list. Three properties matter and each is proven
 * here: only a platform admin can change a price, every accepted change is on the audit trail with
 * what it was and what it became, and a typo cannot reach a live price.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
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

function anonymous(): AuthProvider {
  return {
    name: 'stub',
    currentUser: async () => null,
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider
}

async function change(id: string, body: unknown): Promise<Response> {
  return changePricing(
    new Request(`http://mehfilbox.test/api/admin/platform/pricing/${id}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  )
}

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.plans = structuredClone(SEED_PLANS)
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
  snapshot.platformAdmins.push(
    platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  setAuthProvider(signedInAs(ADMIN, 'root@mehfilbox.test'))
})

describe('who may change a price', () => {
  it('lets a platform admin, and no one else', async () => {
    expect((await change('deliver', { pricePaise: 249900 })).status).toBe(200)

    for (const who of [signedInAs(OPERATOR, 'operator@example.test'), anonymous()]) {
      setAuthProvider(who)
      // Not found rather than forbidden, so probing the endpoint teaches nothing.
      expect((await change('deliver', { pricePaise: 1 })).status).toBe(404)
    }
    expect((await repo.getPlan('deliver'))?.pricePaise).toBe(249900)
  })
})

describe('changing a price', () => {
  it('sets it, and the next read of the price list sees it', async () => {
    await change('keep', { pricePaise: 650000 })

    expect((await repo.getPlan('keep'))?.pricePaise).toBe(650000)
  })

  it('writes the audit row with what it was, what it became, and why', async () => {
    await change('deliver', { pricePaise: 149900, reason: 'festival offer' })

    const [entry] = await repo.listPlatformAudit({ limit: 1 })
    expect(entry).toMatchObject({
      action: 'pricing.set',
      actorEmail: 'root@mehfilbox.test',
      detail: {
        planId: 'deliver',
        name: 'Deliver',
        unit: 'each',
        from: 199900,
        to: 149900,
        // Legible in a year without knowing what a paisa column is.
        fromRupees: '₹1,999',
        toRupees: '₹1,499',
        reason: 'festival offer',
      },
    })
  })

  it('takes a product off sale with null, audited as its own action', async () => {
    const response = await change('keep', { pricePaise: null })

    expect(response.status).toBe(200)
    expect((await repo.getPlan('keep'))?.pricePaise).toBeNull()
    expect((await repo.listPlatformAudit({ limit: 1 }))[0]).toMatchObject({
      action: 'pricing.clear',
      detail: { from: 600000, to: null, fromRupees: '₹6,000', toRupees: null },
    })
  })

  it('cannot create a product from a typo in a URL', async () => {
    const before = (await repo.listPlans()).length

    expect((await change('made-up', { pricePaise: 100 })).status).toBe(404)
    expect((await repo.listPlans()).length).toBe(before)
    expect(await repo.listPlatformAudit({ limit: 5 })).toHaveLength(0)
  })

  it('records nothing and changes nothing when the request is refused', async () => {
    await change('deliver', { pricePaise: -1 })

    expect((await repo.getPlan('deliver'))?.pricePaise).toBe(199900)
    expect(await repo.listPlatformAudit({ limit: 5 })).toHaveLength(0)
  })
})

describe('a typo cannot reach a live price', () => {
  it.each([
    ['a negative price', { pricePaise: -100 }],
    ['fractional paise', { pricePaise: 1999.5 }],
    ['a price above the ceiling — the extra zero', { pricePaise: MAX_PRICE_PAISE + 1 }],
    ['a string where a number belongs', { pricePaise: '1999' }],
    ['nothing at all', {}],
    ['two changes in one request, which would make an audit row say two things', { pricePaise: 100, grants: { deliver: 1 } }],
  ])('refuses %s', async (_label, body) => {
    expect((await change('deliver', body)).status).toBe(400)
    expect((await repo.getPlan('deliver'))?.pricePaise).toBe(199900)
  })

  it('accepts the ceiling itself and zero, which is a price and not "off sale"', async () => {
    expect((await change('deliver', { pricePaise: MAX_PRICE_PAISE })).status).toBe(200)
    expect((await change('deliver', { pricePaise: 0 })).status).toBe(200)
    expect((await repo.getPlan('deliver'))?.pricePaise).toBe(0)
  })
})

describe('the credit bundle', () => {
  it('replaces the Studio plan’s bundle and audits it', async () => {
    const response = await change('studio', { grants: { deliver: 3, keep: 1 }, reason: 'launch offer' })

    expect(response.status).toBe(200)
    expect((await repo.getPlan('studio'))?.grants).toEqual({ deliver: 3, keep: 1 })
    expect((await repo.listPlatformAudit({ limit: 1 }))[0]).toMatchObject({
      action: 'pricing.grants.set',
      detail: { from: { deliver: 2, cinema: 1 }, to: { deliver: 3, keep: 1 }, reason: 'launch offer' },
    })
  })

  it('refuses a bundle on anything but the Studio plan, which alone grants credits', async () => {
    expect((await change('deliver', { grants: { deliver: 1 } })).status).toBe(400)
    expect((await repo.getPlan('deliver'))?.grants).toEqual({})
  })

  it('refuses a credit for a plan that is not a duration plan', async () => {
    expect((await change('studio', { grants: { light: 1 } })).status).toBe(400)
    expect((await repo.getPlan('studio'))?.grants).toEqual({ deliver: 2, cinema: 1 })
  })

  it('refuses a silly quantity', async () => {
    expect((await change('studio', { grants: { deliver: 1000 } })).status).toBe(400)
  })
})

describe('the suggested-retail range', () => {
  it('sets it, audits it, and clears it', async () => {
    expect((await change('keep', { retail: { minPaise: 1_000_000, maxPaise: 2_500_000 } })).status).toBe(200)
    expect((await repo.getPlan('keep'))?.retailMaxPaise).toBe(2_500_000)

    expect((await change('keep', { retail: null })).status).toBe(200)
    expect((await repo.getPlan('keep'))?.retailMinPaise).toBeNull()

    // The set of actions, not "the newest": two rows written in the same millisecond tie on
    // `createdAt`, and which one a driver lists first is then not a promise anyone made. An earlier
    // draft read `[0]` here and passed only while the process was cold enough to straddle a tick.
    const actions = (await repo.listPlatformAudit({ limit: 5 })).map((entry) => entry.action)
    expect([...actions].sort()).toEqual(['pricing.retail.clear', 'pricing.retail.set'])
  })

  it('refuses a range that runs backwards', async () => {
    expect((await change('keep', { retail: { minPaise: 2_000_000, maxPaise: 1_000_000 } })).status).toBe(400)
    expect((await repo.getPlan('keep'))?.retailMinPaise).toBe(1_500_000)
  })
})
