import { describe, expect, it } from 'vitest'
import { GB_PER_HOUR, hoursFor, storageUsage } from '@/lib/entitlements'

/**
 * N-23 — a partner should know what a plan holds before they fill it.
 *
 * The cap was already enforced; what was missing was telling anybody about it in advance. The
 * failure this prevents is specific: a partner meets the limit at 80% *uploaded*, which is the
 * middle of a wedding and hours into a slow connection.
 */

describe('what a plan holds', () => {
  it('translates gigabytes into hours at both ladders', () => {
    // PRICING.md §1: 100 GB is ~46 hours at 720p and ~23 at Full HD.
    expect(hoursFor(100)).toEqual({ standard: 47, fullHd: 23 })
    expect(hoursFor(40)).toEqual({ standard: 19, fullHd: 9 })
  })

  it('keeps the two ladders roughly a factor of two apart, as the price list says', () => {
    // Not a tautology: it is the claim the pricing page makes to a partner choosing a ladder, and
    // a typo in either constant would quietly make that page wrong.
    expect(GB_PER_HOUR.fullHd / GB_PER_HOUR.standard).toBeCloseTo(2, 1)
  })

  it('does not divide by zero on a plan with no storage', () => {
    expect(storageUsage(0, { storageGb: 0 }).ratio).toBe(0)
  })
})

describe('when to warn', () => {
  const GB = 1024 ** 3
  const plan = { storageGb: 100 }

  it('says nothing while there is room', () => {
    expect(storageUsage(50 * GB, plan).level).toBe('ok')
    expect(storageUsage(79 * GB, plan).level).toBe('ok')
  })

  it('warns at exactly 80%, which is what PRICING.md §6 asks for', () => {
    expect(storageUsage(80 * GB, plan).level).toBe('warn')
  })

  it('says full at the cap, not merely nearly full', () => {
    expect(storageUsage(100 * GB, plan).level).toBe('full')
    // Over is still full rather than an error: the cap errs toward letting content in while a
    // film is still transcoding, so a catalogue can legitimately sit slightly over.
    expect(storageUsage(120 * GB, plan).level).toBe('full')
  })

  it('reports the used figure in gigabytes, so the console and the guard cannot disagree', () => {
    expect(storageUsage(50 * GB, plan).usedGb).toBeCloseTo(50, 5)
  })
})
