import 'server-only'
import { getRepository } from '@/lib/db'
import { formatWeddingDate } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import { log } from '@/lib/log'
import type { Catalogue } from '@/lib/schema'
import { publicUrlOf } from '@/lib/address'
import { enqueue } from './send'

/**
 * The warning schedule (N-21).
 *
 * A couple should never be surprised by a wedding that stopped streaming, and a studio should
 * never be surprised by a couple asking why. So both are told, on a fixed ladder, and the message
 * each receives is different — which is the whole point rather than a nicety.
 *
 * **The studio is told because they are the customer.** Under studio-only (D-26) billing never
 * transfers, so a renewal is a decision only the studio can make. **The couple is told because it
 * is their wedding**, and their copy says *contact your studio* — a couple who writes to us has
 * been sent to the wrong place by their own delivery email.
 *
 * Nothing here sends. Every message is queued with a `dedupeKey`, so the cron may run hourly,
 * twice, or be replayed after an outage without a couple receiving the same warning twice — which
 * is what teaches people to ignore the one that mattered.
 */

/** Days before `includedUntil`. Coarse at the top, urgent at the bottom. */
export const BEFORE_EXPIRY = [60, 30, 7, 1] as const

/**
 * Days into grace. 89 rather than 90 deliberately: the last warning has to arrive while something
 * can still be done about it, and on day 90 it is a notification of a thing that has happened.
 */
export const INTO_GRACE = [30, 60, 89] as const

export type ScheduleResult = { examined: number; queued: number; skipped: number }

/** Whole days from `from` to `to`, positive when `to` is in the future. */
function daysBetween(from: Date, to: Date): number {
  const DAY = 24 * 60 * 60 * 1000
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.round((b - a) / DAY)
}

/**
 * Which rung of the ladder this catalogue is on today, or null.
 *
 * Exported for its own test: it is pure arithmetic on two dates, and the alternative is proving a
 * date ladder through a cron, a repository and an email queue.
 */
export function milestoneFor(
  includedUntil: string,
  now: Date,
): { template: 'expiry' | 'grace'; day: number } | null {
  const end = new Date(includedUntil)
  if (Number.isNaN(end.getTime())) return null

  const until = daysBetween(now, end)
  if (until >= 0) {
    const rung = BEFORE_EXPIRY.find((d) => d === until)
    return rung === undefined ? null : { template: 'expiry', day: rung }
  }

  const intoGrace = -until
  const rung = INTO_GRACE.find((d) => d === intoGrace)
  return rung === undefined ? null : { template: 'grace', day: rung }
}

/**
 * Queue every warning due today.
 *
 * `now` is a parameter rather than read inside, so the ladder can be tested at a date instead of
 * by waiting for one.
 */
export async function queueDueWarnings(now: Date = new Date()): Promise<ScheduleResult> {
  const repository = getRepository()
  const catalogues = await repository.listAllCatalogues()
  const result: ScheduleResult = { examined: 0, queued: 0, skipped: 0 }

  for (const catalogue of catalogues) {
    // An archived or draft catalogue has nothing to warn about: one has already lapsed past
    // anything a payment fixes, and the other was never given to anybody.
    if (catalogue.status !== 'published') continue
    result.examined += 1

    const milestone = milestoneFor(catalogue.includedUntil, now)
    if (!milestone) continue

    const params = {
      coupleName: resolveLocalised(catalogue.coupleName, catalogue.locale),
      studioName: catalogue.branding.presentedBy ?? 'your studio',
      url: publicUrlOf(catalogue),
      date: formatWeddingDate(catalogue.includedUntil, catalogue.locale),
      days: milestone.day,
    }

    for (const recipient of await recipientsFor(catalogue)) {
      const queued = await enqueue({
        template: milestone.template,
        channel: 'email',
        address: recipient.address,
        locale: recipient.locale,
        orgId: recipient.orgId,
        catalogueId: catalogue.id,
        params,
        // The whole reason a cron can run every hour without anybody noticing.
        dedupeKey: `${milestone.template}:${catalogue.id}:${milestone.day}:${recipient.role}`,
      })
      if (queued) result.queued += 1
      else result.skipped += 1
    }
  }

  if (result.queued > 0) log.info('warnings queued', result)
  return result
}

type Recipient = { address: string; locale: Catalogue['locale']; orgId: string; role: string }

/**
 * Who hears about this catalogue.
 *
 * The studio always — they are the only party who can act on it. The couple only once the
 * catalogue has been handed over, because before that the "couple" is a row the studio created
 * and the address on it is the studio's own.
 */
async function recipientsFor(catalogue: Catalogue): Promise<Recipient[]> {
  const repository = getRepository()
  const owner = await repository.getOrg(catalogue.orgId)
  if (!owner) return []

  const operators = await repository.listOperators(owner.id)
  const recipients: Recipient[] = operators.map((operator) => ({
    address: operator.email,
    // The studio reads its own language; the couple reads the catalogue's.
    locale: owner.kind === 'couple' ? catalogue.locale : owner.locale,
    orgId: owner.id,
    role: owner.kind === 'couple' ? 'couple' : 'studio',
  }))

  /**
   * After handover the catalogue belongs to the couple's org, and `originOrgId` is the studio that
   * made it. They still get the warning: they are still the customer, the renewal is still theirs
   * to decide, and a studio that hears nothing about a wedding lapsing cannot sell the renewal.
   */
  if (owner.kind === 'couple' && catalogue.originOrgId) {
    const studio = await repository.getOrg(catalogue.originOrgId)
    if (studio) {
      for (const operator of await repository.listOperators(studio.id)) {
        recipients.push({
          address: operator.email,
          locale: studio.locale,
          orgId: studio.id,
          role: 'studio',
        })
      }
    }
  }

  return recipients
}
