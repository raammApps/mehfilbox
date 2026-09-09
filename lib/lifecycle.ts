import 'server-only'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { formatWeddingDate } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import { log } from '@/lib/log'
import { enqueue } from '@/lib/notify/send'
import type { Catalogue, SubStatus } from '@/lib/schema'
import { catalogueUrl } from '@/lib/tenant'

/**
 * The lapse ladder (N-24, `PRICING.md` §2).
 *
 * A term ends → **90 days' grace**, everything still playing → **cold**: streaming paused, every
 * file retained, one click to restore. `deleted` is not on this ladder and never will be — it
 * exists in the state machine only for an explicit, recorded request from the couple.
 *
 * The state machine and `resolveAccess` have honoured these states since Phase 0. **Nothing wrote
 * them**, so a wedding whose term ended a year ago is still serving, and one nobody renewed still
 * costs us Stream storage. This is the part that moves.
 */

/** `PRICING.md` §2. Everything still plays throughout; the warning ladder runs across it (N-21). */
export const GRACE_DAYS = 90

/** Whole days between two dates, comparing dates rather than instants. */
function daysBetween(from: Date, to: Date): number {
  const DAY = 24 * 60 * 60 * 1000
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate())
  return Math.round((b - a) / DAY)
}

/**
 * Where this catalogue should be today, or null if it is already there.
 *
 * Pure, and exported for its own test: a ladder made of two dates should be provable without a
 * cron, a repository and a mail queue in the way.
 */
export function nextSubStatus(
  catalogue: Pick<Catalogue, 'subStatus' | 'includedUntil'>,
  now: Date,
): SubStatus | null {
  const end = new Date(catalogue.includedUntil)
  if (Number.isNaN(end.getTime())) return null

  const sinceEnd = daysBetween(end, now)

  /**
   * `included` and `active` are the paid states. They fall to grace the day *after* the term ends,
   * never on the last day — a catalogue serves through the whole of its final day in every
   * timezone a guest might be in, which is the same rule `resolveAccess` applies.
   */
  if ((catalogue.subStatus === 'included' || catalogue.subStatus === 'active') && sinceEnd > 0) {
    return 'grace'
  }

  if (catalogue.subStatus === 'grace' && sinceEnd > GRACE_DAYS) return 'cold'

  /**
   * Nothing else moves on its own. `lapsed` and `cold` are terminal until somebody pays, and
   * `deleted` is reachable only from a recorded request — a job that could delete a wedding on a
   * timer is the one thing this product must never contain.
   */
  return null
}

export type LifecycleResult = { examined: number; toGrace: number; toCold: number }

/**
 * Move every catalogue that is due, and tell somebody each time.
 *
 * **Never silently** (`PRICING.md` §2). Each transition writes a log line and queues the message
 * for it, so "what was sent, and when" is answerable from the `notifications` table rather than
 * from memory. The key makes a replayed day a no-op, the same way the warning ladder does (N-21).
 */
export async function runLifecycle(now: Date = new Date()): Promise<LifecycleResult> {
  const repository = getRepository()
  const catalogues = await repository.listAllCatalogues()
  const result: LifecycleResult = { examined: 0, toGrace: 0, toCold: 0 }

  for (const catalogue of catalogues) {
    // A draft was never given to anyone, so it has no term to run out.
    if (!catalogue.publishedAt) continue
    result.examined += 1

    const next = nextSubStatus(catalogue, now)
    if (!next) continue

    await repository.updateCatalogue(catalogue.id, catalogue.orgId, { subStatus: next })

    if (next === 'grace') result.toGrace += 1
    else result.toCold += 1

    log.info('lifecycle: catalogue moved', {
      catalogueId: catalogue.id,
      from: catalogue.subStatus,
      to: next,
    })

    await tell(catalogue, next)
  }

  if (result.toGrace > 0 || result.toCold > 0) log.info('lifecycle: complete', result)
  return result
}

/**
 * The message that goes with a transition.
 *
 * Grace is already covered by the warning ladder's 30/60/89-day rungs (N-21), so the only thing
 * worth its own message is going cold — the moment streaming actually stops, which is the one a
 * couple will notice and the one `PRICING.md` §2 says must never happen quietly.
 */
async function tell(catalogue: Catalogue, next: SubStatus): Promise<void> {
  if (next !== 'cold') return

  const repository = getRepository()
  const owner = await repository.getOrg(catalogue.orgId)
  if (!owner) return

  const params = {
    coupleName: resolveLocalised(catalogue.coupleName, catalogue.locale),
    studioName: catalogue.branding.presentedBy ?? 'your studio',
    url: catalogueUrl(catalogue.slug, env.ROOT_DOMAIN, '/', env.TENANCY_MODE),
    date: formatWeddingDate(catalogue.includedUntil, catalogue.locale),
  }

  for (const operator of await repository.listOperators(owner.id)) {
    await enqueue({
      template: 'archived',
      channel: 'email',
      address: operator.email,
      locale: owner.kind === 'couple' ? catalogue.locale : owner.locale,
      orgId: owner.id,
      catalogueId: catalogue.id,
      params,
      dedupeKey: `archived:${catalogue.id}:${operator.id}`,
    })
  }
}
