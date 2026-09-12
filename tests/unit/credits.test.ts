import { beforeEach, describe, expect, it } from 'vitest'
import { DELETE as unpublish, POST as publish } from '@/app/api/admin/catalogues/[id]/publish/route'
import { POST as requestCredit } from '@/app/api/admin/credits/request/route'
import { POST as grant } from '@/app/api/admin/platform/orgs/[id]/credits/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { grantRegistrationCredit, makeCredits } from '@/lib/admin/credits'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { catalogueSchema, operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'

/**
 * Credits and the trial (D-38, doc 16 §7).
 *
 * The first publish spends a credit and the second is refused; a republish spends nothing; a
 * wedding published before credits existed is untouched; an expired credit publishes nothing;
 * the platform grants with a reason on the audit row; and a studio out of credits can ask once
 * a day. Each is a sentence a studio or we would say, so each is a test.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const ADMIN = '00000000-0000-4000-8000-00000000000a'
const A = '22222222-2222-4222-8222-22222222222a'
const B = '22222222-2222-4222-8222-22222222222b'
const OLD = '22222222-2222-4222-8222-22222222222c'
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository

function catalogue(id: string, slug: string, over: Record<string, unknown> = {}) {
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
    ...over,
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
const asAdmin = () => setAuthProvider(signedInAs(ADMIN, 'root@mehfilbox.test'))

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
  snapshot.platformAdmins.push(
    platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }),
  )
  snapshot.catalogues.push(
    catalogue(A, 'first'),
    catalogue(B, 'second'),
    // Published before credits existed, since taken down for a fix: `publishedAt` is set.
    catalogue(OLD, 'older', { status: 'draft', publishedAt: '2025-06-01T00:00:00.000Z' }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
  asOperator()
})

const params = (id: string) => ({ params: Promise.resolve({ id }) })
const publishOf = (id: string) => publish(new Request(`http://mehfilbox.test/api/admin/catalogues/${id}/publish`, { method: 'POST' }), params(id))
const unpublishOf = (id: string) => unpublish(new Request(`http://mehfilbox.test/api/admin/catalogues/${id}/publish`, { method: 'DELETE' }), params(id))
const balance = () => repo.creditBalance(ORG, new Date().toISOString())

describe('the trial', () => {
  it('registration grants one credit, good for two years', async () => {
    const [credit] = await grantRegistrationCredit(ORG, new Date('2026-09-12T00:00:00.000Z'))
    expect(credit).toMatchObject({ grantedBy: 'registration', consumedAt: null })
    expect(credit!.expiresAt.slice(0, 10)).toBe('2028-09-12')
    expect(await balance()).toEqual({ available: 1, consumed: 0, expired: 0 })
  })

  it('spends it on the first publish, refuses the second, and republishes for free', async () => {
    await grantRegistrationCredit(ORG)

    expect((await publishOf(A)).status).toBe(200)
    expect(await balance()).toEqual({ available: 0, consumed: 1, expired: 0 })
    expect((await repo.listCredits(ORG))[0]!.consumedByCatalogueId).toBe(A)

    const refused = await publishOf(B)
    expect(refused.status).toBe(402)
    expect((await refused.json()).error.code).toBe('CREDIT_REQUIRED')
    expect((await repo.getCatalogue(B, ORG))?.status).toBe('draft')

    // Down for a change and up again: no second credit.
    expect((await unpublishOf(A)).status).toBe(200)
    expect((await publishOf(A)).status).toBe(200)
    expect(await balance()).toEqual({ available: 0, consumed: 1, expired: 0 })
  })

  it('leaves a wedding published before credits existed untouched', async () => {
    expect(await balance()).toEqual({ available: 0, consumed: 0, expired: 0 })
    expect((await publishOf(OLD)).status).toBe(200)
  })

  it('does not spend an expired credit, and spends the soonest-to-expire first', async () => {
    const twoYearsAgo = new Date('2024-01-01T00:00:00.000Z')
    await repo.grantCredits(makeCredits({ orgId: ORG, count: 1, grantedBy: 'test', now: twoYearsAgo }))
    expect((await publishOf(A)).status).toBe(402)
    expect(await balance()).toEqual({ available: 0, consumed: 0, expired: 1 })

    const later = makeCredits({ orgId: ORG, count: 1, grantedBy: 'later', now: new Date('2026-06-01T00:00:00.000Z') })
    const sooner = makeCredits({ orgId: ORG, count: 1, grantedBy: 'sooner', now: new Date('2026-03-01T00:00:00.000Z') })
    await repo.grantCredits([...later, ...sooner])
    expect((await publishOf(A)).status).toBe(200)
    const spent = (await repo.listCredits(ORG)).find((c) => c.consumedAt !== null)
    expect(spent?.grantedBy).toBe('sooner')
  })
})

describe('the platform grants', () => {
  it('adds credits with a reason on the audit row, and the studio can publish again', async () => {
    expect((await publishOf(A)).status).toBe(402)

    asAdmin()
    const response = await grant(
      new Request(`http://mehfilbox.test/api/admin/platform/orgs/${ORG}/credits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: 5, reason: 'Paid ₹7,999 by transfer' }),
      }),
      params(ORG),
    )
    expect(response.status).toBe(201)
    expect((await response.json()).balance).toEqual({ available: 5, consumed: 0, expired: 0 })
    const audit = await repo.listPlatformAudit({ orgId: ORG, limit: 5 })
    expect(audit.map((entry) => entry.action)).toEqual(['credits.grant'])
    expect(audit[0]!.detail).toMatchObject({ count: 5, reason: 'Paid ₹7,999 by transfer' })
    expect((await repo.listCredits(ORG)).every((c) => c.grantedBy === 'root@mehfilbox.test')).toBe(true)

    asOperator()
    expect((await publishOf(A)).status).toBe(200)
    expect(await balance()).toEqual({ available: 4, consumed: 1, expired: 0 })
  })

  it('is a 404 to an operator', async () => {
    const response = await grant(
      new Request(`http://mehfilbox.test/api/admin/platform/orgs/${ORG}/credits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ count: 1, reason: 'mine' }),
      }),
      params(ORG),
    )
    expect(response.status).toBe(404)
    expect(await balance()).toEqual({ available: 0, consumed: 0, expired: 0 })
  })
})

describe('asking for one', () => {
  it('queues one message to us per studio per day, naming the wedding', async () => {
    const ask = () =>
      requestCredit(
        new Request('http://mehfilbox.test/api/admin/credits/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ catalogueId: B }),
        }),
      )
    const first = await ask()
    expect(first.status).toBe(200)
    expect((await first.json()).repeated).toBe(false)

    const second = await ask()
    expect((await second.json()).repeated).toBe(true)

    const queued = await repo.listQueuedNotifications(10)
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ template: 'credit-request', orgId: ORG, catalogueId: B })
    expect(queued[0]!.bodyText).toContain('second')
    expect(queued[0]!.bodyText).toContain('0 available')
  })
})
