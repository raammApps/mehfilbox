import { beforeEach, describe, expect, it } from 'vitest'
import { POST as askForSpace } from '@/app/api/admin/storage/request/route'
import { POST as setCatalogueQuota } from '@/app/api/admin/platform/catalogues/[id]/quota/route'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { DEFAULT_LIMITS, resolveLimits, storageCheck } from '@/lib/entitlements'
import { catalogueSchema, operatorSchema, orgSchema, platformAdminSchema } from '@/lib/schema'

/**
 * N-79, D-60 — quota moved to the catalogue with the storage ladder, so the interim "ask for
 * more" step targets a wedding's own grant rather than its studio's, and the platform's answer
 * to that ask is a catalogue-scoped control rather than the org-level one N-27b already has.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const OTHER_ORG = '11111111-1111-4111-8111-11111111111b'
const OPERATOR = '00000000-0000-4000-8000-000000000001'
const ADMIN = '00000000-0000-4000-8000-00000000000a'
const CATALOGUE = '22222222-2222-4222-8222-222222222222'
const OTHERS_CATALOGUE = '22222222-2222-4222-8222-222222222223'
const GB = 1024 ** 3
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

beforeEach(() => {
  const snapshot = emptySnapshot()
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
  )
  snapshot.platformAdmins.push(
    platformAdminSchema.parse({ id: ADMIN, email: 'root@mehfilbox.test', name: 'Root', createdAt: AT }),
  )
  snapshot.catalogues.push(
    catalogueSchema.parse({
      id: CATALOGUE,
      orgId: ORG,
      slug: 'aanya-vikram',
      coupleName: { en: 'Aanya & Vikram' },
      appName: { en: 'Aanya & Vikram Originals' },
      weddingDate: '2026-02-14',
      includedUntil: '2026-12-31',
      createdAt: AT,
    }),
    catalogueSchema.parse({
      id: OTHERS_CATALOGUE,
      orgId: OTHER_ORG,
      slug: 'not-mine',
      coupleName: { en: 'Not Mine' },
      appName: { en: 'Not Mine Originals' },
      weddingDate: '2026-03-01',
      includedUntil: '2026-12-31',
      createdAt: AT,
    }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
})

describe('the platform’s catalogue quota control', () => {
  it('starts with no override, so the catalogue follows its org or the default', async () => {
    expect(await repo.getCatalogueEntitlement(CATALOGUE)).toBeNull()
    expect(resolveLimits(null, null).storageGb).toBe(DEFAULT_LIMITS.storageGb)
  })

  it('grants a catalogue its own storage, which resolveLimits then prefers over the org', async () => {
    await repo.setOrgStorageQuota(ORG, 40)
    await repo.setCatalogueStorageQuota(CATALOGUE, 60)

    const org = await repo.getOrgEntitlement(ORG)
    const catalogue = await repo.getCatalogueEntitlement(CATALOGUE)
    const limits = resolveLimits(catalogue, org)

    expect(limits.storageGb).toBe(60)
    expect(storageCheck(50 * GB, 5 * GB, limits).fits).toBe(true)
    expect(storageCheck(50 * GB, 5 * GB, { storageGb: 40 }).fits).toBe(false)
  })

  it('replaces an override rather than stacking a second row', async () => {
    await repo.setCatalogueStorageQuota(CATALOGUE, 60)
    await repo.setCatalogueStorageQuota(CATALOGUE, 90)

    expect((await repo.getCatalogueEntitlement(CATALOGUE))?.storageGb).toBe(90)
  })

  it('clears back to whatever it would otherwise follow, rather than pinning today’s number', async () => {
    await repo.setCatalogueStorageQuota(CATALOGUE, 60)
    expect(await repo.setCatalogueStorageQuota(CATALOGUE, null)).toBeNull()
    expect(await repo.getCatalogueEntitlement(CATALOGUE)).toBeNull()
  })

  it('the route sets it, records who and why, and answers a 404 to an operator', async () => {
    setAuthProvider(signedInAs(ADMIN, 'root@mehfilbox.test'))
    const response = await setCatalogueQuota(
      new Request(`http://mehfilbox.test/api/admin/platform/catalogues/${CATALOGUE}/quota`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storageGb: 75, reason: 'the couple bought more' }),
      }),
      { params: Promise.resolve({ id: CATALOGUE }) },
    )
    expect(response.status).toBe(200)
    expect((await repo.getCatalogueEntitlement(CATALOGUE))?.storageGb).toBe(75)

    const audit = await repo.listPlatformAudit({ orgId: ORG, limit: 5 })
    expect(audit[0]).toMatchObject({
      action: 'catalogue.quota.set',
      detail: { catalogueId: CATALOGUE, from: DEFAULT_LIMITS.storageGb, to: 75, reason: 'the couple bought more' },
    })

    setAuthProvider(signedInAs(OPERATOR, 'operator@example.test'))
    const asOperator = await setCatalogueQuota(
      new Request(`http://mehfilbox.test/api/admin/platform/catalogues/${CATALOGUE}/quota`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ storageGb: 500 }),
      }),
      { params: Promise.resolve({ id: CATALOGUE }) },
    )
    expect(asOperator.status).toBe(404)
  })
})

describe('asking for more space', () => {
  it('queues one message to us per catalogue per day, with what is actually used', async () => {
    setAuthProvider(signedInAs(OPERATOR, 'operator@example.test'))
    const ask = () =>
      askForSpace(
        new Request('http://mehfilbox.test/api/admin/storage/request', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ catalogueId: CATALOGUE }),
        }),
      )

    const first = await ask()
    expect(first.status).toBe(200)
    expect((await first.json()).repeated).toBe(false)

    const second = await ask()
    expect((await second.json()).repeated).toBe(true)

    const queued = await repo.listQueuedNotifications(10)
    expect(queued).toHaveLength(1)
    expect(queued[0]).toMatchObject({ template: 'storage-request', orgId: ORG, catalogueId: CATALOGUE })
    expect(queued[0]!.bodyText).toContain('Aanya & Vikram')
    expect(queued[0]!.bodyText).toContain(`${DEFAULT_LIMITS.storageGb} GB`)
  })

  it('refuses a catalogue this operator cannot see', async () => {
    setAuthProvider(signedInAs(OPERATOR, 'operator@example.test'))
    const response = await askForSpace(
      new Request('http://mehfilbox.test/api/admin/storage/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ catalogueId: OTHERS_CATALOGUE }),
      }),
    )
    expect(response.status).toBe(404)
    expect(await repo.listQueuedNotifications(10)).toEqual([])
  })
})
