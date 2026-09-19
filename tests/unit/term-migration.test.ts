import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEED_PLANS } from '@/lib/db/seed-data'

/**
 * N-120 — migration 0031 and the code must say the same thing about terms.
 *
 * The seed fixture (`SEED_PLANS`, what the memory driver and the E2E harness run on) and the SQL
 * (what production runs on) each state how long Deliver, Keep and Cinema are. If they drift, the
 * suite would pass on a term production does not have. Reading the SQL turns that into a failing
 * test at the time somebody edits one of them.
 */

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0031_term_at_publish.sql'), 'utf8')
// Comments stripped, so a sentence about `update catalogues` cannot satisfy a check for the statement.
const code = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n')

describe('the terms it seeds', () => {
  it('gives Deliver the days the fixture has, and only where none is set', () => {
    const deliver = SEED_PLANS.find((plan) => plan.id === 'deliver')

    expect(deliver?.termDays).toBe(90)
    expect(code).toMatch(
      /update plans set term_days = 90\s+where id = 'deliver' and term_days is null and term_months is null;/,
    )
  })

  it('gives Keep and Cinema the months the fixture has, and only where none is set', () => {
    const months = ['keep', 'cinema'].map((id) => SEED_PLANS.find((plan) => plan.id === id)?.termMonths)

    expect(months).toEqual([12, 12])
    expect(code).toMatch(
      /update plans set term_months = 12\s+where id in \('keep', 'cinema'\) and term_days is null and term_months is null;/,
    )
  })

  it('seeds nothing for any other plan', () => {
    const updated = [...code.matchAll(/update plans set[\s\S]*?where id (?:in \(([^)]*)\)|= '([a-z0-9-]+)')/g)].flatMap(
      (match) => (match[1] ?? match[2]!).replace(/'/g, '').split(',').map((id) => id.trim()),
    )

    expect(updated.sort()).toEqual(['cinema', 'deliver', 'keep'])
  })
})

describe('the shape it gives a plan', () => {
  it('refuses a term in both units, and one that is not positive', () => {
    expect(code).toMatch(/add constraint plans_term_check/)
    expect(code).toMatch(/term_months is null or term_months > 0/)
    expect(code).toMatch(/term_days is null or term_days > 0/)
    expect(code).toMatch(/term_months is null or term_days is null/)
  })

  it('can be run twice', () => {
    expect(code).toMatch(/add column if not exists term_months/)
    expect(code).toMatch(/add column if not exists term_days/)
    expect(code).toMatch(/drop constraint if exists plans_term_check/)
  })
})

describe('what it does to weddings', () => {
  it('lets a catalogue have no term', () => {
    expect(code).toMatch(/alter table catalogues alter column included_until drop not null;/)
  })

  it('empties the term of a draft that was never published, and of nothing else', () => {
    const [statement] = code.match(/update catalogues[\s\S]*?;/) ?? []

    expect(statement).toMatch(/set included_until = null/)
    // The whole safety of the backfill is this condition: a wedding that has ever been published keeps
    // the date it has, because `published_at` survives an unpublish.
    expect(statement).toMatch(/where published_at is null and status = 'draft'/)
  })

  it('touches only the one table it names in that statement', () => {
    expect(code.match(/update catalogues/g)).toHaveLength(1)
  })
})
