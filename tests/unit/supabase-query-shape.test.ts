import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseRepository } from '@/lib/db/supabase-repository'

/**
 * The Supabase driver is the one driver no behavioural test executes: every unit, component and
 * E2E test runs against `MemoryRepository`. So when the two drivers disagree, only production
 * notices — and on 15–16 September 2026 production was noticed, twice, for the same class of bug.
 * `listPhotosForCatalogue` accepted `{ liveOnly: true }` from the guest path and ignored it,
 * serving photographs a Publish had never carried live (N-83's twin). `listTitles`'s
 * `publishedOnly` gated on `published` — the operator's intent — instead of `live_at` — whether a
 * Publish actually carried the film out — so a ticked-but-unpublished film was already on the
 * guest list read (N-89a). The memory driver has honoured `live_at` alone for both since N-57.
 *
 * This file pins the *shape* of the query the driver builds, through a recording stand-in for
 * the Supabase client, in the same spirit as `supabase-mapping.test.ts` pins the column maps:
 * it cannot prove the query is right against Postgres, but it can prove the filter is there.
 */

type Call = { method: string; args: unknown[] }

/** A chainable stand-in that records every call and resolves to an empty result set. */
function recordingClient(calls: Call[]): SupabaseClient {
  const builder: Record<string, unknown> = {}
  const chain = (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  for (const method of ['from', 'select', 'eq', 'not', 'is', 'order', 'in', 'limit', 'maybeSingle', 'single']) {
    builder[method] = chain(method)
  }
  // Awaiting the builder ends the chain, as it does on the real client.
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data: [], error: null })
  return builder as unknown as SupabaseClient
}

describe('listPhotosForCatalogue on the Supabase driver', () => {
  it('filters to live photographs when the guest path asks for them', async () => {
    const calls: Call[] = []
    const repository = new SupabaseRepository(recordingClient(calls))
    await repository.listPhotosForCatalogue('catalogue-1', { liveOnly: true })

    expect(calls).toContainEqual({ method: 'eq', args: ['albums.catalogue_id', 'catalogue-1'] })
    expect(calls).toContainEqual({ method: 'not', args: ['live_at', 'is', null] })
  })

  it('returns every photograph, live or not, for the console', async () => {
    const calls: Call[] = []
    const repository = new SupabaseRepository(recordingClient(calls))
    await repository.listPhotosForCatalogue('catalogue-1')

    expect(calls.some((call) => call.method === 'not')).toBe(false)
  })
})

describe('listTitles on the Supabase driver', () => {
  it('gates the guest read on live_at, not on the operator-facing published flag', async () => {
    const calls: Call[] = []
    const repository = new SupabaseRepository(recordingClient(calls))
    await repository.listTitles('catalogue-1', { publishedOnly: true })

    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'ready'] })
    expect(calls).toContainEqual({ method: 'not', args: ['live_at', 'is', null] })
    // The bug this pins: `published` alone let a ticked-but-unpublished film onto the guest read.
    expect(calls.some((call) => call.method === 'eq' && call.args[0] === 'published')).toBe(false)
  })

  it('returns every title, live or not, for the console', async () => {
    const calls: Call[] = []
    const repository = new SupabaseRepository(recordingClient(calls))
    await repository.listTitles('catalogue-1')

    expect(calls.some((call) => call.method === 'not')).toBe(false)
  })
})
