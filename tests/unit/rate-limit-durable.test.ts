import { describe, expect, it } from 'vitest'
import { SupabaseRepository } from '@/lib/db/supabase-repository'

/**
 * The durable rate-limit store (N-86), against a stubbed Supabase client — no network call
 * reaches Postgres in this suite, but the RPC shape and, more importantly, the fallback are
 * exercised for real.
 *
 * The fallback is the property that matters most here: if migration 0026 has not been applied
 * yet, or the durable table is briefly unreachable, this must degrade to exactly the old
 * per-instance behaviour — never 500 a sign-in, never silently disable the lockout.
 */

type Call = { method: string; args: unknown[] }

/** A chainable table builder — thenable itself, since `resetRateLimit` awaits `delete().eq()` directly. */
function tableBuilder(calls: Call[], result: { data?: unknown; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {}
  const chain = (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  for (const method of ['select', 'eq', 'delete']) builder[method] = chain(method)
  builder.maybeSingle = async () => result
  builder.then = (resolve: (value: unknown) => void) => resolve(result)
  return builder
}

function stubClient(opts: {
  rpc?: { data: unknown; error: { message: string } | null }
  table?: { data?: unknown; error: { message: string } | null }
}) {
  const rpcCalls: { fn: string; params: unknown }[] = []
  const tableCalls: Call[] = []
  const client = {
    rpc: (fn: string, params: unknown) => {
      rpcCalls.push({ fn, params })
      return { single: async () => opts.rpc ?? { data: null, error: { message: 'not configured' } } }
    },
    from: () => tableBuilder(tableCalls, opts.table ?? { data: null, error: null }),
  }
  return { client, rpcCalls, tableCalls }
}

describe('consumeRateLimit', () => {
  it('calls consume_rate_limit with the key, limit and window, and maps the returned row', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    const { client, rpcCalls } = stubClient({ rpc: { data: { count: 3, reset_at: resetAt }, error: null } })
    const repository = new SupabaseRepository(client as never)

    const result = await repository.consumeRateLimit('login:email:priya@test', 5, 60)

    expect(rpcCalls).toEqual([{ fn: 'consume_rate_limit', params: { p_key: 'login:email:priya@test', p_limit: 5, p_window_s: 60 } }])
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
    expect(result.retryAfterS).toBeGreaterThan(0)
  })

  it('refuses once the row\'s count exceeds the limit', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    const { client } = stubClient({ rpc: { data: { count: 6, reset_at: resetAt }, error: null } })
    const repository = new SupabaseRepository(client as never)

    const result = await repository.consumeRateLimit('login:email:priya@test', 5, 60)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('falls back to per-instance memory when the durable store errors, rather than throwing', async () => {
    const { client } = stubClient({ rpc: { data: null, error: { message: 'relation "rate_limits" does not exist' } } })
    const repository = new SupabaseRepository(client as never)

    // The exact behaviour the old module-level map had: the first call in a fresh window is
    // always allowed, and it is the fallback — not a thrown error — that answers it.
    const first = await repository.consumeRateLimit('forgot:email:x@test', 3, 60)
    expect(first).toEqual({ allowed: true, remaining: 2, retryAfterS: 60 })
  })

  it('keeps counting correctly across calls on the fallback, on the same repository instance', async () => {
    const { client } = stubClient({ rpc: { data: null, error: { message: 'unreachable' } } })
    const repository = new SupabaseRepository(client as never)

    await repository.consumeRateLimit('k', 2, 60)
    const second = await repository.consumeRateLimit('k', 2, 60)
    const third = await repository.consumeRateLimit('k', 2, 60)

    expect(second.allowed).toBe(true)
    expect(third.allowed).toBe(false)
  })
})

describe('peekRateLimit', () => {
  it('reads the count from the table without consuming it', async () => {
    const resetAt = new Date(Date.now() + 60_000).toISOString()
    const { client } = stubClient({ table: { data: { count: 4, reset_at: resetAt }, error: null } })
    const repository = new SupabaseRepository(client as never)

    expect(await repository.peekRateLimit('x')).toBe(4)
  })

  it('reads as zero once the window has expired', async () => {
    const resetAt = new Date(Date.now() - 1000).toISOString()
    const { client } = stubClient({ table: { data: { count: 4, reset_at: resetAt }, error: null } })
    const repository = new SupabaseRepository(client as never)

    expect(await repository.peekRateLimit('x')).toBe(0)
  })

  it('falls back to zero, not an error, when the table is unreachable and nothing was ever consumed', async () => {
    const { client } = stubClient({ table: { data: null, error: { message: 'unreachable' } } })
    const repository = new SupabaseRepository(client as never)

    expect(await repository.peekRateLimit('never-consumed')).toBe(0)
  })
})

describe('resetRateLimit', () => {
  it('deletes the row by key', async () => {
    const { client, tableCalls } = stubClient({ table: { error: null } })
    const repository = new SupabaseRepository(client as never)

    await repository.resetRateLimit('login:email:priya@test')
    expect(tableCalls).toContainEqual({ method: 'delete', args: [] })
    expect(tableCalls).toContainEqual({ method: 'eq', args: ['key', 'login:email:priya@test'] })
  })

  it('also clears the fallback, so a bucket served from it while the table was down is not stuck locked', async () => {
    const { client } = stubClient({
      rpc: { data: null, error: { message: 'unreachable' } },
      table: { error: null },
    })
    const repository = new SupabaseRepository(client as never)

    await repository.consumeRateLimit('k', 1, 60)
    const blocked = await repository.consumeRateLimit('k', 1, 60)
    expect(blocked.allowed).toBe(false)

    await repository.resetRateLimit('k')

    const afterReset = await repository.consumeRateLimit('k', 1, 60)
    expect(afterReset.allowed).toBe(true)
  })
})
