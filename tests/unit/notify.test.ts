import { beforeEach, describe, expect, it } from 'vitest'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { dictionary } from '@/lib/i18n'
import { FakeNotificationProvider } from '@/lib/notify/fake'
import { setNotificationProvider } from '@/lib/notify'
import { drain, enqueue } from '@/lib/notify/send'
import { render, templateKeys, TEMPLATES } from '@/lib/notify/templates'
import type { Channel, NotificationProvider } from '@/lib/notify/provider'

/**
 * The notification seam (N-50).
 *
 * What is worth testing here is not "did a function return" but the three behaviours the queue
 * exists for: nothing is sent from the request that decided to send it, the message says what was
 * true when it was decided, and a channel we cannot carry yet is **kept**, not burned.
 */
describe('the notification seam', () => {
  let repository: MemoryRepository
  let provider: FakeNotificationProvider

  beforeEach(() => {
    repository = new MemoryRepository(emptySnapshot())
    setRepository(repository)
    provider = new FakeNotificationProvider()
    setNotificationProvider(provider)
  })

  /**
   * The gate that matters most. `lib/i18n.ts` already fails when an English key has no Hindi
   * entry — this asserts the templates are *in* that dictionary, so they inherit it. An expiry
   * warning silently falling back to English is the exact failure D-12 exists to prevent.
   */
  it('has every template in both languages', () => {
    const missing = templateKeys().filter((key) => !(key in dictionary.en))
    expect(missing, 'templates must live in the dictionary to inherit the i18n gate').toEqual([])

    const hindiMissing = templateKeys().filter((key) => !(key in dictionary.hi))
    expect(hindiMissing).toEqual([])
  })

  it('renders a template in Hindi, with the values filled in', () => {
    const out = render('handover', 'hi', {
      coupleName: 'आन्या और विक्रम',
      studioName: 'Kalyanam',
      url: 'https://mehfilbox.com/c/x',
      date: '14 Feb 2027',
    })
    expect(out.subject).toContain('आन्या और विक्रम')
    expect(out.text).toContain('Kalyanam')
    // A placeholder that survived rendering would reach a couple as `{url}`.
    expect(out.text).not.toMatch(/\{[a-z]+\}/i)
    expect(out.html).toContain('https://mehfilbox.com/c/x')
  })

  it('queues without sending — the request never waits on a provider', async () => {
    await enqueue({
      template: 'delivery',
      channel: 'email',
      address: 'couple@example.com',
      locale: 'en',
      params: { coupleName: 'Aanya & Vikram', studioName: 'Kalyanam', url: 'https://x' },
    })

    expect(provider.sent, 'enqueue must not send').toHaveLength(0)
    const queued = await repository.listQueuedNotifications(10)
    expect(queued).toHaveLength(1)
    expect(queued[0]!.status).toBe('queued')
    // Rendered at enqueue time: the catalogue may be renamed or handed over before the drain.
    expect(queued[0]!.subject).toContain('Aanya & Vikram')
  })

  it('sends on drain and records the provider id', async () => {
    await enqueue({
      template: 'delivery',
      channel: 'email',
      address: 'couple@example.com',
      locale: 'en',
      params: { coupleName: 'A & B', studioName: 'S', url: 'https://x' },
    })

    const result = await drain()
    expect(result).toMatchObject({ attempted: 1, sent: 1, failed: 0, skipped: 0 })
    expect(provider.sent).toHaveLength(1)
    expect(provider.sent[0]!.to.address).toBe('couple@example.com')

    // And it leaves the queue, so a second drain does not send it twice.
    expect(await repository.listQueuedNotifications(10)).toHaveLength(0)
    expect((await drain()).attempted).toBe(0)
  })

  /**
   * The behaviour that makes deferring WhatsApp safe (D-12).
   *
   * A WhatsApp row queued before MSG91 exists must stay queued, so it goes out the day that
   * driver lands. Marking it failed because a drain happened to run first would lose the message
   * permanently, and lose it *silently* — the row would read as delivered-and-refused.
   */
  it('keeps a channel the provider cannot carry, rather than burning it', async () => {
    const emailOnly: NotificationProvider = {
      name: 'email-only',
      channels: ['email'] as readonly Channel[],
      send: provider.send.bind(provider),
    }
    setNotificationProvider(emailOnly)

    await enqueue({
      template: 'expiry',
      channel: 'whatsapp',
      address: '+919000000000',
      locale: 'hi',
      params: { coupleName: 'A & B', studioName: 'S', date: '1 Jan', days: 30 },
    })

    const result = await drain()
    expect(result).toMatchObject({ attempted: 0, sent: 0, failed: 0, skipped: 1 })
    expect(provider.sent).toHaveLength(0)

    const still = await repository.listQueuedNotifications(10)
    expect(still, 'the message must survive until a driver can carry it').toHaveLength(1)
    expect(still[0]!.status).toBe('queued')
  })

  it('records a refusal as failed, with the reason and an attempt', async () => {
    await enqueue({
      template: 'grace',
      channel: 'email',
      address: 'couple@example.com',
      locale: 'en',
      params: { coupleName: 'A & B', studioName: 'S', url: 'https://x' },
    })
    provider.failNext = true

    const result = await drain()
    expect(result).toMatchObject({ attempted: 1, sent: 0, failed: 1 })

    // Not left queued: a failure that silently retries forever is how a broken address becomes a
    // loop nobody notices. It is recorded, with the reason, for someone to look at.
    expect(await repository.listQueuedNotifications(10)).toHaveLength(0)
  })

  it('names every template it can send', () => {
    expect(TEMPLATES).toContain('handover')
    expect(TEMPLATES).toContain('expiry')
    expect(new Set(TEMPLATES).size).toBe(TEMPLATES.length)
  })
})
