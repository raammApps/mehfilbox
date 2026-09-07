import type { Channel, NotificationProvider, Recipient, SendResult } from './provider'

export type Sent = {
  to: Recipient
  subject: string
  text: string
  html: string | null
  at: string
}

/**
 * The driver the suite runs against — it delivers nothing and remembers everything.
 *
 * `sent` is the assertion surface: a test says "the couple was told, in Hindi, on this address"
 * rather than "no exception was thrown". That distinction is the whole reason `VideoProvider` has
 * a fake, and the reason the E2E suite can run offline.
 */
export class FakeNotificationProvider implements NotificationProvider {
  readonly name = 'fake'
  readonly channels: readonly Channel[] = ['email', 'whatsapp', 'sms']

  readonly sent: Sent[] = []

  /** Set to make the next send fail, so callers can be tested against a refusal. */
  failNext = false

  async send(input: {
    to: Recipient
    subject: string
    text: string
    html: string | null
  }): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false
      return { providerId: null, status: 'failed', error: 'fake: forced failure' }
    }
    this.sent.push({ ...input, at: new Date().toISOString() })
    return { providerId: `fake-${this.sent.length}`, status: 'sent' }
  }

  reset(): void {
    this.sent.length = 0
    this.failNext = false
  }
}
