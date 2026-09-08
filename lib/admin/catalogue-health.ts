import type { CatalogueCounts } from '@/lib/db/repository'
import type { CatalogueStatus, SubStatus } from '@/lib/schema'

/**
 * The one line a catalogue card says about itself.
 *
 * A partner's list is where they decide what to do next, and every card looked identical whether
 * it held fifteen finished films or nothing at all. This turns the row into a decision.
 *
 * Pure and separate from the component so the ordering of the rules — which is the whole
 * substance of it — can be tested without rendering anything.
 */

export type Attention = {
  /** `warn` is something wrong; `act` is something waiting on the operator; `ok` is done. */
  tone: 'warn' | 'act' | 'ok'
  label: string
}

/**
 * Days until a catalogue stops serving, or null when there is no date to count to.
 *
 * Compared as dates rather than instants, so a wedding does not appear to expire a day early for
 * an operator in a timezone behind UTC.
 */
export function daysUntilLapse(includedUntil: string | null | undefined, now = new Date()): number | null {
  if (!includedUntil) return null
  const end = new Date(includedUntil)
  if (Number.isNaN(end.getTime())) return null
  const DAY = 24 * 60 * 60 * 1000
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const b = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate())
  return Math.round((b - a) / DAY)
}

export function catalogueAttention(input: {
  status: CatalogueStatus
  subStatus: SubStatus
  counts: CatalogueCounts
  /** Optional so existing callers keep working; without it, renewal is simply not mentioned. */
  includedUntil?: string | null
  /** Injectable so the ladder can be tested at a date instead of by waiting for one. */
  now?: Date
}): Attention {
  const { counts } = input
  const untilLapse = daysUntilLapse(input.includedUntil, input.now ?? new Date())

  // Ordered by what would embarrass us first. A lapsed wedding is showing guests a renewal
  // screen right now, which beats anything the operator has left half-done.
  if (input.subStatus === 'lapsed' || input.subStatus === 'cold') {
    return { tone: 'warn', label: 'Subscription lapsed' }
  }
  if (counts.failed > 0) {
    return {
      tone: 'warn',
      label: `${counts.failed} film${counts.failed > 1 ? 's' : ''} failed`,
    }
  }
  if (input.subStatus === 'grace') return { tone: 'warn', label: 'Renewal due' }

  /**
   * The console half of the warning ladder (N-21b). The emails are a push; a studio working
   * through their list on a Tuesday should see it without one, and this is the surface where they
   * would act on it.
   *
   * Inside 30 days it outranks housekeeping, because a lapse the studio did not sell against is
   * revenue lost and a couple's page stopping. Between 31 and 60 it is information rather than
   * urgency, so it is checked further down — a renewal seven weeks out should not shout over two
   * films that are still processing.
   */
  if (untilLapse !== null && untilLapse >= 0 && untilLapse <= 30) {
    return {
      tone: 'warn',
      label: untilLapse === 0 ? 'Lapses today' : `Lapses in ${untilLapse} day${untilLapse === 1 ? '' : 's'}`,
    }
  }

  const processing = counts.titles - counts.ready - counts.failed
  if (processing > 0) return { tone: 'act', label: `${processing} still processing` }

  if (counts.titles === 0) return { tone: 'act', label: 'No films yet' }

  if (input.status === 'draft') {
    return counts.published > 0
      ? { tone: 'act', label: 'Ready to publish' }
      : { tone: 'act', label: 'Nothing shown to guests yet' }
  }

  if (counts.published === 0) return { tone: 'warn', label: 'Live, but nothing to watch' }

  /**
   * 31–60 days: worth knowing while the studio is already looking, not worth interrupting them.
   *
   * `>= 0` is not redundant. A catalogue whose date has passed while its sub-status still reads
   * as serving is a real inconsistency — `resolveAccess` guards against exactly it — and without
   * this the console would cheerfully print "Renews in -54 days".
   */
  if (untilLapse !== null && untilLapse >= 0 && untilLapse <= 60) {
    return { tone: 'act', label: `Renews in ${untilLapse} days` }
  }

  return { tone: 'ok', label: 'Live and complete' }
}

/**
 * "in 12 days" / "3 weeks ago", for the wedding date.
 *
 * Days, not months or years: a planner's horizon is the next few weeks, and "in 8 months" is
 * both less useful and more likely to be wrong about the boundary than the plain date already
 * printed beside it.
 */
export function weddingProximity(iso: string, now: Date = new Date()): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null

  // Compare calendar days in UTC, so a wedding "today" does not become "in 0 days" or "yesterday"
  // depending on what time the operator opens the page.
  const day = 864e5
  const toDay = (d: Date) => Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / day)
  const diff = toDay(date) - toDay(now)

  if (diff === 0) return 'today'
  if (diff === 1) return 'tomorrow'
  if (diff === -1) return 'yesterday'
  if (diff > 0) return diff < 14 ? `in ${diff} days` : `in ${Math.round(diff / 7)} weeks`
  const ago = -diff
  if (ago < 14) return `${ago} days ago`
  if (ago < 60) return `${Math.round(ago / 7)} weeks ago`
  return null
}
