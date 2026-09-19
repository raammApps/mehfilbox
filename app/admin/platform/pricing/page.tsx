import { notFound } from 'next/navigation'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { PricingTable } from '@/components/admin/PricingTable'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * The price list (N-118, D-61).
 *
 * Every figure a customer is quoted is read from here — the marketing page, a studio's credits
 * card, the extra-storage line on a wedding's overview and, once N-20 exists, the checkout. Change
 * one and it changes everywhere, with no deploy; `docs/PRICING.md` records where each number
 * started and is not consulted by anything.
 */
export default async function PlatformPricingPage() {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  // Straight from the repository, uncached: an admin who just saved must see what they saved.
  const plans = await getRepository().listPlans()

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1200px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Pricing</h1>
        <p className="mt-0.5 max-w-[70ch] text-[14px] text-[var(--color-l-text-mid)]">
          What each thing costs, in rupees and excluding GST. A change is live the moment it is saved
          and lands everywhere a price is quoted; a purchase records what was actually charged, so
          nothing already paid for is rewritten. A product with no price is <em>not for sale</em> —
          which is different from free. Every change is on the audit trail.
        </p>
      </header>
      <PlatformNav />

      {plans.length === 0 ? (
        <p className="text-[14px] text-[var(--color-l-text-mid)]">
          The price list is empty. Migration <code>0029_price_list.sql</code> seeds it.
        </p>
      ) : (
        <PricingTable plans={plans} />
      )}
    </div>
  )
}
