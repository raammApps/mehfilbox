import 'server-only'
import { randomUUID } from 'node:crypto'
import { getRepository } from '@/lib/db'
import { publishCreditSchema, type PublishCredit } from '@/lib/schema'

/**
 * Credits (D-38, doc 16 §7): the first published wedding is free, the second needs one.
 *
 * Registration grants exactly one. A catalogue's first publish spends one; a republish after an
 * unpublish spends nothing; a catalogue published before credits existed has `publishedAt` set
 * and is untouched. Until online payment lands (N-20), the platform console grants them with a
 * reason on the audit row.
 */
export const CREDIT_TERM_MONTHS = 24
export const REGISTRATION_GRANT = 1
export const MAX_GRANT = 50

export function makeCredits(input: {
  orgId: string
  count: number
  grantedBy: string
  reason?: string
  planId?: string
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
