import { beforeEach, describe, expect, it } from 'vitest'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { GRACE_DAYS, nextSubStatus, runLifecycle } from '@/lib/lifecycle'
import { operatorSchema, orgSchema, type SubStatus } from '@/lib/schema'
import { makeCatalogue } from '../helpers/repository'

/**
 * N-24 — the ladder that had never moved.
 *
 * The state machine has existed since Phase 0 and `resolveAccess` has always honoured it. Nothing
 * ever *wrote* it, so a wedding whose term ended a year ago is still streaming and one nobody
 * renewed is still costing Stream storage.
 *
 * `PRICING.md` §2: term ends → 90 days' grace, everything still playing → cold, streaming paused
 * and every file retained. And it must never happen silently.
 */

const ORG = '11111111-1111-4111-8111-11111111111a'
const AT = '2026-01-01T00:00:00.000Z'
const TODAY = new Date('2026-06-01T09:00:00.000Z')

/** `includedUntil` set so the term ended `days` ago (negative = still running). */
function endedDaysAgo(days: number): string {
  const end = new Date(TODAY)
  end.setUTCDate(end.getUTCDate() - days)
  return end.toISOString().slice(0, 10)
}

describe('where a catalogue should be today', () => {
  const ladder = (subStatus: SubStatus, includedUntil: string) =>
    nextSubStatus({ subStatus, includedUntil }, TODAY)

  it('serves through the whole of its last day, in every timezone', () => {
    // Zero days since the end is the final day itself. Falling that morning would cut a wedding
    // short for anyone west of UTC, which is the same rule `resolveAccess` applies.
    expect(ladder('included', endedDaysAgo(0))).toBeNull()
    expect(ladder('included', endedDaysAgo(1))).toBe('grace')
  })

  it('stays in grace for the whole ninety days', () => {
    expect(ladder('grace', endedDaysAgo(1))).toBeNull()
    expect(ladder('grace', endedDaysAgo(GRACE_DAYS))).toBeNull()
    expect(ladder('grace', endedDaysAgo(GRACE_DAYS + 1))).toBe('cold')
  })

  it('moves a renewed catalogue too, since a paid term also ends', () => {
    expect(ladder('active', endedDaysAgo(1))).toBe('grace')
  })

  /**
   * The one rule this job must never break. A wedding is not deleted on a timer, ever — `deleted`
   * exists only for an explicit, recorded request from the couple.
   */
  it('never moves anything to deleted, whatever the date says', () => {
    for (const status of ['included', 'active', 'grace', 'lapsed', 'cold', 'deleted'] as const) {
      expect(ladder(status, endedDaysAgo(10_000))).not.toBe('deleted')
    }
  })

  it('leaves the terminal states alone until somebody pays', () => {
    expect(ladder('cold', endedDaysAgo(500))).toBeNull()
    expect(ladder('lapsed', endedDaysAgo(500))).toBeNull()
  })

  it('refuses a date it cannot read rather than guessing', () => {
    expect(ladder('included', 'not-a-date')).toBeNull()
  })
})

describe('running the ladder', () => {
  let repo: MemoryRepository

  function install(subStatus: SubStatus, includedUntil: string, publishedAt: string | null = AT) {
    const snapshot = emptySnapshot()
    snapshot.orgs.push(orgSchema.parse({ id: ORG, name: 'Kalyanam', slug: 'kalyanam', createdAt: AT }))
    snapshot.operators.push(
      operatorSchema.parse({
        id: '00000000-0000-4000-8000-000000000001',
        orgId: ORG,
        email: 'studio@example.test',
        name: 'Operator',
        role: 'admin',
        passwordHash: '',
        createdAt: AT,
      }),
    )
    snapshot.catalogues.push(
      makeCatalogue({ orgId: ORG, slug: 'aanya-vikram', subStatus, includedUntil, publishedAt }),
    )
    repo = new MemoryRepository(snapshot)
    setRepository(repo)
  }

  beforeEach(() => install('included', endedDaysAgo(1)))

  it('writes the state, which is the thing that had never happened', async () => {
    const result = await runLifecycle(TODAY)

    expect(result.toGrace).toBe(1)
    expect((await repo.listAllCatalogues())[0]?.subStatus).toBe('grace')
  })

  it('never archives silently — going cold queues a message', async () => {
    install('grace', endedDaysAgo(GRACE_DAYS + 1))

    const result = await runLifecycle(TODAY)

    expect(result.toCold).toBe(1)
    const [queued] = await repo.listQueuedNotifications(10)
    expect(queued?.template).toBe('archived')
    expect(queued?.address).toBe('studio@example.test')
  })

  it('says nothing extra when a catalogue merely falls into grace', async () => {
    // Grace already has its own rungs on the warning ladder (N-21). A second message about the
    // same day is how a mailbox becomes noise.
    await runLifecycle(TODAY)
    expect(await repo.listQueuedNotifications(10)).toHaveLength(0)
  })

  it('is a no-op on a second run of the same day', async () => {
    install('grace', endedDaysAgo(GRACE_DAYS + 1))
    await runLifecycle(TODAY)

    const second = await runLifecycle(TODAY)

    expect(second).toMatchObject({ toGrace: 0, toCold: 0 })
    expect(await repo.listQueuedNotifications(10)).toHaveLength(1)
  })

  it('leaves a draft alone, because its term never started', async () => {
    install('included', endedDaysAgo(500), null)

    const result = await runLifecycle(TODAY)

    expect(result).toEqual({ examined: 0, toGrace: 0, toCold: 0 })
  })
})
