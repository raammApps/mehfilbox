import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { DEFAULT_LIMITS, resolveLimits, storageCheck } from '@/lib/entitlements'
import { orgSchema } from '@/lib/schema'

/**
 * N-27b — a studio's storage allowance, set from the console instead of from a SQL editor.
 *
 * What is tested is that the number **does something**. A quota that is stored and not consulted
 * is the most convincing kind of broken: the console shows 500 GB, the studio believes it, and the
 * upload that matters is refused at 20.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const OTHER = '11111111-1111-4111-8111-11111111111b'
const GB = 1024 ** 3
const AT = '2026-01-01T00:00:00.000Z'

let repo: MemoryRepository

beforeEach(() => {
  const snapshot = emptySnapshot()
  for (const [id, slug] of [
    [ORG, 'kalyanam'],
    [OTHER, 'other'],
  ] as const) {
    snapshot.orgs.push(orgSchema.parse({ id, name: slug, slug, createdAt: AT }))
  }
  repo = new MemoryRepository(snapshot)
})

describe('setting a quota', () => {
  it('starts with no override, so the default applies', async () => {
    expect(await repo.getOrgEntitlement(ORG)).toBeNull()
    expect(resolveLimits(null, null).storageGb).toBe(DEFAULT_LIMITS.storageGb)
  })

  it('changes what an upload is measured against, which is the whole point', async () => {
    await repo.setOrgStorageQuota(ORG, 100)
    const entitlement = await repo.getOrgEntitlement(ORG)
    const limits = resolveLimits(null, entitlement)

    expect(limits.storageGb).toBe(100)
    // A 50 GB catalogue fits under 100 and would not have under the 20 GB default.
    expect(storageCheck(50 * GB, 10 * GB, limits).fits).toBe(true)
    expect(storageCheck(50 * GB, 10 * GB, { storageGb: DEFAULT_LIMITS.storageGb }).fits).toBe(false)
  })

  it('replaces an override rather than stacking a second row', async () => {
    await repo.setOrgStorageQuota(ORG, 100)
    await repo.setOrgStorageQuota(ORG, 200)

    expect((await repo.getOrgEntitlement(ORG))?.storageGb).toBe(200)
  })

  /**
   * Clearing removes the row rather than zeroing it. A row with every field null is
   * indistinguishable from an override that happens to change nothing, and "back to the default"
   * has to keep meaning "follow the default if it ever moves" rather than "frozen at today's".
   */
  it('clears back to the default rather than pinning today’s number', async () => {
    await repo.setOrgStorageQuota(ORG, 100)
    expect(await repo.setOrgStorageQuota(ORG, null)).toBeNull()

    expect(await repo.getOrgEntitlement(ORG)).toBeNull()
    expect(resolveLimits(null, null).storageGb).toBe(DEFAULT_LIMITS.storageGb)
  })

  it('touches only the studio it names', async () => {
    await repo.setOrgStorageQuota(ORG, 100)

    expect(await repo.getOrgEntitlement(OTHER)).toBeNull()
  })

  /**
   * A catalogue's own entitlement still beats the org's, which is what makes a one-off "give this
   * wedding more room" possible without moving the whole studio to a bigger allowance.
   */
  it('lets a catalogue override the studio', async () => {
    await repo.setOrgStorageQuota(ORG, 100)
    const org = await repo.getOrgEntitlement(ORG)

    const catalogue = { ...org!, id: 'c', orgId: null, catalogueId: 'x', storageGb: 500 }
    expect(resolveLimits(catalogue, org).storageGb).toBe(500)
  })
})
