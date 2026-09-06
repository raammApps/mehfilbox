import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { operatorSchema, orgSchema, platformAdminSchema, catalogueSchema } from '@/lib/schema'

/**
 * The platform admin is a privilege boundary, so what is tested is the *isolation*, not the
 * feature.
 *
 * Doc 15 §1's argument is that an admin who is a member of an org would force every scoped query
 * to ask whether this member is special, and that cross-tenant leaks live in that branch. These
 * assertions are what keeps that argument true: an admin has no org, an operator cannot become
 * one, and the two lookups never see each other's rows.
 */

const ADMIN = '00000000-0000-4000-8000-000000000001'
const OPERATOR = '00000000-0000-4000-8000-000000000002'
const ORG_A = '11111111-1111-4111-8111-11111111111a'
const ORG_B = '11111111-1111-4111-8111-11111111111b'

function repository(): MemoryRepository {
  const snapshot = emptySnapshot()

  snapshot.platformAdmins.push(
    platformAdminSchema.parse({
      id: ADMIN,
      email: 'root@mehfilbox.test',
      name: 'Platform Root',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  )

  for (const [id, name, slug, kind] of [
    [ORG_A, 'Kalyanam Weddings', 'kalyanam', 'partner'],
    [ORG_B, 'Aanya and Vikram', 'aanya-vikram-org', 'couple'],
  ] as const) {
    snapshot.orgs.push(
      orgSchema.parse({ id, name, slug, kind, createdAt: '2026-01-01T00:00:00.000Z' }),
    )
  }

  snapshot.operators.push(
    operatorSchema.parse({
      id: OPERATOR,
      orgId: ORG_A,
      email: 'operator@mehfilbox.test',
      name: 'Demo Operator',
      role: 'admin',
      passwordHash: '',
      createdAt: '2026-01-01T00:00:00.000Z',
    }),
  )

  let n = 0
  const catalogue = (orgId: string) => {
    n += 1
    return catalogueSchema.parse({
      id: `2222222${n}-2222-4222-8222-222222222222`,
      orgId,
      slug: `wedding-${n}`,
      coupleName: { en: `Couple ${n}` },
      appName: { en: `Couple ${n} Originals` },
      weddingDate: '2026-02-14',
      includedUntil: '2026-06-14',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  }
  snapshot.catalogues.push(catalogue(ORG_A), catalogue(ORG_A), catalogue(ORG_B))

  return new MemoryRepository(snapshot)
}

describe('getPlatformAdmin', () => {
  let db: MemoryRepository

  beforeEach(() => {
    db = repository()
  })

  it('finds a platform admin by the authenticated user id', async () => {
    const admin = await db.getPlatformAdmin(ADMIN)
    expect(admin?.email).toBe('root@mehfilbox.test')
  })

  /**
   * The one that matters. An operator id must never resolve to a platform admin, or the whole
   * "no scoped query changes" argument collapses into "no scoped query changes, unless".
   */
  it('does not turn an operator into a platform admin', async () => {
    expect(await db.getPlatformAdmin(OPERATOR)).toBeNull()
  })

  it('does not turn a platform admin into an operator', async () => {
    expect(await db.getOperator(ADMIN)).toBeNull()
  })

  it('returns null for an id that is neither', async () => {
    expect(await db.getPlatformAdmin('33333333-3333-4333-8333-333333333333')).toBeNull()
  })

  /**
   * A `PlatformAdmin` deliberately has no `orgId` field at all. If one is ever added, this fails
   * — and it should, because it would mean the isolation argument has quietly changed shape.
   */
  it('carries no org, because that is the design and not an omission', async () => {
    const admin = await db.getPlatformAdmin(ADMIN)
    expect(admin).not.toBeNull()
    expect(Object.keys(admin!)).toEqual(['id', 'email', 'name', 'createdAt'])
  })
})

describe('catalogueCountsByOrg', () => {
  it('counts every org, including the ones holding nothing', async () => {
    const db = repository()
    await db.createOrg(
      orgSchema.parse({
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Brand New Studio',
        slug: 'brand-new',
        kind: 'partner',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    )

    const counts = await db.catalogueCountsByOrg()
    expect(counts[ORG_A]).toBe(2)
    expect(counts[ORG_B]).toBe(1)
    // An org with no catalogues has to appear as 0 rather than be missing — the platform list
    // renders straight from this, and a missing key would silently drop a partner from the table.
    expect(counts['44444444-4444-4444-8444-444444444444']).toBe(0)
  })

  it('crosses org boundaries, which is the only view that is allowed to', async () => {
    const counts = await repository().catalogueCountsByOrg()
    expect(Object.keys(counts).sort()).toEqual([ORG_A, ORG_B].sort())
  })
})
