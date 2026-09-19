import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { CREDIT_PLAN_IDS } from '@/lib/plans'
import { planSchema, type Plan } from '@/lib/schema'

/**
 * N-118 — the price list exists twice, and only one copy is production's.
 *
 * `supabase/migrations/0029_price_list.sql` seeds the `plans` table a deploy runs on;
 * `SEED_PLANS` seeds the in-memory and file drivers that local development, the suite and the E2E
 * server run on. Two copies of a number drift, and the failure is a marketing page that quotes one
 * figure in development and another in production. This reads the migration and holds them equal.
 */

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0029_price_list.sql'), 'utf8')

const sqlNumber = (value: number | null) => (value === null ? 'null' : String(value))

/** The exact line the migration must contain for a plan — column order documented in the SQL. */
function seedLine(plan: Plan): string {
  return (
    `('${plan.id}', '${plan.kind}', '${plan.name}', '${plan.unit}', ${sqlNumber(plan.pricePaise)}, ` +
    `${sqlNumber(plan.storageGb)}, '${JSON.stringify(plan.grants)}', ${plan.position}, ` +
    `${sqlNumber(plan.retailMinPaise)}, ${sqlNumber(plan.retailMaxPaise)})`
  )
}

describe('the seed fixture and the migration agree', () => {
  it.each(SEED_PLANS.map((plan) => [plan.id, plan] as const))('%s is seeded identically', (_id, plan) => {
    expect(sql).toContain(seedLine(plan))
  })

  it('has no row the fixture lacks', () => {
    const seededRows = sql.split('\n').filter((line) => /^\s+\('[a-z0-9-]+', '/.test(line))

    expect(seededRows).toHaveLength(SEED_PLANS.length)
  })
})

describe('re-applying the migration never undoes an admin’s edit', () => {
  const conflict = /on conflict \(id\) do update set([\s\S]*?);/.exec(sql)?.[1] ?? ''

  it('updates on conflict, so a re-run is safe', () => {
    expect(conflict).not.toBe('')
  })

  it('touches structure only — never a price, a credit bundle or a retail range', () => {
    // The whole promise: an admin who has repriced Keep must not find it reset by a re-applied
    // migration, and `on conflict do update` is where that would happen if a column slipped in.
    for (const editable of ['price_paise', 'grants', 'retail_min_paise', 'retail_max_paise']) {
      expect(conflict, editable).not.toContain(editable)
    }
  })
})

describe('the fixture is a well-formed list', () => {
  it('parses against the schema, row by row', () => {
    for (const plan of SEED_PLANS) expect(() => planSchema.parse(plan), plan.id).not.toThrow()
  })

  it('has unique ids and unique reading positions', () => {
    expect(new Set(SEED_PLANS.map((plan) => plan.id)).size).toBe(SEED_PLANS.length)
    expect(new Set(SEED_PLANS.map((plan) => plan.position)).size).toBe(SEED_PLANS.length)
  })

  it('has a row for every plan a credit can be for, which is what a typed basket keys on', () => {
    for (const id of CREDIT_PLAN_IDS) expect(SEED_PLANS.some((plan) => plan.id === id), id).toBe(true)
  })

  it('gives the Studio plan a bundle made only of credits that exist, and nothing else a bundle', () => {
    const studio = SEED_PLANS.find((plan) => plan.kind === 'partner')

    expect(studio?.grants).toEqual({ deliver: 2, cinema: 1 })
    for (const plan of SEED_PLANS.filter((candidate) => candidate.kind !== 'partner')) {
      expect(plan.grants, plan.id).toEqual({})
    }
  })

  it('leaves the storage tiers off sale, as D-60 left them', () => {
    for (const id of ['light', 'medium', 'heavy']) {
      expect(SEED_PLANS.find((plan) => plan.id === id)?.pricePaise, id).toBeNull()
    }
  })
})
