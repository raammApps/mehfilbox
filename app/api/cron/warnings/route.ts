import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { route } from '@/lib/http/handler'
import { runJob } from '@/lib/jobs/run'
import { queueDueWarnings } from '@/lib/notify/schedule'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Queue the day's expiry and grace warnings (N-21).
 *
 * Queues only — `/api/cron/notify` sends. Two jobs rather than one because they fail for different
 * reasons and at different rates: deciding what is due reads the database, and sending talks to a
 * third party. A mailer outage should delay delivery, not skip a milestone that then never comes
 * round again.
 *
 * Safe to call repeatedly. Every message carries a `dedupeKey` and 0014 puts a unique index on it,
 * so a replayed day queues nothing new.
 */
export async function GET(request: Request) {
  return route('cron/warnings', async () => {
    const expected = `Bearer ${env.CRON_SECRET ?? env.SESSION_SECRET}`
    if (env.NODE_ENV === 'production' && request.headers.get('authorization') !== expected) {
      return new NextResponse(null, { status: 401 })
    }

    const result = await runJob('warnings', () => queueDueWarnings())
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  })
}
