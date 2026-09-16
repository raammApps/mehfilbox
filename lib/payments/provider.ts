import 'server-only'

/**
 * The narrow interface over collecting money (N-20, D-55/D-56/D-57), mirroring `VideoProvider`
 * and `DomainProvider`: one seam, no gateway type leaking past this file. Razorpay, Cashfree and
 * PhonePe are all under consideration (17 Sept 2026) rather than decided, and this is what makes
 * that an env value instead of a rewrite when the choice is made — a new class implementing this
 * interface and one line in `lib/payments/index.ts`.
 *
 * Two calls only, because that is all four current use cases share: a studio's or a client's
 * registration fee, a client's theme purchase, and a studio topping up credits. Each is "start a
 * charge for this much, for this reason" and "was it actually paid" — everything gateway-specific
 * (checkout UI, saved cards, refunds) stays inside the driver.
 */

export type CreatePaymentInput = {
  /** Whole paise, never a float — ₹4,999 is `499900`. */
  amountPaise: number
  /** Shown on the gateway's own checkout page and in `payments.purpose`, never parsed. */
  purpose: string
  /** Ours, not the gateway's — `payments.id`, so the webhook can find the row it is confirming. */
  reference: string
  /** Absolute URL the gateway redirects the payer to when checkout finishes, success or not. */
  returnUrl: string
}

export type PaymentIntent = {
  /** The gateway's own id for this attempt — logged, never trusted in place of the webhook. */
  providerRef: string
  /** Where to send the payer. Every driver so far is a hosted checkout; nothing assumes it must be. */
  checkoutUrl: string
}

export type PaymentOutcome = {
  reference: string
  status: 'paid' | 'failed'
  amountPaise: number
  /** The gateway's own id for the money that moved, kept for reconciliation and a refund later. */
  providerPaymentId: string
}

export interface PaymentProvider {
  readonly name: string

  /** Start a charge. Returns where to send the payer; nothing is paid yet. */
  createPayment(input: CreatePaymentInput): Promise<PaymentIntent>

  /**
   * Verify a webhook body against the gateway's own signature and return what it says happened,
   * or `null` for a payload that fails verification — which the caller must treat as **not paid**,
   * exactly as `lib/notify/*` treats an unverified Bunny webhook. The raw body is required, not
   * the parsed one: an HMAC is computed over exact bytes, and a route that parses first and signs
   * second is a route that can be forged with reformatted JSON.
   */
  verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentOutcome | null>
}

/**
 * Deterministic and instant, for the test suite and a local demo — never for production, exactly
 * like `FakeDomainProvider` and the video and photo fakes. Every payment it starts is confirmed as
 * paid the moment the caller asks the webhook route about it, with no separate "click pay" step,
 * because nothing here models a payer's UI.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake'

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    return {
      providerRef: `fake_${input.reference}`,
      checkoutUrl: `${input.returnUrl}?fake_payment=paid&reference=${encodeURIComponent(input.reference)}`,
    }
  }

  async verifyWebhook(rawBody: string, _headers: Record<string, string>): Promise<PaymentOutcome | null> {
    const body = JSON.parse(rawBody) as { reference?: string; amountPaise?: number; providerPaymentId?: string }
    if (!body.reference || !body.amountPaise) return null
    return {
      reference: body.reference,
      status: 'paid',
      amountPaise: body.amountPaise,
      providerPaymentId: body.providerPaymentId ?? `fake_pay_${body.reference}`,
    }
  }
}
