import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The Razorpay driver (N-20, D-58 amended 17–18 Sept 2026): Payment Links for `createPayment`,
 * so `checkoutUrl` is a real hosted URL to redirect the payer to rather than an Orders-API id
 * that needs a client-side widget; `X-Razorpay-Signature` HMAC-SHA256 over the raw body for
 * `verifyWebhook`, matching `lib/video/bunny.ts`'s webhook the same way that file matches Bunny's.
 * No network call reaches Razorpay in this suite — `fetch` is stubbed — but the webhook signature
 * is real HMAC, computed the way Razorpay's own SDK would, so a body this test signs is a body a
 * real dashboard-configured secret would also accept.
 */
vi.hoisted(() => {
  process.env.PAYMENT_DRIVER = 'razorpay'
  process.env.RAZORPAY_KEY_ID = 'rzp_test_key'
  process.env.RAZORPAY_KEY_SECRET = 'rzp_test_secret'
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test'
})

import { RazorpayPaymentProvider } from '@/lib/payments/razorpay'

afterEach(() => {
  vi.unstubAllGlobals()
})

function sign(body: string): string {
  return createHmac('sha256', 'whsec_test').update(body).digest('hex')
}

describe('createPayment', () => {
  it('creates a payment link with Basic auth and the paise amount, and returns the short URL', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.razorpay.com/v1/payment_links/')
      expect(init?.method).toBe('POST')
      const auth = Buffer.from('rzp_test_key:rzp_test_secret').toString('base64')
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Basic ${auth}`)
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>
      expect(body.amount).toBe(499_900)
      expect(body.currency).toBe('INR')
      expect(body.reference_id).toBe('reg-1')
      expect(body.callback_method).toBe('get')
      return new Response(JSON.stringify({ id: 'plink_abc123', short_url: 'https://rzp.io/l/abc123' }), {
        status: 200,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const provider = new RazorpayPaymentProvider()
    const intent = await provider.createPayment({
      amountPaise: 499_900,
      purpose: 'Studio registration',
      reference: 'reg-1',
      returnUrl: 'https://mehfilbox.com/admin/register/paid',
    })

    expect(intent).toEqual({ providerRef: 'plink_abc123', checkoutUrl: 'https://rzp.io/l/abc123' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('throws with the status when Razorpay refuses, rather than returning a broken intent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('bad request', { status: 400 })))
    const provider = new RazorpayPaymentProvider()
    await expect(
      provider.createPayment({ amountPaise: 100, purpose: 'x', reference: 'r', returnUrl: 'https://x.test' }),
    ).rejects.toThrow('400')
  })
})

describe('verifyWebhook', () => {
  const paidBody = JSON.stringify({
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: { reference_id: 'reg-1', amount: 499_900 } },
      payment: { entity: { id: 'pay_xyz789', amount: 499_900, status: 'captured' } },
    },
  })

  it('confirms a correctly signed payment_link.paid event', async () => {
    const provider = new RazorpayPaymentProvider()
    const outcome = await provider.verifyWebhook(paidBody, { 'x-razorpay-signature': sign(paidBody) })
    expect(outcome).toEqual({
      reference: 'reg-1',
      status: 'paid',
      amountPaise: 499_900,
      providerPaymentId: 'pay_xyz789',
    })
  })

  it('refuses a body whose signature does not match, and never inspects the payload', async () => {
    const provider = new RazorpayPaymentProvider()
    const outcome = await provider.verifyWebhook(paidBody, { 'x-razorpay-signature': sign('a different body') })
    expect(outcome).toBeNull()
  })

  it('refuses when no signature header is sent at all', async () => {
    const provider = new RazorpayPaymentProvider()
    expect(await provider.verifyWebhook(paidBody, {})).toBeNull()
  })

  /**
   * The event this endpoint is not written to expect reads as failed, not as paid — the
   * conservative default. `payment_link.expired` carries no `payment` entity at all.
   */
  it('reads an unrecognised event as failed rather than crashing or granting credit', async () => {
    const expiredBody = JSON.stringify({
      event: 'payment_link.expired',
      payload: { payment_link: { entity: { reference_id: 'reg-2', amount: 499_900 } } },
    })
    const provider = new RazorpayPaymentProvider()
    const outcome = await provider.verifyWebhook(expiredBody, { 'x-razorpay-signature': sign(expiredBody) })
    expect(outcome).toEqual({ reference: 'reg-2', status: 'failed', amountPaise: 499_900, providerPaymentId: '' })
  })

  it('returns null for a signed body with no reference_id to reconcile against', async () => {
    const bare = JSON.stringify({ event: 'payment_link.paid', payload: {} })
    const provider = new RazorpayPaymentProvider()
    expect(await provider.verifyWebhook(bare, { 'x-razorpay-signature': sign(bare) })).toBeNull()
  })
})

describe('getPaymentProvider', () => {
  it('selects the Razorpay driver when PAYMENT_DRIVER=razorpay', async () => {
    const { getPaymentProvider, setPaymentProvider } = await import('@/lib/payments')
    setPaymentProvider(undefined)
    expect(getPaymentProvider()).toBeInstanceOf(RazorpayPaymentProvider)
  })
})
