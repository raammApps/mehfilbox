import { NextResponse } from 'next/server'
import { z } from 'zod'
import { clientIp, consume } from '@/lib/http/rate-limit'
import { reportError, requestId } from '@/lib/observability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Where a browser-side crash gets recorded.
 *
 * Without it, a client exception is visible only in a console nobody is looking at. This is not
 * a general logging drain: the payload is fixed and small, it is rate-limited hard, and it
 * never echoes anything back — an open endpoint that writes attacker-controlled text into your
 * logs is its own problem.
 */
const bodySchema = z.object({
  kind: z.literal('client_crash'),
  message: z.string().max(300),
  digest: z.string().max(64).optional(),
  path: z.string().max(200),
})

export async function POST(request: Request) {
  // Deliberately silent on every failure path: this endpoint exists to observe a broken page,
  // and it must not become a second thing that is broken.
  try {
    const limit = await consume(`client-error:${clientIp(request)}`, 10, 60)
    if (!limit.allowed) return new NextResponse(null, { status: 204 })

    const body = bodySchema.parse(await request.json())
    reportError(new Error(body.message), {
      requestId: requestId(request),
      scope: 'client',
      path: body.path,
      digest: body.digest,
    })
  } catch {
    /* nothing useful to do here */
  }

  return new NextResponse(null, { status: 204 })
}
