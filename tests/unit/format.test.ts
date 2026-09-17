import { describe, expect, it } from 'vitest'
import { slugSchema } from '@/lib/schema'
import {
  formatClock,
  formatDurationBadge,
  slugify,
  suggestSlug,
  disambiguate,
  titleFromFilename,
  uniqueSlug,
} from '@/lib/format'

describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [7, '0:07'],
    [428, '7:08'],
    [1284, '21:24'],
    [3661, '1:01:01'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatClock(input)).toBe(expected)
  })

  it('clamps a negative position rather than printing a minus sign', () => {
    expect(formatClock(-5)).toBe('0:00')
  })
})

describe('formatDurationBadge', () => {
  it('rounds to whole minutes and never shows 0m', () => {
    expect(formatDurationBadge(20)).toBe('1m')
    expect(formatDurationBadge(244)).toBe('4m')
    expect(formatDurationBadge(null)).toBeNull()
    expect(formatDurationBadge(0)).toBeNull()
  })
})

describe('slugify and suggestSlug', () => {
  /**
   * N-32. Addresses used to be the couple's names alone, in one global namespace, so the second
   * studio to photograph a Priya & Arjun wedding was refused an address by a catalogue they are
   * not allowed to see — an error that could only read as a fault in the product.
   *
   * The **wedding** year, not the current one: a wedding booked in December and delivered in
   * January belongs to the year the couple will always call theirs.
   */
  it('puts the wedding year in the address', () => {
    expect(suggestSlug({ en: 'Aanya & Vikram' }, '2026-12-05')).toBe('aanya-and-vikram-2026')
  })

  it('leaves the year off when the date is not known yet', () => {
    // The wizard suggests an address while the operator is still typing, and a half-entered date
    // must not produce `aanya-and-vikram-NaN`.
    expect(suggestSlug({ en: 'Aanya & Vikram' })).toBe('aanya-and-vikram')
    expect(suggestSlug({ en: 'Aanya & Vikram' }, '')).toBe('aanya-and-vikram')
    expect(suggestSlug({ en: 'Aanya & Vikram' }, 'not-a-date')).toBe('aanya-and-vikram')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugify('  The  Sangeet!! (final) ')).toBe('the-sangeet-final')
  })

  it('falls back to something usable when nothing survives', () => {
    expect(suggestSlug({ en: '???' })).toMatch(/^wedding-[a-z0-9]{4}$/)
  })
})

describe('disambiguate', () => {
  /**
   * The year makes collisions rare; it does not make them impossible. One studio can photograph
   * two different Priya & Arjun weddings in the same year, so an address scheme that merely made
   * collisions unlikely would still hand a partner a refusal it could not resolve.
   */
  it('adds a short suffix so a taken address always has a free neighbour', () => {
    const next = disambiguate('priya-and-arjun-2026')
    expect(next).toMatch(/^priya-and-arjun-2026-[a-z0-9]{3}$/)
  })

  it('does not stack suffixes when asked repeatedly', () => {
    // Otherwise a third attempt reads `…-2026-k3f-p1x`, and a fourth is worse.
    const once = disambiguate('priya-and-arjun-2026')
    const twice = disambiguate(once)
    expect(twice).toMatch(/^priya-and-arjun-2026-[a-z0-9]{3}$/)
    expect(twice).not.toBe(once)
  })

  it('stays inside the slug schema', () => {
    expect(slugSchema.safeParse(disambiguate('priya-and-arjun-2026')).success).toBe(true)
  })
})

describe('uniqueSlug', () => {
  /** Shared by upload and a title rename (N-84) — one rule for "the free neighbour", not two. */
  it('slugifies the name when nothing else claims it', () => {
    expect(uniqueSlug('Sangeet Night', [])).toBe('sangeet-night')
  })

  it('appends a numeric suffix, counting up, for a name already taken', () => {
    expect(uniqueSlug('Sangeet', ['sangeet'])).toBe('sangeet-2')
    expect(uniqueSlug('Sangeet', ['sangeet', 'sangeet-2'])).toBe('sangeet-3')
  })

  it('falls back to a stable word when nothing survives slugifying', () => {
    expect(uniqueSlug('???', [])).toBe('film')
  })
})

describe('titleFromFilename', () => {
  it('drops the extension and the delivery cruft a studio adds', () => {
    expect(titleFromFilename('sangeet_final_v3_1080p.mp4')).toBe('Sangeet')
    expect(titleFromFilename('WED-highlights-FINAL-color.mov')).toBe('Wed Highlights')
  })

  it('never returns an empty title', () => {
    expect(titleFromFilename('final_v2.mp4')).toBe('Untitled')
  })
})
