import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { route } from '@/lib/http/handler'
import { runJob } from '@/lib/jobs/run'
import { runLifecycle } from '@/lib/lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Move catalogues down the lapse ladder (N-24).
 *
 * The state machine has existed since Phase 0 and `resolveAccess` has always honoured it —
 * **nothing wrote it.** So a wedding whose term ended a year ago is still streaming, and one
 * nobody renewed is still costing Stream storage. This is the job that moves them.
 *
 * Safe to replay: the ladder is derived from two dates, so a day run twice finds nothing left to
 * do, and the messages it queues carry dedupe keys (N-21).
 */
export async function GET(request: Request) {
  return route('cron/lifecycle', async () => {
    const expected = `Bearer ${env.CRON_SECRET ?? env.SESSION_SECRET}`
    if (env.NODE_ENV === 'production' && request.headers.get('authorization') !== expected) {
      return new NextResponse(null, { status: 401 })
    }

    const result = await runJob('lifecycle', () => runLifecycle())
    return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } })
  })
}
