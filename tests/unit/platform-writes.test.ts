import { beforeEach, describe, expect, it } from 'vitest'
import { setAuthProvider } from '@/lib/admin/auth'
import type { AuthProvider } from '@/lib/admin/auth-provider'
import { getOperatorSession, requireOperator } from '@/lib/admin/session'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import {
  catalogueSchema,
  operatorSchema,
  orgSchema,
  platformAuditSchema,
  type Catalogue,
} from '@/lib/schema'

/**
 * The platform console's first write (N-27).
 *
 * What is tested is the *blast radius*, not the button. Suspension is the only control in the
 * product that stops another business working, and the two claims that have to hold are that it
 * stops them completely and that it touches nothing a couple can see. Both are asserted here,
 * because a bug in either direction is discovered by a customer rather than by a log.
 */

const ADMIN = '00000000-0000-4000-8000-000000000001'
const OPERATOR = '00000000-0000-4000-8000-000000000002'
const ORG = '11111111-1111-4111-8111-11111111111a'
const CATALOGUE = '22222222-2222-4222-8222-222222222222'
const AT = '2026-01-01T00:00:00.000Z'

function repository(): MemoryRepository {
  const snapshot = emptySnapshot()
  snapshot.orgs.push(
    orgSchema.parse({
      id: ORG,
      name: 'Kalyanam Weddings',
      slug: 'kalyanam',
      kind: 'partner',
      createdAt: AT,
    }),
  )
  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: ORG,
      email: 'operator@mehfilbox.test',
      name: 'Operator',
      role: 'admin',
      passwordHash: '',
      createdAt: AT,
    }),
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
      status: 'published',
      createdAt: AT,
      updatedAt: AT,
    }),
  )
  return new MemoryRepository(snapshot)
}

let repo: MemoryRepository
beforeEach(() => {
  repo = repository()
})

describe('N-27 — suspending a studio', () => {
  it('stops the operator being recognised as an active session', async () => {
    const before = await repo.getOperatorWithOrgStatus(OPERATOR)
    expect(before?.orgStatus).toBe('active')

    await repo.setOrgStatus(ORG, 'suspended')

    const after = await repo.getOperatorWithOrgStatus(OPERATOR)
    // The operator row is still there — they have an identity, they simply cannot act. Returning
    // null instead would bounce them to a login they can pass, forever.
    expect(after?.operator.email).toBe('operator@mehfilbox.test')
    expect(after?.orgStatus).toBe('suspended')
  })

  /**
   * The assertion that matters most. A billing dispute between us and a studio must never take a
   * wedding off the air — the couple is not party to it. `status` lives on `orgs` for this
   * reason, and if it ever migrates onto catalogues this test is what should stop it.
   */
  it('changes nothing about the weddings that studio has already delivered', async () => {
    const before = await repo.listCatalogues({ orgId: ORG })

    await repo.setOrgStatus(ORG, 'suspended')

    const after = await repo.listCatalogues({ orgId: ORG })
    expect(after).toEqual(before)
    expect(after[0]?.status).toBe('published')
  })

  it('is reversible, and restoring returns the operator to an active org', async () => {
    await repo.setOrgStatus(ORG, 'suspended')
    await repo.setOrgStatus(ORG, 'active')

    expect((await repo.getOperatorWithOrgStatus(OPERATOR))?.orgStatus).toBe('active')
  })

  it('refuses to act on an org that does not exist', async () => {
    await expect(
      repo.setOrgStatus('33333333-3333-4333-8333-333333333333', 'suspended'),
    ).rejects.toThrow()
  })

  it('has no session for an operator whose org is gone', async () => {
    // Defaulting to 'active' for an unexplainable state would hand out the widest access at the
    // moment least is known. `kalyanam` reached a version of this when its auth users were
    // deleted and the cascade took its operators.
    await repo.deleteOrg(ORG)
    expect(await repo.getOperatorWithOrgStatus(OPERATOR)).toBeNull()
  })
})

describe('N-27 — the audit trail', () => {
  function entry(action: string, detail: Record<string, unknown> = {}) {
    return platformAuditSchema.parse({
      id: crypto.randomUUID(),
      actorId: ADMIN,
      actorEmail: 'root@mehfilbox.test',
      action,
      orgId: ORG,
      orgSlug: 'kalyanam',
      detail,
      createdAt: new Date().toISOString(),
    })
  }

  it('records who did what, and reads back newest first', async () => {
    await repo.recordPlatformAudit(entry('org.suspend', { reason: 'Unpaid since August' }))
    await new Promise((resolve) => setTimeout(resolve, 2))
    await repo.recordPlatformAudit(entry('org.restore'))

    const rows = await repo.listPlatformAudit({ orgId: ORG })
    expect(rows.map((r) => r.action)).toEqual(['org.restore', 'org.suspend'])
    expect(rows[1]?.actorEmail).toBe('root@mehfilbox.test')
    expect(rows[1]?.detail.reason).toBe('Unpaid since August')
  })

  /**
   * The slug is denormalised so the row still reads after the org is deleted, which is exactly
   * when someone is reading it. A trail that becomes anonymous the moment the subject is removed
   * documents nothing about the removal.
   */
  it('survives the org it describes being deleted', async () => {
    await repo.recordPlatformAudit(entry('org.suspend'))
    await repo.deleteOrg(ORG)

    const rows = await repo.listPlatformAudit()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.orgSlug).toBe('kalyanam')
  })

  it('scopes to one org when asked', async () => {
    await repo.recordPlatformAudit(entry('org.suspend'))
    expect(await repo.listPlatformAudit({ orgId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })).toEqual(
      [],
    )
  })
})

describe('N-27 — who can see whom', () => {
  it('lists only the operators of the org asked for', async () => {
    const other = '11111111-1111-4111-8111-11111111111b'
    await repo.createOrg(
      orgSchema.parse({ id: other, name: 'Other', slug: 'other', createdAt: AT }),
    )
    await repo.createOperator(
      operatorSchema.parse({
        id: '00000000-0000-4000-8000-000000000003',
        orgId: other,
        email: 'someone@other.test',
        name: 'Someone',
        role: 'admin',
        passwordHash: '',
        createdAt: AT,
      }),
    )

    const mine = await repo.listOperators(ORG)
    expect(mine.map((o) => o.email)).toEqual(['operator@mehfilbox.test'])
  })

  /**
   * `kalyanam` is in exactly this state in production: its auth users were deleted, the cascade
   * took the `operators` rows with them, and its catalogues are untouched and unreachable. No
   * other surface reports it — the org list shows a healthy row with catalogues against it.
   */
  it('reports an org nobody can sign in to, which no other surface does', async () => {
    const snapshot = emptySnapshot()
    snapshot.orgs.push(
      orgSchema.parse({ id: ORG, name: 'Kalyanam Weddings', slug: 'kalyanam', createdAt: AT }),
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
        status: 'published',
        createdAt: AT,
        updatedAt: AT,
      }),
    )
    const orphaned = new MemoryRepository(snapshot)

    expect(await orphaned.listOperators(ORG)).toEqual([])
    const catalogues: Catalogue[] = await orphaned.listCatalogues({ orgId: ORG })
    expect(catalogues).toHaveLength(1)
  })
})

/**
 * The guard that actually protects anything.
 *
 * Everything above tests the repository, and a repository that reports `suspended` correctly is
 * worth nothing if no caller looks at it. `requireOperator` is the choke point every API route
 * goes through — the same one that enforces org scoping — so this is where suspension either
 * bites or silently does not.
 */
describe('N-27 — a suspended studio at the session boundary', () => {
  function signedInAs(id: string): AuthProvider {
    return {
      name: 'stub',
      currentUser: async () => ({ id, email: 'operator@mehfilbox.test' }),
      signIn: async () => null,
      signOut: async () => {},
    } as unknown as AuthProvider
  }

  beforeEach(() => {
    setRepository(repo)
    setAuthProvider(signedInAs(OPERATOR))
  })

  it('keeps a session, so the console can explain itself instead of looping', async () => {
    await repo.setOrgStatus(ORG, 'suspended')

    const session = await getOperatorSession()
    // Not null. Returning null would redirect to a login they can pass, which redirects here.
    expect(session?.orgStatus).toBe('suspended')
  })

  it('refuses every route that goes through requireOperator', async () => {
    await repo.setOrgStatus(ORG, 'suspended')
    await expect(requireOperator()).rejects.toThrow(/suspended/i)
  })

  it('lets an active studio straight through, which is the other half of the claim', async () => {
    const session = await requireOperator()
    expect(session.orgId).toBe(ORG)
  })

  it('restoring a studio restores its access immediately', async () => {
    await repo.setOrgStatus(ORG, 'suspended')
    await expect(requireOperator()).rejects.toThrow()

    await repo.setOrgStatus(ORG, 'active')
    await expect(requireOperator()).resolves.toMatchObject({ orgId: ORG })
  })
})
