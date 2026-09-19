import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREDIT_PLAN_IDS, MAX_REWARD_CREDITS } from '@/lib/plans'
import { COUPON_CODE_PATTERN, COUPON_DOORS, COUPON_KINDS } from '@/lib/schema'

/**
 * N-121 — migration 0032 and the code must agree about what a coupon is, and the database must be the
 * backstop it claims to be.
 *
 * The routes validate with `couponSchema`; Postgres validates with check constraints. If a fourth kind,
 * a fourth door or a bigger reward ceiling were added to one and not the other, the failure would be a
 * 500 from a constraint at the moment somebody is creating a campaign. Reading the SQL turns that into
 * a failing test when the constant is edited.
 */

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/0032_coupons.sql'), 'utf8')
// Comments stripped, so a sentence about `delete` cannot satisfy or fail a check on the statement.
const code = sql
  .split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

/** Every `in ('a', 'b', …)` list in the SQL that follows `column`, as ids. */
function listAfter(column: string): string[] {
  const match = new RegExp(`${column}\\s+in\\s*\\(([^)]*)\\)`).exec(code)
  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((id) => id[1]!)
}

describe('the shape the database enforces', () => {
  it('has the same kinds as the code', () => {
    expect(listAfter('kind').sort()).toEqual([...COUPON_KINDS].sort())
  })

  it('has the same reward baskets as the code', () => {
    expect(listAfter('reward_plan_id').sort()).toEqual([...CREDIT_PLAN_IDS].sort())
  })

  it('has the same doors as the code', () => {
    const doors = /doors <@ array\[([^\]]*)\]/.exec(code)?.[1] ?? ''

    expect([...doors.matchAll(/'([^']+)'/g)].map((door) => door[1]).sort()).toEqual([...COUPON_DOORS].sort())
  })

  it('has the same code shape as the code', () => {
    const pattern = /code ~ '([^']+)'/.exec(code)?.[1]

    expect(pattern).toBe(COUPON_CODE_PATTERN.source)
  })

  it('has the same reward ceiling as the code', () => {
    expect(code).toMatch(new RegExp(`kind <> 'reward' or value <= ${MAX_REWARD_CREDITS}\\b`))
  })

  it('makes a reward studio-only and a discount basket-free', () => {
    expect(code).toMatch(/kind = 'reward' and reward_plan_id is not null and doors = array\['studio'\]/)
    expect(code).toMatch(/kind <> 'reward' and reward_plan_id is null/)
  })

  it('bounds a percentage, requires a positive value, and orders the window', () => {
    expect(code).toMatch(/kind <> 'percent' or value <= 100/)
    expect(code).toMatch(/value > 0/)
    expect(code).toMatch(/valid_from <= valid_until/)
  })

  it('makes a code unique, so two admins cannot both have it', () => {
    expect(code).toMatch(/create unique index if not exists coupons_code_key on coupons \(code\)/)
  })
})

describe('a coupon is never deleted', () => {
  it('lets no redemption cascade away with its coupon, and no statement delete either', () => {
    // `coupon_id uuid not null references coupons (id)` and nothing after it: no `on delete`.
    const line = /coupon_id\s+uuid not null references coupons \(id\)([^,\n]*)/.exec(code)?.[1] ?? 'missing'

    expect(line.trim()).toBe('')
    expect(code).not.toMatch(/\bdelete\s+from\b/i)
    expect(code).not.toMatch(/\btruncate\b/i)
    expect(code).not.toMatch(/\bdrop\s+table\b/i)
  })
})

describe('the door is shut to the public key', () => {
  it('enables row level security on both tables and revokes them from anon', () => {
    for (const table of ['coupons', 'coupon_redemptions']) {
      expect(code, table).toContain(`alter table ${table} enable row level security;`)
      expect(code, table).toContain(`revoke all on ${table} from anon;`)
    }
  })

  it('lets only the service role run the redeem function, which moves credits', () => {
    const signature = 'redeem_coupon\\(uuid, uuid, uuid, uuid, integer, jsonb, timestamptz\\)'

    expect(code).toMatch(new RegExp(`revoke execute on function ${signature}\\s+from public, anon, authenticated;`))
    expect(code).toMatch(new RegExp(`grant execute on function ${signature} to service_role;`))
  })
})

describe('the redeem function is the decision', () => {
  const body = /create or replace function redeem_coupon[\s\S]*?\$\$;/.exec(code)?.[0] ?? ''

  it('locks the coupon row before it counts, so the last redemption cannot be taken twice', () => {
    expect(body).toMatch(/from coupons where id = p_coupon for update/)
    expect(body.indexOf('for update')).toBeLessThan(body.indexOf('count(*)'))
  })

  it('refuses a disabled coupon, one outside its window, and both limits, in the database and not only the app', () => {
    for (const rule of [/not c\.active/, /p_now < c\.valid_from/, /p_now > c\.valid_until/, /total >= c\.max_redemptions/, /mine >= c\.max_per_payer/]) {
      expect(body).toMatch(rule)
    }
  })

  it('records the redemption and the credits in the one function — one transaction', () => {
    expect(body).toMatch(/insert into coupon_redemptions/)
    expect(body).toMatch(/insert into credits/)
  })

  it('runs as the caller, not as its owner', () => {
    expect(body).toMatch(/security invoker/)
    expect(body).not.toMatch(/security definer/)
  })
})

describe('re-running it', () => {
  it('is safe to run twice', () => {
    expect(code).toMatch(/create table if not exists coupons/)
    expect(code).toMatch(/create table if not exists coupon_redemptions/)
    expect(code).toMatch(/create or replace function redeem_coupon/)
    expect(code).toMatch(/create index if not exists/)
  })
})
