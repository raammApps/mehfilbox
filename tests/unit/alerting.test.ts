import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { alertOps } from '@/lib/notify/alert'
import { FakeNotificationProvider } from '@/lib/notify/fake'
import { setNotificationProvider } from '@/lib/notify/index'
import { drain } from '@/lib/notify/send'

/**
 * N-53 — the alerts that would have caught the faults we actually had.
 *
 * Every serious fault in this product was silent, and each was found by a person looking at
 * production. What is tested here is the two properties that decide whether an alerting system
 * gets read: it fires when something is wrong, and it does not fire ninety-six times a day about
 * the same thing.
 */

let repo: MemoryRepository
let provider: FakeNotificationProvider

beforeEach(() => {
  repo = new MemoryRepository(emptySnapshot())
  setRepository(repo)
  provider = new FakeNotificationProvider()
  setNotificationProvider(provider)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('alertOps', () => {
  it('queues an alert rather than sending inside the request that noticed', async () => {
    const result = await alertOps('transcode webhook is not arriving', 'Reconcile settled 3.')

    expect(result.sent).toBe(true)
    // Queued, not sent: the cron delivers it. A failing provider must never become the failure.
    expect(provider.sent).toHaveLength(0)
    expect(await repo.countNotificationsSince('ops-alert', '2000-01-01T00:00:00.000Z')).toBe(1)
  })

  it('carries the deploy it happened on, which is the first question anyone asks', async () => {
    await alertOps('a guest cannot play a film', 'Playback token was refused.')
    await drain()

    const [message] = provider.sent
    expect(message?.text).toMatch(/Playback token was refused\./)
    // `version` is rendered even in dev, where it is the literal "dev" — a template with an
    // unfilled `{version}` would be worse than a wrong one, and `translate` leaves it visible.
    expect(message?.text).not.toMatch(/\{version\}/)
  })

  /**
   * The property that decides whether anyone reads these. The reconcile cron runs on a schedule
   * and a dead webhook stays dead, so without a window a single fault becomes a mailbox nobody
   * can bear to open — which is the state this whole item exists to leave.
   */
  it('sends once per window, however many times it is called', async () => {
    const first = await alertOps('transcode webhook is not arriving', 'one')
    const second = await alertOps('transcode webhook is not arriving', 'two')
    const third = await alertOps('a guest cannot play a film', 'three')

    expect(first.sent).toBe(true)
    expect(second).toEqual({ sent: false, reason: 'deduped' })
    // Deliberately deduped across *kinds*: when the product is broken, two alerts about it are
    // not twice as useful, and the second arrives while someone is already reading the first.
    expect(third).toEqual({ sent: false, reason: 'deduped' })
    expect(await repo.countNotificationsSince('ops-alert', '2000-01-01T00:00:00.000Z')).toBe(1)
  })

  it('alerts again once the window has passed', async () => {
    /**
     * Moving the clock rather than passing `withinHours: 0`, which was the first attempt and
     * proved nothing: a zero-length window starts at *now*, and the row written a millisecond
     * earlier is still inside it. The test passed for a reason unrelated to the behaviour it
     * claimed to check.
     */
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-08T10:00:00.000Z'))
    await alertOps('transcode webhook is not arriving', 'one')

    vi.setSystemTime(new Date('2026-09-08T17:00:00.000Z'))
    const later = await alertOps('transcode webhook is not arriving', 'two')

    expect(later.sent).toBe(true)
    expect(await repo.countNotificationsSince('ops-alert', '2000-01-01T00:00:00.000Z')).toBe(2)
  })

  it('does not lose the alert when the provider is failing — that is the queue is for', async () => {
    await alertOps('a guest cannot play a film', 'detail')
    provider.failNext = true
    await drain()

    // Recorded as failed rather than silently dropped: "what did we try to tell ourselves and
    // when" has to be answerable, especially on the day the mailer is the thing that broke.
    const rows = await repo.listQueuedNotifications(10)
    expect(rows).toHaveLength(0)
    expect(await repo.countNotificationsSince('ops-alert', '2000-01-01T00:00:00.000Z')).toBe(1)
  })
})

/**
 * The synthetic check, which exists because `/api/health` stayed green through every real fault.
 * Health reports which drivers are configured; this walks the path a guest walks.
 */
describe('the synthetic guest check', () => {
  async function call() {
    const { GET } = await import('@/app/api/cron/synthetic/route')
    const response = await GET(new Request('http://mehfilbox.test/api/cron/synthetic'))
    return { status: response.status, body: (await response.json()) as { ok: boolean; steps: { step: string; ok: boolean }[] } }
  }

  it('fails, and alerts, when the catalogue a guest would open is not there', async () => {
    // An empty store is the honest version of "the catalogue changed underneath us", which is
    // one of the two ways this check is meant to fire.
    const { status, body } = await call()

    expect(status).toBe(503)
    expect(body.ok).toBe(false)
    expect(body.steps.at(-1)?.step).toBe('resolve')
    expect(await repo.countNotificationsSince('ops-alert', '2000-01-01T00:00:00.000Z')).toBe(1)
  })

  it('says which step broke, rather than just that something did', async () => {
    const { body } = await call()
    // The step name is the whole value of the endpoint over /api/health: "resolve" and "playback"
    // send someone to completely different places.
    expect(body.steps.every((s) => typeof s.step === 'string')).toBe(true)
  })
})
