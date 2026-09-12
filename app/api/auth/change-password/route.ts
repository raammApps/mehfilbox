import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthProvider } from '@/lib/admin/auth'
import { getOperatorSession } from '@/lib/admin/session'
import { ApiError } from '@/lib/http/errors'
import { readJson, route } from '@/lib/http/handler'
import { clientIp, consume } from '@/lib/http/rate-limit'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  current: z.string().max(200).optional(),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
})

/**
 * `POST /api/auth/change-password` — a signed-in person replacing their own password (D-33).
 *
 * The old one is required unless the account is flagged `mustChangePassword`: that flag means a
 * studio handed over a temporary password in the room, and the whole point of the screen this
 * serves is to get rid of it. Everyone else proves they hold the current password first, so a
 * session left open on a shared laptop cannot be turned into a permanent one.
 *
 * `getOperatorSession` rather than `requireOperator`, deliberately: a suspended studio may still
 * change its password — it is theirs — and this route writes nothing a suspension protects.
 */
export async function POST(request: Request) {
  return route('auth/change-password', async () => {
    const session = await getOperatorSession()
    if (!session) throw new ApiError('UNAUTHORIZED', 'Sign in to continue')

    const limit = consume(`change-password:${clientIp(request)}`, 10, 15 * 60)
    if (!limit.allowed) {
      throw new ApiError('RATE_LIMITED', 'Too many attempts', { retryAfterS: limit.retryAfterS })
    }

    const body = await readJson(request, bodySchema)
    const auth = getAuthProvider()
    const { operator } = session

    if (!operator.mustChangePassword) {
      // Verified against a throwaway response, so a wrong guess sets no cookie anywhere.
      const holder = body.current
        ? await auth.signIn(operator.email, body.current, new NextResponse(null))
        : null
      if (!holder) {
        throw new ApiError('VALIDATION_FAILED', 'That is not your current password', {
          fields: { current: 'That is not your current password' },
        })
      }
    }

    await auth.setPassword(operator.id, body.password)
    log.info('password changed', { operatorId: operator.id, forced: operator.mustChangePassword })

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
  })
}
