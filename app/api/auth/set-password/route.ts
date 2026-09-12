import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthProvider } from '@/lib/admin/auth'
import { redeemableLink } from '@/lib/auth/credential-links'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { readJson, route } from '@/lib/http/handler'
import { clientIp, consume } from '@/lib/http/rate-limit'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
})

/**
 * `POST /api/auth/set-password` — redeem a credential link (D-33).
 *
 * The token is the whole authorisation: whoever holds a live link may set the password on the
 * account it was issued for. It is spent the moment it is used, so a forwarded email cannot be
 * used twice, and a missing, expired and spent token are refused with one message.
 */
const PER_IP = 10
const WINDOW_S = 60 * 60

export async function POST(request: Request) {
  return route('auth/set-password', async () => {
    const limit = consume(`set-password:${clientIp(request)}`, PER_IP, WINDOW_S)
    if (!limit.allowed) {
      throw new ApiError('RATE_LIMITED', 'Too many attempts', { retryAfterS: limit.retryAfterS })
    }

    const body = await readJson(request, bodySchema)
    const link = await redeemableLink(body.token)
    if (!link) {
      throw new ApiError('NOT_FOUND', 'This link is no longer valid. Ask for a new one.')
    }

    const repository = getRepository()
    const operator = await repository.getOperator(link.operatorId)
    if (!operator) throw new ApiError('NOT_FOUND', 'This link is no longer valid. Ask for a new one.')

    // Spend the link before touching the credential: a crash between the two leaves a person who
    // has to ask again, not a link that can be used twice.
    await repository.markCredentialLinkUsed(link.id)
    await getAuthProvider().setPassword(operator.id, body.password)

    log.info('credential link redeemed', { operatorId: operator.id, purpose: link.purpose })

    // No session: signing in is the person's own deliberate step, on the door that is theirs.
    const org = await repository.getOrg(operator.orgId)
    return NextResponse.json(
      { email: operator.email, door: org?.kind === 'couple' ? 'couple' : 'studio' },
      { headers: { 'cache-control': 'no-store' } },
    )
  })
}
