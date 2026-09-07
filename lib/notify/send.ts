import 'server-only'
import { randomUUID } from 'node:crypto'
import { getRepository } from '@/lib/db'
import { notificationSchema, type Notification } from '@/lib/schema'
import { getNotificationProvider } from './index'
import { render, type TemplateName } from './templates'

/**
 * Queue a message. **Never sends** — `/api/cron/notify` drains (N-50).
 *
 * Rendered here rather than at send time, and that is the interesting choice. Between queueing and
 * sending, a catalogue can lapse, be renamed or be handed to the couple; a warning that describes
 * a state they have already left is worse than a late one. Rendering now freezes what was true
 * when the decision to send was made.
 */
export async function enqueue(input: {
  template: TemplateName
  channel: Notification['channel']
  address: string
  locale: Notification['locale']
  params?: Record<string, string | number>
  orgId?: string | null
  catalogueId?: string | null
}): Promise<Notification> {
  const rendered = render(input.template, input.locale, input.params ?? {})

  const notification = notificationSchema.parse({
    id: randomUUID(),
    template: input.template,
    channel: input.channel,
    address: input.address,
    locale: input.locale,
    subject: rendered.subject,
    bodyText: rendered.text,
    bodyHtml: rendered.html,
    orgId: input.orgId ?? null,
    catalogueId: input.catalogueId ?? null,
    status: 'queued',
    createdAt: new Date().toISOString(),
  })

  return getRepository().enqueueNotification(notification)
}

export type DrainResult = { attempted: number; sent: number; failed: number; skipped: number }

/**
 * Send everything queued, oldest first, and record what happened to each.
 *
 * **A channel the provider cannot carry is skipped, not failed.** Today `resend` handles email
 * only, so a WhatsApp row queued before MSG91 exists (D-12) stays `queued` and goes out the day
 * that driver lands — rather than being burned as a permanent failure by a drain that happened to
 * run first. That is the difference between deferring WhatsApp and losing the messages.
 */
export async function drain(limit = 50): Promise<DrainResult> {
  const repository = getRepository()
  const provider = getNotificationProvider()
  const queued = await repository.listQueuedNotifications(limit)

  const result: DrainResult = { attempted: 0, sent: 0, failed: 0, skipped: 0 }

  for (const row of queued) {
    if (!provider.channels.includes(row.channel)) {
      result.skipped += 1
      continue
    }

    result.attempted += 1
    const outcome = await provider.send({
      to: { channel: row.channel, address: row.address, locale: row.locale },
      subject: row.subject,
      text: row.bodyText,
      html: row.bodyHtml,
    })

    await repository.markNotification(row.id, {
      status: outcome.status,
      provider: provider.name,
      providerId: outcome.providerId,
      error: outcome.error ?? null,
      attempts: row.attempts + 1,
    })

    if (outcome.status === 'sent') result.sent += 1
    else result.failed += 1
  }

  return result
}
