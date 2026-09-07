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
