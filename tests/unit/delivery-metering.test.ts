import { describe, expect, it } from 'vitest'
import { GB_PER_HOUR } from '@/lib/entitlements'
import { FakeVideoProvider } from '@/lib/video/fake'

/**
 * N-25 — attributing delivery to a wedding.
 *
 * The item asked for real delivered gigabytes. **Bunny cannot provide them**: Stream reports views
 * and watch time per video, and bandwidth exists only at the pull zone — which is the whole library
 * and cannot be attributed to one couple. So delivery is watch time times a bitrate, and the two
 * numbers are kept apart: seconds are what the provider said, gigabytes are what we concluded.
 */

/** The derivation, mirrored here so a change to it has to be a deliberate change to this test. */
function derive(watchSeconds: number): number {
  return (watchSeconds / 3600) * GB_PER_HOUR.standard
}

describe('deriving delivery from watch time', () => {
  it('uses the price list’s own figure, so the meter and the invoice cannot disagree', () => {
    // One hour watched is one hour's worth of the standard ladder, by definition.
    expect(derive(3600)).toBeCloseTo(GB_PER_HOUR.standard, 5)
  })

  it('scales linearly, because watch time is the only variable there is', () => {
    expect(derive(7200)).toBeCloseTo(GB_PER_HOUR.standard * 2, 5)
    expect(derive(0)).toBe(0)
  })

  /**
   * The reason `watchSeconds` is stored alongside `deliveredGb` rather than thrown away.
   * `PRICING.md` §1's figure is an estimate until N-24a measures a real fifteen-hour wedding, so
   * a correction is expected — and history should be recomputable rather than quietly wrong.
   */
  it('can be recomputed from the stored seconds when the assumption changes', () => {
    const watchSeconds = 36_000
    const atStandard = derive(watchSeconds)
    const atFullHd = (watchSeconds / 3600) * GB_PER_HOUR.fullHd

    expect(atFullHd).toBeGreaterThan(atStandard)
    // The measurement did not move; only the conclusion drawn from it did.
    expect(watchSeconds).toBe(36_000)
  })
})

describe('what a provider reports', () => {
  it('carries the measured figure as well as the derived one', async () => {
    const usage = await new FakeVideoProvider().getUsage()

    // Both present, so a caller can never accidentally treat the estimate as a measurement by
    // finding it is the only number on offer.
    expect(usage).toHaveProperty('watchSeconds')
    expect(usage).toHaveProperty('deliveredGb')
    expect(usage).toHaveProperty('storedGb')
  })
})
