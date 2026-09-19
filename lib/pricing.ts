import 'server-only'
import { getRepository } from '@/lib/db'
import { formatRupees } from '@/lib/format'
import { log } from '@/lib/log'
import type { Plan } from '@/lib/schema'

/**
 * The only way code learns a price (N-118, D-61).
 *
 * Nothing in the application holds a rupee figure: the list lives in the `plans` table, the
 * platform console edits it, and a change reaches every page that quotes it without a deploy.
 * `tests/unit/no-price-in-code.test.ts` is what keeps that true — it fails if a figure is typed
 * back into a source file or into the help pages that render from the repo.
 *
 * Two readers, because two different things can go wrong and they deserve different answers:
 *
 * - **`getPrice` is strict.** It is what a checkout charges from (N-20). If the list cannot be read
 *   it throws, because a payment taken at a guessed price is worse than one that fails loudly.
 * - **`getPriceListForDisplay` never throws.** It is for copy — the marketing page, a studio's
 *   credits card. Those must not turn into a 500 because a migration has not been applied yet or
 *   the database blinked; they render without the figure and log why.
 */

export type PriceList = Record<string, Plan>

/** Whole paise, ex-GST — or `null` when the product is off sale or is not on the list at all. */
export async function getPrice(planId: string): Promise<number | null> {
  return (await getRepository().getPlan(planId))?.pricePaise ?? null
}

/** The whole list keyed by id, for a page that quotes several prices. Empty rather than throwing. */
export async function getPriceListForDisplay(): Promise<PriceList> {
  try {
    const plans = await getRepository().listPlans()
    return Object.fromEntries(plans.map((plan) => [plan.id, plan]))
  } catch (error) {
    log.error('pricing: the price list could not be read; rendering without prices', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return {}
  }
}

/** `₹1,999`, or `null` for a product that is off sale, unknown, or on a list that could not be read. */
export function priceLabel(list: PriceList, planId: string): string | null {
  const paise = list[planId]?.pricePaise
  return paise === null || paise === undefined ? null : formatRupees(paise)
}

/** `₹5,000 – ₹8,000` — the advisory "studios typically charge" range, or `null` when there is none. */
export function retailLabel(list: PriceList, planId: string): string | null {
  const plan = list[planId]
  if (!plan || plan.retailMinPaise === null || plan.retailMaxPaise === null) return null
  return `${formatRupees(plan.retailMinPaise)} – ${formatRupees(plan.retailMaxPaise)}`
}
