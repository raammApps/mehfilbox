import { describe, expect, it } from 'vitest'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { addTerm, termLabel } from '@/lib/plans'

/**
 * N-120, D-61 — how long a term is, and when a term that starts on a given day ends.
 *
 * The arithmetic is the whole risk: "12 months" and "365 days" are different promises in a leap
 * year, and a month is not a fixed number of days. A wedding must never be served a day longer or
 * shorter than the plan says, so the edge dates are what these tests are about.
 */

const days = (termDays: number) => ({ termMonths: null, termDays })
const months = (termMonths: number) => ({ termMonths, termDays: null })
const iso = (date: Date | null) => date?.toISOString()

describe('a term in days', () => {
  it('is that many days on, to the millisecond', () => {
    expect(iso(addTerm(new Date('2026-09-19T10:30:00.000Z'), days(90)))).toBe('2026-12-18T10:30:00.000Z')
  })

  it('does not care about month lengths', () => {
    expect(iso(addTerm(new Date('2026-01-31T00:00:00.000Z'), days(30)))).toBe('2026-03-02T00:00:00.000Z')
  })
})

describe('a term in months', () => {
  it('is the same day, that many months on', () => {
    expect(iso(addTerm(new Date('2026-09-19T10:30:00.000Z'), months(12)))).toBe('2027-09-19T10:30:00.000Z')
  })

  it('is twelve calendar months, not 365 days — a leap year is the difference', () => {
    // 1 March 2027 + 12 months is 1 March 2028; 365 days later is 29 February 2028, a day early.
    expect(iso(addTerm(new Date('2027-03-01T00:00:00.000Z'), months(12)))).toBe('2028-03-01T00:00:00.000Z')
    expect(iso(addTerm(new Date('2027-03-01T00:00:00.000Z'), days(365)))).toBe('2028-02-29T00:00:00.000Z')
  })

  it('lands on the last day of a shorter month rather than spilling into the next', () => {
    // 31 August + 6 months is not "31 February" and not 3 March.
    expect(iso(addTerm(new Date('2026-08-31T00:00:00.000Z'), months(6)))).toBe('2027-02-28T00:00:00.000Z')
    expect(iso(addTerm(new Date('2027-08-31T00:00:00.000Z'), months(6)))).toBe('2028-02-29T00:00:00.000Z')
  })

  it('takes 29 February to 28 February the next year, not 1 March', () => {
    expect(iso(addTerm(new Date('2028-02-29T09:00:00.000Z'), months(12)))).toBe('2029-02-28T09:00:00.000Z')
  })

  it('crosses a year end', () => {
    expect(iso(addTerm(new Date('2026-11-30T00:00:00.000Z'), months(3)))).toBe('2027-02-28T00:00:00.000Z')
  })
})

describe('a plan with no usable term', () => {
  it('has none when neither is set — a storage tier, a renewal', () => {
    expect(addTerm(new Date(), { termMonths: null, termDays: null })).toBeNull()
    expect(termLabel({ termMonths: null, termDays: null })).toBeNull()
  })

  it('has none when both are set, rather than a guess between them', () => {
    const both = { termMonths: 12, termDays: 90 }

    expect(addTerm(new Date(), both)).toBeNull()
    expect(termLabel(both)).toBeNull()
  })
})

describe('how a term reads in copy', () => {
  it('says days and months, and the singular', () => {
    expect(termLabel(days(90))).toBe('90 days')
    expect(termLabel(months(12))).toBe('12 months')
    expect(termLabel(days(1))).toBe('1 day')
    expect(termLabel(months(1))).toBe('1 month')
  })
})

describe('the seeded price list', () => {
  const term = (id: string) => SEED_PLANS.find((plan) => plan.id === id)

  it('gives Deliver ninety days, and Keep and Cinema twelve months (D-61)', () => {
    expect(term('deliver')).toMatchObject({ termDays: 90, termMonths: null })
    expect(term('keep')).toMatchObject({ termMonths: 12, termDays: null })
    expect(term('cinema')).toMatchObject({ termMonths: 12, termDays: null })
  })

  it('gives no term to anything a wedding is not first published on', () => {
    for (const plan of SEED_PLANS.filter((candidate) => !['deliver', 'keep', 'cinema'].includes(candidate.id))) {
      expect(termLabel(plan), plan.id).toBeNull()
    }
  })

  it('never sets both on one plan', () => {
    for (const plan of SEED_PLANS) expect(plan.termMonths !== null && plan.termDays !== null, plan.id).toBe(false)
  })
})
