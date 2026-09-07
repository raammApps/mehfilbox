import { describe, expect, it } from 'vitest'
import { envSchema } from '@/lib/env'

/**
 * The production guards in `lib/env.ts`, asserted at the schema rather than through a module
 * re-import. Each of these exists because the corresponding mistake was actually made.
 */

/** A deployment that is otherwise valid, so each test isolates the one guard it is about. */
const production = {
  NODE_ENV: 'production',
  DATA_DRIVER: 'supabase',
  VIDEO_DRIVER: 'fake',
  PHOTO_DRIVER: 'fake',
  AUTH_DRIVER: 'local',
  ROOT_DOMAIN: 'mehfilbox.com',
  SESSION_SECRET: 'e2b1c4a6f80d3e5b7a9c1d2f4e6b8a0c2d4f6e8b0a1c3d5e7f9b1d3f5a7c9e1b',
  DEV_OPERATOR_PASSWORD: 'not-the-committed-one',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x',
  SUPABASE_SECRET_KEY: 'sb_secret_x',
  NOTIFY_DRIVER: 'resend',
  RESEND_API_KEY: 're_x',
}

/** Which guards fired, by the field they name — unrelated missing values cannot mask the result. */
function issuesFor(env: Record<string, string>, field: string): string[] {
  const parsed = envSchema.safeParse(env)
  if (parsed.success) return []
  return parsed.error.issues.filter((i) => i.path[0] === field).map((i) => i.message)
}

describe('the production environment guards', () => {
  it('refuses the fake notification driver against the real database', () => {
    // The fake provider returns success without sending, so `notifications` would fill with rows
    // marked `sent` that nobody received. N-50 shipped without NOTIFY_DRIVER set and production
    // took the default for a day; this is that day, encoded.
    expect(issuesFor({ ...production, NOTIFY_DRIVER: 'fake' }, 'NOTIFY_DRIVER')).toHaveLength(1)
  })

  it('accepts resend, which is what production actually runs', () => {
    expect(issuesFor(production, 'NOTIFY_DRIVER')).toHaveLength(0)
  })

  /**
   * The first version of this guard keyed on NODE_ENV and broke CI: `next start` is production
   * too, and the vitals gate and Playwright both build and boot the app on the memory driver,
   * where `fake` is the correct notifier. The built app could not start at all.
   */
  it('lets a production build boot on the memory driver, which is what CI does', () => {
    const ci = {
      NODE_ENV: 'production',
      DATA_DRIVER: 'memory',
      VIDEO_DRIVER: 'fake',
      PHOTO_DRIVER: 'fake',
      AUTH_DRIVER: 'local',
      ROOT_DOMAIN: 'mehfilbox.localhost:3000',
      SESSION_SECRET: 'ci-session-secret-0123456789abcdefghijklmnopqrst',
      DEV_OPERATOR_PASSWORD: 'not-the-committed-one',
      ALLOW_EPHEMERAL_DATA: '1',
      NOTIFY_DRIVER: 'fake',
    }
    expect(issuesFor(ci, 'NOTIFY_DRIVER')).toHaveLength(0)
    // And the whole environment parses, or the built app does not come up — which is the actual
    // failure this test stands in for.
    expect(envSchema.safeParse(ci).success).toBe(true)
  })

  it('catches a local session pointed at the real database with a fake notifier', () => {
    // NODE_ENV would have missed this one entirely, and it writes to the same durable table.
    const local = { ...production, NODE_ENV: 'development', NOTIFY_DRIVER: 'fake' }
    expect(issuesFor(local, 'NOTIFY_DRIVER')).toHaveLength(1)
  })

  it('still requires a Resend key when the driver is resend, in production or not', () => {
    const { RESEND_API_KEY: _omitted, ...noKey } = production
    expect(issuesFor(noKey, 'RESEND_API_KEY')).toHaveLength(1)
  })
})
