import { beforeEach, describe, expect, it } from 'vitest'
import { POST as publish } from '@/app/api/admin/catalogues/[id]/publish/route'
import { POST as createCatalogue } from '@/app/api/admin/catalogues/route'
import { POST as grant } from '@/app/api/admin/platform/orgs/[id]/credits/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { relationOf } from '@/lib/my/session'
import { operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'

/**
 * A catalogue a couple starts for themselves (doc 16 §6, N-73).
 *
 * The same route a studio uses, scoped the same way: the row is theirs, addressed under their
 * own segment, listed in their account as owned rather than linked — and a draft that costs
 * nothing until a credit is added, since a couple's account starts with none (D-38).
 */

const ADMIN = '00000000-0000-4000-8000-00000000000a'
const COUPLE_OPERATOR = '00000000-0000-4000-8000-000000000002'
const COUPLE_ORG = '11111111-1111-4111-8111-11111111111c'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository
let current: { id: string; email: string }

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.platformAdmins.push(platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }))
  snapshot.orgs.push(orgSchema.parse({ id: COUPLE_ORG, name: 'Aanya & Vikram', slug: 'aanya-and-vikram', kind: 'couple', createdAt: AT }))
  snapshot.operators.push(
    operatorSchema.parse({ id: COUPLE_OPERATOR, orgId: COUPLE_ORG, email: 'aanya@example.test', name: 'Aanya', role: 'admin', passwordHash: '', createdAt: AT }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  current = { id: COUPLE_OPERATOR, email: 'aanya@example.test' }
  setAuthProvider({
    name: 'stub',
    currentUser: async () => current,
    signIn: async () => null,
    signOut: async () => {},
  } as unknown as AuthProvider)
})

describe('a couple starting a catalogue of their own', () => {
  it('owns it, under their own segment, and sees it in their account', async () => {
    const response = await createCatalogue(
      new Request('http://mehfilbox.test/api/admin/catalogues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          coupleName: { en: 'Aarav turns one' },
          appName: { en: 'Aarav Originals' },
          weddingDate: '2027-03-02',
          slug: 'aarav-turns-one',
          occasion: 'birthday',
          template: 'films-only',
        }),
      }),
    )
    expect(response.status).toBe(201)
    const { catalogue } = await response.json()
    expect(catalogue).toMatchObject({
      orgId: COUPLE_ORG,
      originOrgId: COUPLE_ORG,
      tenantSlug: 'aanya-and-vikram',
      occasion: 'birthday',
      status: 'draft',
    })

    const mine = await repo.listCataloguesForCouple(COUPLE_ORG)
    expect(mine.map((c) => c.slug)).toEqual(['aarav-turns-one'])
    expect(relationOf(mine[0]!, COUPLE_ORG)).toBe('owned')

    // A draft costs nothing; publishing waits for a credit their studio or we add.
    const refused = await publish(new Request('http://mehfilbox.test/x', { method: 'POST' }), { params: Promise.resolve({ id: catalogue.id }) })
    expect(refused.status).toBe(402)

    current = { id: ADMIN, email: 'root@mehfilbox.test' }
    const granted = await grant(
      new Request('http://mehfilbox.test/x', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: 1, reason: 'A birthday, on the house' }),
      }),
      { params: Promise.resolve({ id: COUPLE_ORG }) },
    )
    expect(granted.status).toBe(201)

    current = { id: COUPLE_OPERATOR, email: 'aanya@example.test' }
    const published = await publish(new Request('http://mehfilbox.test/x', { method: 'POST' }), { params: Promise.resolve({ id: catalogue.id }) })
    expect(published.status).toBe(200)
  })

  it('knows the occasions a couple starts for themselves', async () => {
    for (const occasion of ['baby-shower', 'naming-day']) {
      const response = await createCatalogue(
        new Request('http://mehfilbox.test/api/admin/catalogues', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            coupleName: { en: occasion },
            appName: { en: `${occasion} Originals` },
            weddingDate: '2027-03-02',
            slug: `our-${occasion}`,
            occasion,
          }),
        }),
      )
      expect(response.status).toBe(201)
    }
  })
})
