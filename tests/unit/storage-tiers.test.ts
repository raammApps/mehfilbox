import { beforeEach, describe, expect, it } from 'vitest'
import { POST as createCatalogue } from '@/app/api/admin/catalogues/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { DEFAULT_LIMITS, resolveLimits, storageTierFor, STORAGE_TIERS } from '@/lib/entitlements'
import { operatorSchema, orgSchema } from '@/lib/schema'

/**
 * The storage ladder, sized per occasion (D-60, N-80) — coexists with the duration ladder rather
 * than replacing it, and a catalogue nobody picks a tier for must behave exactly as it always
 * has, since the field is optional and this ships with real studios already relying on the
 * default. What matters here: choosing a tier writes a grant `resolveLimits` already knows how
 * to prefer (no change needed there), and not choosing one changes nothing.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository
let slugs = 0

beforeEach(() => {
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
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  setAuthProvider({
    name: 'stub',
    currentUser: async () => ({ id: OPERATOR, email: 'operator@example.test' }),
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider)
})

async function create(extra: Record<string, unknown>) {
  const response = await createCatalogue(
    new Request('http://mehfilbox.test/api/admin/catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        coupleName: { en: 'Aanya & Vikram' },
        appName: { en: 'Aanya & Vikram Originals' },
        weddingDate: '2026-02-14',
        slug: `aanya-vikram-${++slugs}`,
        ...extra,
      }),
    }),
  )
  return { status: response.status, body: await response.json() }
}

describe('storageTierFor', () => {
  it('names a known tier', () => {
    expect(storageTierFor('light')).toMatchObject({ name: 'Light', storageGb: 5 })
  })

  it('answers null for anything else, including no tier at all', () => {
    expect(storageTierFor('nope')).toBeNull()
    expect(storageTierFor(null)).toBeNull()
  })
})

describe('choosing a tier at creation', () => {
  it('grants the catalogue its own storage, which resolveLimits prefers over the org and the default', async () => {
    const { status, body } = await create({ tierId: 'light' })
    expect(status).toBe(201)

    const grants = await repo.getEntitlements(body.catalogue.id, ORG)
    expect(grants.catalogue).toMatchObject({ planId: 'light', storageGb: 5 })
    expect(resolveLimits(grants.catalogue, grants.org).storageGb).toBe(5)
  })

  it('refuses a tier id that is not one of the three', async () => {
    expect((await create({ tierId: 'unlimited' })).status).toBe(400)
  })

  it('every real tier round-trips', async () => {
    for (const tier of STORAGE_TIERS) {
      const { body } = await create({ tierId: tier.id })
      const grants = await repo.getEntitlements(body.catalogue.id, ORG)
      expect(grants.catalogue?.storageGb).toBe(tier.storageGb)
    }
  })
})

describe('leaving the tier unset', () => {
  it('writes no catalogue-level grant at all, and the default applies exactly as before', async () => {
    const { status, body } = await create({})
    expect(status).toBe(201)

    const grants = await repo.getEntitlements(body.catalogue.id, ORG)
    expect(grants.catalogue).toBeNull()
    expect(resolveLimits(grants.catalogue, grants.org)).toEqual(DEFAULT_LIMITS)
  })
})

describe('the new occasions the storage ladder needed', () => {
  it('accepts performance and event, the same as any other occasion', async () => {
    expect((await create({ occasion: 'performance' })).status).toBe(201)
    expect((await create({ occasion: 'event' })).status).toBe(201)
  })
})
