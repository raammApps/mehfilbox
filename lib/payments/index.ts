import 'server-only'
import { env } from '@/lib/env'
import { FakePaymentProvider, type PaymentProvider } from './provider'
import { RazorpayPaymentProvider } from './razorpay'

/**
 * Which gateway is configured (N-20; Razorpay chosen 17–18 Sept, D-58 amended). `null` when none
 * is — production's state until real keys exist — so a caller that would charge someone has to
 * notice, the same shape as `getDomainProvider()` returning `null` when no host account is
 * configured.
 */
let provider: PaymentProvider | null | undefined

export function getPaymentProvider(): PaymentProvider | null {
  if (provider !== undefined) return provider
  provider =
    env.PAYMENT_DRIVER === 'razorpay'
      ? new RazorpayPaymentProvider()
      : env.PAYMENT_DRIVER === 'fake'
        ? new FakePaymentProvider()
        : env.PAYMENT_DRIVER === 'none'
          ? null
          : // A driver name Zod accepted but no class exists for yet — fail loudly at the seam
            // rather than silently falling back to `none` and granting nothing while a deploy
            // believes it is charging people.
            (() => {
              throw new Error(`PAYMENT_DRIVER=${env.PAYMENT_DRIVER as string} has no driver implemented yet`)
            })()
  return provider
}

/** Test seam, matching `setDomainProvider` and `setVideoProvider`. */
export function setPaymentProvider(next: PaymentProvider | null | undefined): void {
  provider = next
}

export * from './provider'
