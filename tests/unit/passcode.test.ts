import { describe, expect, it } from 'vitest'
import { generatePasscode } from '@/lib/passcode'

/**
 * The "generate one for me" button (N-77), on the studio's settings screen, the couple's own
 * panel, and the wizard — one implementation, isomorphic so a client component can call it
 * without a round trip (`lib/passcode.ts`'s own doc comment explains why no `server-only`).
 */
describe('generatePasscode', () => {
  it('is always six digits, never a leading zero', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generatePasscode()
      expect(code).toMatch(/^[1-9]\d{5}$/)
      expect(Number(code)).toBeGreaterThanOrEqual(100_000)
      expect(Number(code)).toBeLessThanOrEqual(999_999)
    }
  })

  it('does not hand back the same code twice in a row, in practice', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generatePasscode()))
    // Collisions are possible in principle (900,000 values), just vanishingly unlikely at 50
    // draws — this catches a generator that is accidentally constant or low-entropy, not a
    // real collision.
    expect(codes.size).toBeGreaterThan(45)
  })
})
