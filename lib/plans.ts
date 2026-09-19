import type { CreditBalance, Plan, PlanKind } from '@/lib/schema'

/**
 * The shape of the price list (N-118, D-61) — never a price.
 *
 * Pure and free of `server-only` on purpose: the platform console's client component needs the
 * section titles, unit labels and limits, and none of it is worth a round trip. A price itself only
 * ever arrives from the database, through `lib/pricing.ts`.
 */

/**
 * The plans a credit can be *for* — the three duration plans, in the order a studio reads them.
 * A credit is typed to one of these (D-61), so this is also the only set of keys a bundle may hold.
 */
export const CREDIT_PLAN_IDS = ['deliver', 'keep', 'cinema'] as const
export type CreditPlanId = (typeof CREDIT_PLAN_IDS)[number]

/** Console sections, in reading order. Each `kind` is fulfilled differently (N-20). */
export const PLAN_SECTIONS: { kind: PlanKind; title: string; blurb: string }[] = [
  {
    kind: 'partner',
    title: 'Studio plan',
    blurb: 'What a studio pays to join, and the credits that come with it.',
  },
  {
    kind: 'catalogue',
    title: 'Wedding plans and storage tiers',
    blurb: 'What one wedding is on. A storage tier with no price is not for sale yet.',
  },
  { kind: 'renewal', title: 'Renewals', blurb: 'Keeping a wedding streaming past its first term.' },
  { kind: 'archive', title: 'Archive', blurb: 'Storage only, restorable on demand.' },
  { kind: 'addon', title: 'Upgrade and extras', blurb: 'Bought on top of a wedding that already exists.' },
]

/** What one price buys, in words. An unknown unit shows itself rather than hiding. */
const UNIT_LABELS: Record<string, string> = {
  each: 'per purchase',
  year: 'per year',
  gb_month: 'per GB per month',
  min4k_20: 'per 20 minutes of 4K',
}

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit
}

/**
 * A ceiling on any price typed into the console — ₹10,00,000. Not a business rule; a guard against
 * the extra zero, which is the mistake a live price box is most likely to be given.
 */
export const MAX_PRICE_PAISE = 100_000_000

/** Most credits one bundle may grant. Same reason. */
export const MAX_BUNDLE_QUANTITY = 100

/**
 * A plan's name from the price list — or, when the list could not be read, its id capitalised, which
 * is exactly what the three credit plans are called. Without this a studio told "you have no deliver
 * credit left" (lowercase, an id) would be reading the database's outage in a sentence meant for them.
 */
export function planLabel(plans: Record<string, Pick<Plan, 'name'>>, id: string): string {
  return plans[id]?.name ?? id.charAt(0).toUpperCase() + id.slice(1)
}

/**
 * "2 Deliver credits and 1 Cinema credit" — a typed bundle in words, or `null` when it is empty.
 *
 * Names come from the price list rather than being spelled here, so a plan's name is written in
 * exactly one place (its row) and every sentence that mentions the bundle follows it.
 */
export function describeGrants(grants: Record<string, number>, plans: Record<string, Plan>): string | null {
  const parts = CREDIT_PLAN_IDS.filter((id) => (grants[id] ?? 0) > 0).map((id) => {
    const count = grants[id] ?? 0
    return `${count} ${planLabel(plans, id)} credit${count === 1 ? '' : 's'}`
  })
  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0] ?? null
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/**
 * `{ deliver: 2, keep: 0, cinema: 1 }` — what a studio can spend, per plan, ready for
 * `describeGrants` (N-119). One place so every screen that says "you have…" counts the same thing.
 */
export function availableByPlan(balance: Pick<CreditBalance, 'byPlan'>): Record<CreditPlanId, number> {
  return Object.fromEntries(CREDIT_PLAN_IDS.map((id) => [id, balance.byPlan[id].available])) as Record<
    CreditPlanId,
    number
  >
}

