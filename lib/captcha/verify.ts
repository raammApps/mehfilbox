import 'server-only'
import { env } from '@/lib/env'
import { log } from '@/lib/log'
import { FAKE_CAPTCHA_TOKEN, type ChallengeConfig } from './config'

/**
 * The challenge seam (D-34) — the same shape as every other external service here: a fake for
 * the suite, a real driver in production, and one file that knows which.
 *
 * It is a **second** layer. The per-address and per-IP limits and the lockouts apply whether or
 * not a driver is configured; the widget is what stops a script that has learned to spread its
 * guesses across addresses and windows. With `none`, the forms never show a widget and the
 * routes never ask for a token.
 */

export function captchaEnabled(): boolean {
  return env.CAPTCHA_DRIVER !== 'none'
}

/** What a page passes to its form. Read here, on the server, and handed over as a prop. */
export function challengeConfig(): ChallengeConfig {
  return {
    driver: env.CAPTCHA_DRIVER,
    siteKey: env.CAPTCHA_DRIVER === 'turnstile' ? (env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null) : null,
  }
}

/**
 * Is this token good for one attempt?
 *
 * Turnstile tokens are single-use on Cloudflare's side, so a replay fails there without any
 * bookkeeping here. A network failure counts as a refusal: the honest error for the person is
 * "try again", and the alternative — passing everyone while Cloudflare is unreachable — is the
 * exact moment a script would choose.
 */
export async function verifyCaptcha(token: string | null | undefined, ip: string): Promise<boolean> {
  switch (env.CAPTCHA_DRIVER) {
    case 'none':
      return true
    case 'fake':
      return token === FAKE_CAPTCHA_TOKEN
    case 'turnstile': {
      if (!token) return false
      try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
        })
        const body = (await response.json()) as { success?: boolean; 'error-codes'?: string[] }
        if (!body.success) {
          log.warn('captcha: turnstile refused', { codes: body['error-codes'] ?? [] })
        }
        return body.success === true
      } catch (error) {
        log.error('captcha: turnstile unreachable', { reason: (error as Error).message })
        return false
      }
    }
  }
}
