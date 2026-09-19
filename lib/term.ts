import { formatWeddingDate } from '@/lib/format'
import { translate } from '@/lib/i18n'
import type { Locale } from '@/lib/schema'

/**
 * How a wedding's term is put into words (N-120, D-61).
 *
 * A term has two honest states and copy has to say which: it has an end (`2027-11-14…`), or it has
 * not started because the wedding has not been published yet (`null`). Printing "until " and then
 * nothing — what `formatWeddingDate` gives for a missing date — is the failure this exists to
 * prevent, so every place that names an end date goes through here or checks for `null` itself.
 *
 * Pure and free of `server-only`: the studio's console components use it too.
 */

/** "14 November 2026", or `null` while the term has not started. */
export function termEnd(includedUntil: string | null, locale: Locale): string | null {
  return includedUntil ? formatWeddingDate(includedUntil, locale) : null
}

/**
 * The clause for an email — "it runs to 14 November 2026", or that its term starts at first
 * Publish. In the reader's language, from the same dictionary as the message around it.
 */
export function termPhrase(includedUntil: string | null, locale: Locale): string {
  const end = termEnd(includedUntil, locale)
  return end === null
    ? translate(locale, 'notify.term.pending')
    : translate(locale, 'notify.term.until', { date: end })
}
