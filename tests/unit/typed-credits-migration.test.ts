import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREDIT_PLAN_IDS } from '@/lib/plans'

/**
 * N-119 — the database's list of credit plans and the code's must be the same list.
 *
 * `CREDIT_PLAN_IDS` is what the routes validate against; migration 0030 is what Postgres will
 * accept. If a fourth plan were added to one and not the other, the failure would arrive as a 500
 * from a check constraint in production, at Publish — the worst possible moment. Reading the SQL
 * here turns that into a failing test at the time the list is edited.
 */

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0030_catalogue_plan.sql'), 'utf8')

/** Every `plan_id in ('a','b',…)` list in the file, as arrays of ids. */
function checkLists(source: string): string[][] {
  return [...source.matchAll(/plan_id\s+in\s*\(([^)]*)\)/gi)].map((match) =>
    [...match[1]!.matchAll(/'([^']+)'/g)].map((id) => id[1]!),
  )
}

describe('migration 0030', () => {
  it('has a check for the catalogue and one for the credit, and both list exactly the plans in code', () => {
    const lists = checkLists(sql)

    expect(lists).toHaveLength(2)
    for (const list of lists) expect([...list].sort()).toEqual([...CREDIT_PLAN_IDS].sort())
  })

  it('defaults a catalogue to Deliver, so a row that existed before it reads as it always did', () => {
    expect(sql).toMatch(/add column if not exists plan_id text not null default 'deliver'/i)
  })

  it('can be run twice', () => {
    expect(sql).toMatch(/drop constraint if exists catalogues_plan_id_check/i)
    expect(sql).toMatch(/drop constraint if exists credits_plan_id_check/i)
    expect(sql).toMatch(/create index if not exists/i)
  })
})
