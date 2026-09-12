import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * The challenge seam's real driver (D-34), against a stubbed Cloudflare. The property that
 * matters: an outage is a refusal, not a pass — passing everyone while the verifier is down is
 * exactly the window a script would use.
 */
vi.hoisted(() => {
  process.env.CAPTCHA_DRIVER = 'turnstile'
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key'
  process.env.TURNSTILE_SECRET_KEY = 'secret-key'
})

import { captchaEnabled, challengeConfig, verifyCaptcha } from '@/lib/captcha/verify'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('turnstile', () => {
  it('is enabled, and hands the site key to the form but never the secret', () => {
    expect(captchaEnabled()).toBe(true)
    expect(challengeConfig()).toEqual({ driver: 'turnstile', siteKey: 'site-key' })
    expect(JSON.stringify(challengeConfig())).not.toContain('secret-key')
  })

  it('accepts what Cloudflare accepts, sending the secret and the caller IP', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, string>
      expect(body.secret).toBe('secret-key')
      expect(body.response).toBe('the-token')
      expect(body.remoteip).toBe('203.0.113.9')
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    expect(await verifyCaptcha('the-token', '203.0.113.9')).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('refuses what Cloudflare refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] }))),
    )
    expect(await verifyCaptcha('a-replayed-token', '203.0.113.9')).toBe(false)
  })

  it('refuses an empty token without a round trip', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await verifyCaptcha(undefined, '203.0.113.9')).toBe(false)
    expect(await verifyCaptcha('', '203.0.113.9')).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an outage as a refusal', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNRESET')
      }),
    )
    expect(await verifyCaptcha('the-token', '203.0.113.9')).toBe(false)
  })
})
