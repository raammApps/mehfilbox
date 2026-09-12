import { NextResponse } from 'next/server'
import { z } from 'zod'
import { sendCredentialLink } from '@/lib/auth/credential-links'
import { getRepository } from '@/lib/db'
import { readJson, route } from '@/lib/http/handler'
import { clientIp, consume } from '@/lib/http/rate-limit'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({ email: z.string().email() })

/**
 * `POST /api/auth/forgot` — email a set-password link (D-33).
 *
 * **One answer, whatever was typed.** Known address, unknown address, an address that has been
 * asked about forty times this hour: the response is the same sentence with the same status, and
 * it arrives in about the same time. Anything else is a list of every account on the platform,
 * one request at a time.
 *
 * The limits therefore do not refuse — they silently stop sending. A person who genuinely asked
 * three times in an hour has three links in their inbox already; a script learns nothing.
 */
const PER_IP = 5
const PER_ADDRESS = 3
const WINDOW_S = 60 * 60

export async function POST(request: Request) {
  return route('auth/forgot', async () => {
    const body = await readJson(request, bodySchema)
    const email = body.email.trim().toLowerCase()

    const ip = consume(`forgot:${clientIp(request)}`, PER_IP, WINDOW_S)
    const address = consume(`forgot:email:${email}`, PER_ADDRESS, WINDOW_S)

    if (ip.allowed && address.allowed) {
      const operator = await getRepository().getOperatorByEmail(email)
      if (operator) {
        await sendCredentialLink(operator, 'reset').catch((error: unknown) => {
          // A mailer being down must not become a different answer for a real address.
          log.error('forgot: could not queue the link', { reason: String(error) })
        })
      } else {
        log.info('forgot: unknown address', {})
      }
    } else {
      log.warn('forgot: over the limit, not sending', { byIp: !ip.allowed, byAddress: !address.allowed })
    }

    return NextResponse.json(
      { ok: true, message: 'If that address has an account, a link to set a new password is on its way.' },
      { headers: { 'cache-control': 'no-store' } },
    )
  })
}
