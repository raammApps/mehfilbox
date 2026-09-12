import { describe, expect, it } from 'vitest'
import { contrastRatio, judgeAccent, parseHex, SURFACE_0 } from '@/lib/contrast'

/** doc 10 §1 test 10: the contrast validator flags a known-bad accent. */

describe('contrastRatio', () => {
  /**
   * The minimums are the contract; doc 04 §2's quoted figures are approximate (its 17.4:1 for
   * --text-hi computes to 17.9:1 against --surface-0, a rounding difference, not a defect).
   * These assertions pin the thresholds that matter and allow ±0.6 on the quoted numbers.
   */
  it('meets every pairing required by doc 04 §2', () => {
    expect(contrastRatio('#f5f5f6', SURFACE_0)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#c4c4c8', SURFACE_0)).toBeGreaterThanOrEqual(4.5)
    // --text-lo is documented as the minimum permitted; a regression below 4.5 is a real bug.
    expect(contrastRatio('#93939a', SURFACE_0)).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio('#ffffff', '#d11a2a')).toBeGreaterThanOrEqual(4.5)
    // The accent is UI-only on black, so 3:1 is the bar — red body copy is not permitted.
    expect(contrastRatio('#d11a2a', SURFACE_0)).toBeGreaterThanOrEqual(3)
    expect(contrastRatio('#d11a2a', SURFACE_0)).toBeLessThan(4.5)
  })

  /**
   * Regression pins on the actual computed values. Doc 04 §2's table is approximate — its
   * figures for --text-lo (5.4 vs 6.4) and --accent (4.1 vs 3.6) differ from a WCAG 2.1
   * computation against --surface-0. Every pairing still clears its required minimum, so the
   * palette stands; these numbers exist so a future palette edit shows up as a diff.
   */
  it('pins the computed ratios so a palette edit is visible in review', () => {
    expect(contrastRatio('#f5f5f6', SURFACE_0)).toBeCloseTo(17.95, 1)
    expect(contrastRatio('#c4c4c8', SURFACE_0)).toBeCloseTo(11.24, 1)
    expect(contrastRatio('#93939a', SURFACE_0)).toBeCloseTo(6.41, 1)
    expect(contrastRatio('#ffffff', '#d11a2a')).toBeCloseTo(5.4, 1)
    expect(contrastRatio('#d11a2a', SURFACE_0)).toBeCloseTo(3.62, 1)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(contrastRatio('#000000', '#ffffff'), 5)
  })

  it('accepts three-digit hex and a missing hash', () => {
    expect(parseHex('fff')).toEqual({ r: 255, g: 255, b: 255 })
    expect(parseHex('#000')).toEqual({ r: 0, g: 0, b: 0 })
  })

  it('throws on an unparseable colour rather than returning a plausible number', () => {
    expect(() => contrastRatio('rebeccapurple', SURFACE_0)).toThrow()
  })
})

describe('judgeAccent', () => {
  it('passes the shipped accent', () => {
    const verdict = judgeAccent('#d11a2a')
    expect(verdict.ok).toBe(true)
    expect(verdict.warning).toBeUndefined()
  })

  it('rejects a dark navy that vanishes against the black surface', () => {
    const verdict = judgeAccent('#101a3a')
    expect(verdict.ok).toBe(false)
    expect(verdict.warning).toMatch(/hard to see/i)
  })

  /**
   * The planner's brand pink used to fail here on white button text. Since D-35 the ink is chosen
   * per accent — white or near-black, whichever reads — so the pink passes with dark lettering,
   * and the only accent that fails on its label is a mid-tone that neither ink can sit on.
   */
  it("accepts the planner's brand pink now that the button text can go dark", () => {
    const verdict = judgeAccent('#ff8fc7')
    expect(verdict.ok).toBe(true)
    expect(verdict.inkOnAccent).toBeGreaterThanOrEqual(4.5)
  })

  it('rejects a mid grey that neither white nor near-black text can read on', () => {
    const verdict = judgeAccent('#7a7a7a')
    expect(verdict.ok).toBe(false)
    expect(verdict.warning).toMatch(/button text/i)
  })

  it('writes warnings for an operator, not a developer', () => {
    const verdict = judgeAccent('#7a7a7a')
    expect(verdict.warning).not.toMatch(/wcag|ratio|contrast ratio|4\.5/i)
  })
})
