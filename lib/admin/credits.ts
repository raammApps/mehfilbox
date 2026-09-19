import 'server-only'
import { randomUUID } from 'node:crypto'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { availableByPlan, describeGrants, planLabel, type CreditPlanId } from '@/lib/plans'
import { getPriceListForDisplay } from '@/lib/pricing'
import { publishCreditSchema, type PublishCredit } from '@/lib/schema'

/**
 * Credits (D-38, doc 16 §7): the first published wedding is free, the second needs one.
 *
 * Registration grants exactly one. A catalogue's first publish spends one **of the plan the wedding
 * is on** (N-119, D-61) — Deliver, Keep and Cinema are separate baskets, so an empty Deliver basket
 * refuses a Deliver publish even while Cinema credits remain. A republish after an unpublish spends
 * nothing; a catalogue published before credits existed has `publishedAt` set and is untouched.
 * Until online payment lands (N-20), the platform console grants them with a reason on the audit row.
 */
export const CREDIT_TERM_MONTHS = 24
export const REGISTRATION_GRANT = 1
export const MAX_GRANT = 50

export function makeCredits(input: {
  orgId: string
  count: number
  grantedBy: string
  reason?: string
  planId?: CreditPlanId
  now?: Date
}): PublishCredit[] {
  const now = input.now ?? new Date()
  const expires = new Date(now)
  expires.setMonth(expires.getMonth() + CREDIT_TERM_MONTHS)
  return Array.from({ length: input.count }, () =>
    publishCreditSchema.parse({
      id: randomUUID(),
      orgId: input.orgId,
      planId: input.planId ?? 'deliver',
      grantedBy: input.grantedBy,
      reason: input.reason ?? '',
      purchasedAt: now.toISOString(),
      expiresAt: expires.toISOString(),
    }),
  )
}

/** The trial: one credit, so the first wedding publishes and the second is the conversation. */
export async function grantRegistrationCredit(orgId: string, now = new Date()): Promise<PublishCredit[]> {
  return getRepository().grantCredits(
    makeCredits({
      orgId,
      count: REGISTRATION_GRANT,
      grantedBy: 'registration',
      reason: 'Your first wedding is on us.',
      now,
    }),
  )
}

/**
 * What a studio needs to know when a wedding's basket is empty: the plan's name, and whether it
 * holds credits of another plan instead (N-119). The second half is the useful one — "you have no
 * Keep credit" is an answer, but "you have no Keep credit, and you do have a Deliver one" is a way
 * forward, because the plan can be changed until first publish.
 *
 * Names are read from the price list, never spelled here, so a plan is called one thing everywhere.
 */
export async function creditContext(
  orgId: string,
  planId: CreditPlanId,
  nowIso: string,
): Promise<{ planName: string; otherAvailable: string | null }> {
  const [balance, prices] = await Promise.all([
    getRepository().creditBalance(orgId, nowIso),
    getPriceListForDisplay(),
  ])
  const others = Object.fromEntries(
    Object.entries(availableByPlan(balance)).filter(([id]) => id !== planId),
  )
  return { planName: planLabel(prices, planId), otherAvailable: describeGrants(others, prices) }
}

/** The refusal for a first publish with an empty basket — named, and pointing at what to do next. */
export async function creditRefusal(orgId: string, planId: CreditPlanId, nowIso: string): Promise<ApiError> {
  const { planName, otherAvailable } = await creditContext(orgId, planId, nowIso)
  const way = otherAvailable
    ? ` You do have ${otherAvailable} — change this wedding's plan to spend one, or ask for a ${planName} credit.`
    : ''
  return new ApiError(
    'CREDIT_REQUIRED',
    `This wedding is on the ${planName} plan, and you have no ${planName} credits left to spend.${way}`,
  )
}

