import { beforeEach, describe, expect, it } from 'vitest'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { BEFORE_EXPIRY, INTO_GRACE, milestoneFor, queueDueWarnings } from '@/lib/notify/schedule'
import { operatorSchema, orgSchema } from '@/lib/schema'
import { makeCatalogue } from '../helpers/repository'

/**
 * N-21 — nobody should be surprised by a wedding that stopped streaming.
 *
 * Two properties decide whether this works: the right people hear, and they hear **once**. The
 * second is the one that fails quietly — a cron re-derives the same milestone every run until the
 * day passes, so without de-duplication a couple gets the thirty-day warning thirty times and
 * learns to ignore all of them, including the last one.
 */

const STUDIO = '11111111-1111-4111-8111-11111111111a'
const COUPLE = '11111111-1111-4111-8111-11111111111b'
const AT = '2026-01-01T00:00:00.000Z'
const TODAY = new Date('2026-06-01T09:00:00.000Z')

function org(id: string, kind: 'partner' | 'couple', slug: string, locale: 'en' | 'hi' = 'en') {
  return orgSchema.parse({ id, name: slug, slug, kind, locale, createdAt: AT })
}

function operator(id: string, orgId: string, email: string) {
  return operatorSchema.parse({
    id,
    orgId,
    email,
    name: 'Someone',
    role: 'admin',
    passwordHash: '',
    createdAt: AT,
  })
}

/** `includedUntil` set so that today is exactly `days` before expiry (negative = into grace). */
function endingIn(days: number): string {
  const end = new Date(TODAY)
  end.setUTCDate(end.getUTCDate() + days)
  return end.toISOString().slice(0, 10)
}

let repo: MemoryRepository

function install(includedUntil: string, opts: { handedOver?: boolean } = {}) {
  const snapshot = emptySnapshot()
  snapshot.orgs.push(org(STUDIO, 'partner', 'kalyanam'))
  snapshot.operators.push(operator('00000000-0000-4000-8000-000000000001', STUDIO, 'studio@example.test'))

  if (opts.handedOver) {
    snapshot.orgs.push(org(COUPLE, 'couple', 'aanya-vikram-org'))
    snapshot.operators.push(operator('00000000-0000-4000-8000-000000000002', COUPLE, 'couple@example.test'))
  }

  snapshot.catalogues.push(
    makeCatalogue({
      orgId: opts.handedOver ? COUPLE : STUDIO,
      originOrgId: opts.handedOver ? STUDIO : null,
      slug: 'aanya-vikram',
      status: 'published',
      includedUntil,
    }),
  )
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
}

describe('which rung of the ladder today is', () => {
  it('matches each warning day exactly, and nothing between them', () => {
    for (const day of BEFORE_EXPIRY) {
      expect(milestoneFor(endingIn(day), TODAY)).toEqual({ template: 'expiry', day })
    }
    for (const day of INTO_GRACE) {
      expect(milestoneFor(endingIn(-day), TODAY)).toEqual({ template: 'grace', day })
    }
    // 45 is between two rungs. Silence is the correct answer — a warning every day is noise, and
    // noise is what makes the last one useless.
    expect(milestoneFor(endingIn(45), TODAY)).toBeNull()
    expect(milestoneFor(endingIn(-45), TODAY)).toBeNull()
  })

  it('says nothing on the day it expires, because grace has not started', () => {
    expect(milestoneFor(endingIn(0), TODAY)).toBeNull()
  })

  it('is not confused by the time of day', () => {
    // The cron runs at whatever hour it runs; a ladder counted in days must not shift with it.
    const lateEvening = new Date('2026-06-01T23:59:00.000Z')
    expect(milestoneFor(endingIn(30), lateEvening)).toEqual({ template: 'expiry', day: 30 })
  })

  it('refuses a date it cannot read rather than guessing', () => {
    expect(milestoneFor('not-a-date', TODAY)).toBeNull()
  })
})

describe('who is told', () => {
  it('tells the studio while the catalogue is still theirs', async () => {
    install(endingIn(30))

    const result = await queueDueWarnings(TODAY)

    expect(result.queued).toBe(1)
    const [queued] = await repo.listQueuedNotifications(10)
    expect(queued?.address).toBe('studio@example.test')
    expect(queued?.template).toBe('expiry')
  })

  /**
   * The one that matters after handover. The couple owns the catalogue, but the studio is still
   * the customer — the renewal is theirs to decide and theirs to sell, and a studio that hears
   * nothing about a wedding lapsing cannot do either.
   */
  it('tells both the couple and the studio once it has been handed over', async () => {
    install(endingIn(7), { handedOver: true })

    await queueDueWarnings(TODAY)

    const queued = await repo.listQueuedNotifications(10)
    expect(queued.map((n) => n.address).sort()).toEqual(['couple@example.test', 'studio@example.test'])
  })

  it('says nothing about a draft catalogue, which nobody has been given', async () => {
    install(endingIn(30))
    const [catalogue] = await repo.listAllCatalogues()
    await repo.updateCatalogue(catalogue!.id, STUDIO, { status: 'draft' })

    const result = await queueDueWarnings(TODAY)
    expect(result).toEqual({ examined: 0, queued: 0, skipped: 0 })
  })
})

describe('hearing it once', () => {
  it('queues nothing on a second run of the same day', async () => {
    install(endingIn(30))

    const first = await queueDueWarnings(TODAY)
    const second = await queueDueWarnings(TODAY)

    expect(first.queued).toBe(1)
    // Skipped rather than queued: the milestone is already handled, which is not an error.
    expect(second).toMatchObject({ queued: 0, skipped: 1 })
    expect(await repo.listQueuedNotifications(10)).toHaveLength(1)
  })

  it('still sends the next rung down, which is a different message', async () => {
    install(endingIn(30))
    await queueDueWarnings(TODAY)

    // A week later the catalogue is 23 days out — no rung. Then 7 days out, which is one.
    const laterToday = new Date('2026-06-24T09:00:00.000Z')
    const result = await queueDueWarnings(laterToday)

    expect(result.queued).toBe(1)
    expect((await repo.listQueuedNotifications(10)).map((n) => n.dedupeKey)).toHaveLength(2)
  })

  it('gives the couple and the studio separate keys, so one does not silence the other', async () => {
    install(endingIn(7), { handedOver: true })

    await queueDueWarnings(TODAY)

    const keys = (await repo.listQueuedNotifications(10)).map((n) => n.dedupeKey)
    expect(new Set(keys).size).toBe(2)
    expect(keys.every((k) => k?.startsWith('expiry:'))).toBe(true)
  })
})
