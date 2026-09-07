import { NextResponse } from 'next/server'
import { env } from '@/lib/env'
import { route } from '@/lib/http/handler'
import { log } from '@/lib/log'
import { drain } from '@/lib/notify/send'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Drain the notification queue (N-50).
 *
 * Sending never happens in a request a person is waiting on — an expiry warning must not make a
 * guest's page slower, and a provider outage must not turn into a 500 on a wedding page. The
 * queue is the boundary between "we decided to tell them" and "we told them".
 *
 * **This route is deliberately absent from `vercel.json`.** Vercel's Hobby plan allows two cron
 * jobs, each running at most once a day, and `reconcile` and `usage` hold both slots. Adding a
 * third fails the deploy outright — the plan limit is checked at deploy time, not at run time.
 * Daily was not an acceptable compromise: a delivery message that arrives up to 24 hours after
 * the studio publishes is not a delivery message.
 *
 * So the schedule lives outside Vercel until the account is on Pro. Any caller with the bearer
 * token can drive it, at whatever cadence:
 *
 *     curl -H "Authorization: Bearer $CRON_SECRET" https://mehfilbox.com/api/cron/notify
 *
 * Calling it more often than needed is cheap and safe *sequentially*: a second call after the
 * first has returned finds nothing `queued` and sends nothing. It is **not** safe under overlap —
 * `drain` reads, sends, then marks, so two calls running at once would both see the same rows and
 * send twice. At 50 emails a drain that finishes in seconds, an overlap needs a fifteen-minute
 * run; the exposure is a duplicate message rather than a lost one. Claiming a row before sending
 * needs a `sending` status, which the 0009 CHECK constraint does not allow — see NEXT.
 */
export async function GET(request: Request) {
  return route('cron/notify', async () => {
    // Vercel signs cron invocations, and sends *no header at all* when CRON_SECRET is unset —
    // which is why a forgotten variable shows up as jobs that never run rather than as an error.
    const expected = `Bearer ${env.CRON_SECRET ?? env.SESSION_SECRET}`
    if (env.NODE_ENV === 'production' && request.headers.get('authorization') !== expected) {
      return new NextResponse(null, { status: 401 })
    }

    const result = await drain()
    if (result.attempted > 0 || result.skipped > 0) log.info('notify: drained', result)
    return NextResponse.json(result)
  })
}
