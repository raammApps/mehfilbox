import { NextResponse } from 'next/server'
import { z } from 'zod'
import {
  cookieOptions,
  createPasscodeGrant,
  passcodeCookieName,
  PASSCODE_TTL_S,
  verifySecret,
} from '@/lib/auth'
import { CHALLENGE_AFTER } from '@/lib/captcha/config'
import { captchaEnabled, verifyCaptcha } from '@/lib/captcha/verify'
import { getRepository } from '@/lib/db'
import { ApiError } from '@/lib/http/errors'
import { readJson, route } from '@/lib/http/handler'
import { clientIp, consume, peek, reset } from '@/lib/http/rate-limit'
import { log } from '@/lib/log'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Five attempts per device, then a 15-minute lockout (doc 05 §4) — and, since D-34, thirty per
 * catalogue across every device in the same window, so a script spreading a four-digit guess over
 * a hundred addresses meets a wall the per-device bucket alone would never show it. After three
 * failures from one device the next attempt needs a captcha token, when a driver is configured.
 */
const MAX_ATTEMPTS = 5
const MAX_PER_CATALOGUE = 30
const LOCKOUT_S = 15 * 60

const bodySchema = z.object({
  catalogue: z.string().min(1),
  passcode: z.string().min(1).max(64),
  captchaToken: z.string().max(4000).optional(),
})

export async function POST(request: Request) {
  return route('passcode', async () => {
    const body = await readJson(request, bodySchema)
    const ip = clientIp(request)
    const deviceKey = `passcode:${ip}:${body.catalogue}`
    const catalogueKey = `passcode:catalogue:${body.catalogue}`

    const failures = peek(deviceKey)
    const challenged = captchaEnabled() && failures >= CHALLENGE_AFTER
    if (challenged && !(await verifyCaptcha(body.captchaToken, ip))) {
      throw new ApiError('PASSCODE_REQUIRED', 'Please complete the check and try again', {
        challenge: true,
      })
    }

    const device = consume(deviceKey, MAX_ATTEMPTS, LOCKOUT_S)
    const whole = consume(catalogueKey, MAX_PER_CATALOGUE, LOCKOUT_S)
    if (!device.allowed || !whole.allowed) {
      throw new ApiError('RATE_LIMITED', 'Too many attempts', {
        retryAfterS: Math.max(device.retryAfterS, whole.retryAfterS),
      })
    }

    const catalogue = await getRepository().getCatalogueBySlug(body.catalogue)
    // A generic failure either way: whether a catalogue exists is not something an attacker
    // gets to learn from this endpoint.
    if (!catalogue || !verifySecret(body.passcode, catalogue.passcodeHash)) {
      log.warn('passcode: rejected', { catalogue: body.catalogue, remaining: device.remaining })
      throw new ApiError('PASSCODE_REQUIRED', 'That passcode did not work', {
        challenge: captchaEnabled() && failures + 1 >= CHALLENGE_AFTER,
      })
    }

    reset(deviceKey)

    const response = NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } })
    response.cookies.set(
      passcodeCookieName(catalogue.slug),
      createPasscodeGrant(catalogue.id),
      cookieOptions(PASSCODE_TTL_S),
    )
    return response
  })
}
