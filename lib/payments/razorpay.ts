import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import type { CreatePaymentInput, PaymentIntent, PaymentOutcome, PaymentProvider } from './provider'

/**
 * Razorpay, chosen 17–18 Sept 2026 (amends D-58: no longer undecided among Razorpay, Cashfree and
 * PhonePe). Built against Razorpay's **Payment Links** API, not Orders/Checkout — Payment Links
 * hands back a hosted URL to redirect the payer to, which is exactly what `PaymentIntent.checkoutUrl`
 * promises; Orders needs a client-side widget embedded in a page, a different integration shape
 * this seam does not assume.
 *
 * `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` are the account's API credentials, valid in test mode
 * with no business KYC — sign-up alone is enough to generate them, but that sign-up is Sandeep's
 * to do, not this session's (account creation on someone's behalf is out of scope here, same as
 * every other credentialed driver in this codebase). `RAZORPAY_WEBHOOK_SECRET` is separate again:
 * configured in the dashboard's Webhooks tab, and it is what signs the webhook, never the API key
 * secret — the same three-separate-keys shape Bunny has (`lib/video/bunny.ts`), and the same
 * class of mistake if they are swapped.
 *
 * Until Sandeep drops real keys in, `PAYMENT_DRIVER` stays `none` or `fake`; this class exists so
 * the switch to test-mode Razorpay, and later live Razorpay, is an env change, not a rewrite.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay'

  private authHeader(): string {
    const credentials = `${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`
    return `Basic ${Buffer.from(credentials).toString('base64')}`
  }

  async createPayment(input: CreatePaymentInput): Promise<PaymentIntent> {
    const response = await fetch('https://api.razorpay.com/v1/payment_links/', {
      method: 'POST',
      headers: { Authorization: this.authHeader(), 'content-type': 'application/json' },
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: 'INR',
        description: input.purpose,
        reference_id: input.reference,
        callback_url: input.returnUrl,
        callback_method: 'get',
        // 24h: long enough to actually pay, short enough that a stale link is not a live charge
        // waiting to be reused. Razorpay requires at least 15 minutes and allows up to 6 months.
        expire_by: Math.floor(Date.now() / 1000) + 24 * 60 * 60,
      }),
      signal: AbortSignal.timeout(8000),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      log.error('payments: razorpay refused to create a payment link', {
        reference: input.reference,
        status: response.status,
        detail: detail.slice(0, 300),
      })
      throw new Error(`Razorpay refused the payment (${response.status}).`)
    }

    const body = (await response.json()) as { id: string; short_url: string }
    return { providerRef: body.id, checkoutUrl: body.short_url }
  }

  async verifyWebhook(rawBody: string, headers: Record<string, string>): Promise<PaymentOutcome | null> {
    /**
     * Signed over the **raw** body with HMAC-SHA256, keyed by the webhook secret, hex-encoded, in
     * `X-Razorpay-Signature` — verified exactly as received, never parsed and re-serialised first,
     * for the same reason `lib/video/bunny.ts`'s webhook does it this way: JSON re-serialisation
     * is not guaranteed byte-identical to what was signed, and a route that parses before it
     * verifies is a route a reformatted body can forge.
     */
    const secret = env.RAZORPAY_WEBHOOK_SECRET
    if (!secret) {
      log.error('payments: RAZORPAY_WEBHOOK_SECRET is unset — rejecting', {
        fix: 'set it to the secret configured in the Razorpay dashboard, Settings → Webhooks',
      })
      return null
    }

    const provided = (headers['x-razorpay-signature'] ?? headers['X-Razorpay-Signature'] ?? '').toLowerCase()
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')

    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      log.warn('payments: razorpay webhook signature mismatch', {
        headersSeen: Object.keys(headers).filter((k) => k.toLowerCase().startsWith('x-')).join(','),
        providedLength: provided.length,
      })
      return null
    }

    const payload = JSON.parse(rawBody) as {
      event?: string
      payload?: {
        payment_link?: { entity?: { reference_id?: string; amount?: number } }
        payment?: { entity?: { id?: string; amount?: number; status?: string } }
      }
    }

    const link = payload.payload?.payment_link?.entity
    const payment = payload.payload?.payment?.entity
    if (!link?.reference_id) return null

    /**
     * `payment_link.paid` is the only event this treats as paid. Every other event this endpoint
     * might receive — `payment_link.expired`, `payment_link.cancelled`, a bare `payment.failed`
     * — is read as failed, deliberately the conservative default: an event this driver does not
     * recognise must never be read as money received. `payment` is absent on some of those events,
     * so nothing here assumes it is present outside the paid case.
     */
    if (payload.event === 'payment_link.paid' && payment?.id) {
      return {
        reference: link.reference_id,
        status: 'paid',
        amountPaise: payment.amount ?? link.amount ?? 0,
        providerPaymentId: payment.id,
      }
    }

    return {
      reference: link.reference_id,
      status: 'failed',
      amountPaise: link.amount ?? 0,
      providerPaymentId: payment?.id ?? '',
    }
  }
}
