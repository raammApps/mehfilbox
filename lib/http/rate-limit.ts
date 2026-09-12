import { ApiError } from './errors'

/**
 * A fixed-window limiter held in process memory.
 *
 * Honest about what this is: on a single Vercel instance it is exact, across several it is
 * per-instance and therefore approximate. That is the right trade for Phase 0 — the thing it
 * protects (a passcode gate on one wedding's catalogue) sees single-digit requests per second,
 * and adding Redis for it would be infrastructure with no user visible. Doc 05 §4's "5
 * attempts then a 15-minute lockout" is enforced here; swap the store, not the call sites,
 * when there is a reason to.
 */

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

/** Evict expired buckets opportunistically so the map cannot grow without bound. */
function sweep(now: number): void {
  if (buckets.size < 5000) return
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key)
  }
}

export type LimitResult = { allowed: boolean; remaining: number; retryAfterS: number }

export function consume(key: string, limit: number, windowS: number): LimitResult {
  const now = Date.now()
  sweep(now)

  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowS * 1000 })
    return { allowed: true, remaining: limit - 1, retryAfterS: windowS }
  }

  bucket.count += 1
  const retryAfterS = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000))
  return { allowed: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), retryAfterS }
}

/**
 * How many times a key has been consumed in its current window, without consuming it.
 *
 * What decides whether a challenge is put in front of the next attempt (D-34): three failures
 * on an address is a person who mistyped, and a script; the widget costs the first a second and
 * the second everything.
 */
export function peek(key: string): number {
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= Date.now()) return 0
  return bucket.count
}

export function enforce(key: string, limit: number, windowS: number): void {
  const result = consume(key, limit, windowS)
  if (!result.allowed) {
    throw new ApiError('RATE_LIMITED', 'Too many requests', { retryAfterS: result.retryAfterS })
  }
}

/** Reset a bucket — used after a successful passcode entry, and by tests. */
export function reset(key: string): void {
  buckets.delete(key)
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  return (forwarded?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown').trim()
}
