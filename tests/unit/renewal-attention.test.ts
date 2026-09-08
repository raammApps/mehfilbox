import { describe, expect, it } from 'vitest'
import { catalogueAttention, daysUntilLapse } from '@/lib/admin/catalogue-health'

/**
 * N-21b — the console half of the warning ladder.
 *
 * The emails are a push. A studio working through their list on a Tuesday should see a wedding
 * coming up for renewal without one, on the surface where they would act on it.
 */

const NOW = new Date('2026-06-01T09:00:00.000Z')
const healthy = {
  status: 'published' as const,
  subStatus: 'included' as const,
  counts: { titles: 3, ready: 3, failed: 0, published: 3, photos: 10 },
}

function endingIn(days: number): string {
  const end = new Date(NOW)
  end.setUTCDate(end.getUTCDate() + days)
  return end.toISOString().slice(0, 10)
}

describe('counting to a lapse', () => {
  it('counts in whole days, whatever the hour', () => {
    expect(daysUntilLapse(endingIn(30), NOW)).toBe(30)
    expect(daysUntilLapse(endingIn(30), new Date('2026-06-01T23:59:00.000Z'))).toBe(30)
  })

  it('goes negative once it has passed, rather than clamping', () => {
    expect(daysUntilLapse(endingIn(-5), NOW)).toBe(-5)
  })

  it('says nothing when there is no date, rather than guessing', () => {
    expect(daysUntilLapse(null, NOW)).toBeNull()
    expect(daysUntilLapse('not-a-date', NOW)).toBeNull()
  })
})

describe('what the console says about a renewal', () => {
  it('is quiet while a renewal is far away', () => {
    expect(catalogueAttention({ ...healthy, now: NOW, includedUntil: endingIn(120) }).tone).toBe('ok')
  })

  it('mentions it between 31 and 60 days, without shouting', () => {
    const attention = catalogueAttention({ ...healthy, now: NOW, includedUntil: endingIn(45) })
    // `act`, not `warn`: a renewal seven weeks out is worth knowing while the studio is already
    // looking, and is not worth interrupting them for.
    expect(attention.tone).toBe('act')
    expect(attention.label).toMatch(/Renews in 45 days/)
  })

  it('warns inside 30 days, where a lapse is revenue the studio did not sell against', () => {
    const attention = catalogueAttention({ ...healthy, now: NOW, includedUntil: endingIn(7) })
    expect(attention.tone).toBe('warn')
    expect(attention.label).toBe('Lapses in 7 days')
  })

  it('says "today" rather than "in 0 days"', () => {
    expect(catalogueAttention({ ...healthy, now: NOW, includedUntil: endingIn(0) }).label).toBe('Lapses today')
  })

  /**
   * Ordering is the interesting part. A wedding a week from lapsing outranks housekeeping; a
   * failed film still outranks the renewal, because it is broken now rather than soon.
   */
  it('lets a failed film outrank an imminent renewal', () => {
    const attention = catalogueAttention({
      ...healthy,
      counts: { ...healthy.counts, failed: 1 },
      now: NOW, includedUntil: endingIn(7),
    })
    expect(attention.label).toMatch(/failed/)
  })

  it('lets an imminent renewal outrank films still processing', () => {
    const attention = catalogueAttention({
      ...healthy,
      counts: { ...healthy.counts, ready: 1 },
      now: NOW, includedUntil: endingIn(7),
    })
    expect(attention.label).toBe('Lapses in 7 days')
  })

  it('says nothing new when there is no renewal date at all', () => {
    expect(catalogueAttention({ ...healthy, now: NOW, includedUntil: null }).tone).toBe('ok')
  })

  /**
   * The bug this branch shipped with for about a minute: a catalogue whose date has passed while
   * its sub-status still reads as serving would have printed "Renews in -54 days".
   */
  it('does not offer to renew a date that has already gone', () => {
    const attention = catalogueAttention({ ...healthy, now: NOW, includedUntil: endingIn(-54) })
    expect(attention.label).not.toMatch(/-/)
    expect(attention.tone).toBe('ok')
  })
})
