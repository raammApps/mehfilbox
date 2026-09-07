/**
 * The narrow interface over notification delivery (N-50, D-12).
 *
 * One method, no provider types leaking past this file — the same shape `VideoProvider` has, and
 * for the same reason: the choice of provider is a default, not a lock-in. Adding MSG91 for
 * WhatsApp and SMS is a new implementation of this interface plus one line in `lib/notify/index.ts`.
 *
 * **Why a seam before there is a second provider.** MSG91 costs ₹500/month against roughly a
 * hundred messages (D-12), so WhatsApp is deliberately deferred until a real wedding needs it.
 * Building the seam now is what makes that deferral free: the templates, the recording, the
 * per-recipient channel choice and everything that consumes them are written once, and the day
 * WhatsApp is worth paying for it is a driver rather than a rewrite.
 */

/** What a message can travel over. Email works today; the rest are behind D-12's fee. */
export const CHANNELS = ['email', 'whatsapp', 'sms'] as const
export type Channel = (typeof CHANNELS)[number]

/**
 * Where a message is going.
 *
 * `locale` rides with the recipient rather than being looked up at send time, because a
 * notification is queued and sent later — by then the request that knew the locale is long gone,
 * and defaulting to English at that point would quietly undo N-29.
 */
export type Recipient = {
  channel: Channel
  /** An address or an E.164 number, depending on `channel`. */
  address: string
  locale: 'en' | 'hi'
  /** Recorded against the send so "what did this couple receive" is one query. */
  orgId?: string
  catalogueId?: string
}

export type SendResult = {
  /** The provider's own id, so a bounce or a complaint can be traced back to a row. */
  providerId: string | null
  status: 'sent' | 'failed'
  /** Present when `status` is `failed`; the reason is recorded, never surfaced to a guest. */
  error?: string
}

export interface NotificationProvider {
  readonly name: string

  /**
   * Which channels this provider can actually deliver. The caller filters against it rather than
   * discovering at send time that WhatsApp is not configured — a queued message that fails for a
   * reason known at build time is a bug, not a delivery failure.
   */
  readonly channels: readonly Channel[]

  send(input: {
    to: Recipient
    subject: string
    /** Plain text. Every template renders both; a provider uses what its channel supports. */
    text: string
    /** HTML for email. `null` for channels that have no concept of it. */
    html: string | null
  }): Promise<SendResult>
}
