import { getRepository } from '@/lib/db'
import type { LimitResult } from '@/lib/db/repository'
import { ApiError } from './errors'

export type { LimitResult } from '@/lib/db/repository'

/**
 * A fixed-window limiter, durable since N-86 — `MemoryRepository` and `SupabaseRepository` each
 * implement `consumeRateLimit`/`peekRateLimit`/`resetRateLimit`, and this file is now the one
 * place every route calls, not the store itself.
 *
 * That split is deliberate, and is the point of what used to be this file's whole
 * implementation: on a single process, an in-memory map is exact; across several — which is
 * every real deploy — it was N times looser, and a lockout on one instance was unknown to the
 * others. Doc 05 §4's "5 attempts then a 15-minute lockout" is enforced by whichever driver is
 * configured; swap the driver, not the call sites, which is exactly what moving the store behind
 * `Repository` bought.
 */

export async function consume(key: string, limit: number, windowS: number): Promise<LimitResult> {
  return getRepository().consumeRateLimit(key, limit, windowS)
}

/**
 * How many times a key has been consumed in its current window, without consuming it.
 *
 * What decides whether a challenge is put in front of the next attempt (D-34): three failures
 * on an address is a person who mistyped, and a script; the widget costs the first a second and
 * the second everything.
 */
export async function peek(key: string): Promise<number> {
  return getRepository().peekRateLimit(key)
}

export async function enforce(key: string, limit: number, windowS: number): Promise<void> {
  const result = await consume(key, limit, windowS)
  if (!result.allowed) {
    throw new ApiError('RATE_LIMITED', 'Too many requests', { retryAfterS: result.retryAfterS })
  }
}

/** Reset a bucket — used after a successful passcode entry, and by tests. */
export async function reset(key: string): Promise<void> {
  return getRepository().resetRateLimit(key)
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return (forwarded?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown').trim()
}
