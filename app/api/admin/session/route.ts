import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthProvider } from '@/lib/admin/auth'
import { CHALLENGE_AFTER } from '@/lib/captcha/config'
import { captchaEnabled, verifyCaptcha } from '@/lib/captcha/verify'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { readJson, route } from '@/lib/http/handler'
import { clientIp, consume, peek, reset } from '@/lib/http/rate-limit'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  captchaToken: z.string().max(4000).optional(),
})

/**
 * Sign in (P0-04, D-33, D-34). Email and password; the door a person picked is not sent and
 * would not be trusted if it were — where they land is decided by the org their operator row
 * belongs to, never by which tab they clicked.
 *
 * Two buckets, and both have to allow the attempt: the address, so a script that rotates
 * through IPs still meets a wall on the one account it is after; and the IP, so a script that
 * rotates through addresses meets one too. After `CHALLENGE_AFTER` failures on either, the next
 * attempt has to carry a captcha token — when a driver is configured. A success clears both, so a
 * person who mistyped twice is not still being challenged next week.
 */
const PER_ADDRESS = 5
const PER_IP = 10
const WINDOW_S = 15 * 60

/** Where a signed-in person is sent — decided by the org their row belongs to, never by the door. */
function landingFor(operator: { mustChangePassword: boolean }, kind: 'partner' | 'couple'): string {
  if (operator.mustChangePassword) return '/login/change-password'
  return kind === 'couple' ? '/my' : '/admin'
}

export async function POST(request: Request) {
  return route('admin/session', async () => {
    const body = await readJson(request, bodySchema)
    const email = body.email.trim().toLowerCase()
    const ip = clientIp(request)
    const addressKey = `login:email:${email}`
    const ipKey = `login:${ip}`

    // Failures so far, before this attempt. Decides whether a challenge is owed right now.
    const failures = Math.max(peek(addressKey), peek(ipKey))
    const challenged = captchaEnabled() && failures >= CHALLENGE_AFTER
    if (challenged && !(await verifyCaptcha(body.captchaToken, ip))) {
      throw new ApiError('UNAUTHORIZED', 'Please complete the check below and try again', {
        challenge: true,
      })
    }

    const address = consume(addressKey, PER_ADDRESS, WINDOW_S)
    const perIp = consume(ipKey, PER_IP, WINDOW_S)
    if (!address.allowed || !perIp.allowed) {
      const retryAfterS = Math.max(address.retryAfterS, perIp.retryAfterS)
      throw new ApiError(
        'RATE_LIMITED',
        `Too many attempts. Try again in ${Math.ceil(retryAfterS / 60)} minutes.`,
        { retryAfterS },
      )
    }

    // A carrier, because a driver keeps its session by setting cookies on a response, and the
    // real body is not known until the operator row has been read. Supabase sets an access and
    // a refresh cookie, so every cookie is copied across rather than one `set-cookie` header.
    const carrier = new NextResponse(null)
    const user = await getAuthProvider().signIn(email, body.password, carrier)

    // Authenticating is not the same as being allowed in. Under Supabase Auth anyone can hold a
    // valid account; only an `operators` row grants access to an org, and the two failures are
    // reported identically so neither becomes an account-enumeration oracle.
    const operator = user ? await getRepository().getOperator(user.id) : null
    if (!user || !operator) {
      log.warn('admin login: rejected', { email })
      throw new ApiError('UNAUTHORIZED', 'Those details did not work', {
        // Tell the form the *next* attempt will be challenged, so it can show the widget now.
        challenge: captchaEnabled() && failures + 1 >= CHALLENGE_AFTER,
      })
    }

    reset(addressKey)
    reset(ipKey)
    log.info('admin login: ok', { operatorId: operator.id, driver: getAuthProvider().name })

    const org = await getRepository().getOrg(operator.orgId)
    const response = NextResponse.json(
      {
        operator: { id: operator.id, name: operator.name, email: operator.email },
        landing: landingFor(operator, org?.kind ?? 'partner'),
      },
      { headers: { 'cache-control': 'no-store' } },
    )
    for (const cookie of carrier.cookies.getAll()) response.cookies.set(cookie)
    return response
  })
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 })
  await getAuthProvider().signOut(response)
  return response
}
