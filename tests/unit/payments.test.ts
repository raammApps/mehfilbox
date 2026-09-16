import { beforeEach, describe, expect, it } from 'vitest'
import { getPaymentProvider, setPaymentProvider } from '@/lib/payments'
import { FakePaymentProvider } from '@/lib/payments/provider'

/**
 * The payment seam (N-20, decided 17 Sept 2026): one interface, so the studio-registration fee,
 * the direct-client fee, and a theme purchase all start a charge and read a webhook the same way
 * regardless of which gateway is eventually chosen. Nothing here decides Razorpay versus Cashfree
 * versus PhonePe — that is `PAYMENT_DRIVER`, unset in every test and in production today.
 */

beforeEach(() => {
  setPaymentProvider(undefined)
})

describe('the fake driver', () => {
  const provider = new FakePaymentProvider()

  it('starts a payment and hands back somewhere to send the payer', async () => {
    const intent = await provider.createPayment({
      amountPaise: 499_900,
      purpose: 'Studio registration',
      reference: 'reg-1',
      returnUrl: 'https://mehfilbox.test/admin/register/paid',
    })
    expect(intent.checkoutUrl).toContain('reg-1')
    expect(intent.providerRef).toContain('reg-1')
  })

  it('confirms a webhook that carries a reference and an amount', async () => {
    const outcome = await provider.verifyWebhook(
      JSON.stringify({ reference: 'reg-1', amountPaise: 499_900 }),
      {},
    )
    expect(outcome).toEqual({
      reference: 'reg-1',
      status: 'paid',
      amountPaise: 499_900,
      providerPaymentId: 'fake_pay_reg-1',
    })
  })

  /** A malformed or incomplete body is not paid, in the same way an unverified signature is not. */
  it('refuses a webhook missing what it needs to reconcile', async () => {
    await expect(provider.verifyWebhook(JSON.stringify({ reference: 'reg-1' }), {})).resolves.toBeNull()
  })
})

describe('getPaymentProvider', () => {
  it('is null when no driver is configured — the product today', () => {
    expect(getPaymentProvider()).toBeNull()
  })

  it('is injectable for a test the way every other provider is', () => {
    const stub = new FakePaymentProvider()
    setPaymentProvider(stub)
    expect(getPaymentProvider()).toBe(stub)
  })
})
