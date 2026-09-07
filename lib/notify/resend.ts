import 'server-only'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import type { Channel, NotificationProvider, Recipient, SendResult } from './provider'

/**
 * Email through Resend — the same account Supabase Auth already sends registration through
 * (N-17), so deliverability, SPF, DKIM and the verified domain are all already proven.
 *
 * **Email only, deliberately.** WhatsApp and SMS are a ₹500/month subscription against roughly a
 * hundred messages (D-12), so they wait for a real wedding rather than a build. This driver
 * declaring `channels` honestly is what lets the caller skip a WhatsApp recipient rather than
 * queue a message that can never be delivered.
 */
export class ResendNotificationProvider implements NotificationProvider {
  readonly name = 'resend'
  readonly channels: readonly Channel[] = ['email']

  async send(input: {
    to: Recipient
    subject: string
    text: string
    html: string | null
  }): Promise<SendResult> {
    if (input.to.channel !== 'email') {
      // Reached only if a caller ignored `channels`. Louder than a silent drop, because a
      // notification nobody sent and nobody logged is indistinguishable from one that arrived.
      return { providerId: null, status: 'failed', error: `resend cannot send ${input.to.channel}` }
    }

    const key = env.RESEND_API_KEY
    if (!key) return { providerId: null, status: 'failed', error: 'RESEND_API_KEY is not set' }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: env.NOTIFY_FROM ?? 'Mehfilbox <hello@mehfilbox.com>',
          to: [input.to.address],
          subject: input.subject,
          text: input.text,
          ...(input.html ? { html: input.html } : {}),
        }),
      })

      if (!response.ok) {
        const detail = await response.text().catch(() => '')
        // The body carries Resend's reason; the status alone does not separate a bad key from an
        // unverified sender, and those need opposite fixes.
        log.error('notify: resend rejected', { status: response.status, detail: detail.slice(0, 200) })
        return { providerId: null, status: 'failed', error: `resend ${response.status}` }
      }

      const body = (await response.json()) as { id?: string }
      return { providerId: body.id ?? null, status: 'sent' }
    } catch (error) {
      return {
        providerId: null,
        status: 'failed',
        error: error instanceof Error ? error.message : 'resend: unknown error',
      }
    }
  }
}
