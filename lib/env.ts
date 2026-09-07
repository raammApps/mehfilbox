import 'server-only'
import { z } from 'zod'

/**
 * The one place `process.env` is read (enforced by an eslint rule).
 *
 * `server-only` is load-bearing: this module names every secret the app has, and it was once
 * pulled into the browser bundle through a transitive `lib/log` import. The guard turns that
 * class of mistake into a build error rather than a white screen in front of a guest.
 *
 * Configuration is validated once, at module load, so a missing Bunny key fails the boot of a
 * deployment rather than the first playback request of a wedding reception.
 */

const nonEmpty = z.string().trim().min(1)

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    /**
     * Set by Next during `next build`. The production guards below are runtime guards; the
     * build runs with NODE_ENV=production and no real configuration, and must not trip them.
     */
    NEXT_PHASE: z.string().optional(),

    /**
     * Opt in to running a production build on an ephemeral store. Exists for the Playwright
     * suite and for an offline planner demo — never for a real deployment, which is why it has
     * to be typed out rather than inferred.
     */
    ALLOW_EPHEMERAL_DATA: z.enum(['0', '1']).default('0'),

    /** The domain everything hangs off. Changing it must never require a code change. */
    ROOT_DOMAIN: nonEmpty.default('lvh.me:3000'),

    /**
     * How a catalogue is addressed. `subdomain` is what doc 02 §1 specifies and what production
     * wants; `path` needs only one CNAME rather than a wildcard, which on Vercel would mean
     * delegating the whole domain's nameservers.
     */
    TENANCY_MODE: z.enum(['subdomain', 'path']).default('subdomain'),

    /** Shown to a couple whose subscription lapsed. Not a code constant. */
    SUPPORT_EMAIL: z.string().email().default('hello@example.com'),

    DATA_DRIVER: z.enum(['memory', 'file', 'supabase']).default('memory'),
    DATA_DIR: nonEmpty.default('.data'),

    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional().or(z.literal('')),

    /**
     * Supabase renamed its keys: `anon` → publishable (`sb_publishable_…`) and `service_role`
     * → secret (`sb_secret_…`). New projects only show the new names, older ones the old, so
     * both spellings are accepted and normalised below rather than making the operator
     * translate between a dashboard and a doc.
     */
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    SUPABASE_SECRET_KEY: z.string().optional(),

    VIDEO_DRIVER: z.enum(['fake', 'bunny']).default('fake'),
    BUNNY_LIBRARY_ID: z.string().optional(),
    BUNNY_API_KEY: z.string().optional(),
    BUNNY_CDN_HOSTNAME: z.string().optional(),
    BUNNY_TOKEN_AUTH_KEY: z.string().optional(),
    BUNNY_WEBHOOK_SECRET: z.string().optional(),

    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),

    /**
     * What Vercel puts in the `Authorization` header of a scheduled invocation. Set it and
     * Vercel signs its crons with it; leave it unset and Vercel sends no header at all, so the
     * jobs 401 and silently never run. Falls back to SESSION_SECRET so a self-hosted deploy
     * needs no extra configuration.
     */
    /**
     * Photo storage. Separate from `VIDEO_DRIVER` on purpose: the two are different products
     * with different failure modes, and a deploy may reasonably run real video against fake
     * photographs (or the reverse) while one of them is being wired up.
     */
    /**
     * Who sends the application's own messages (N-50). Separate from the auth mailer Supabase
     * uses: that one is configured in Supabase's dashboard and sends registration and reset,
     * while this sends handover, delivery and expiry.
     *
     * `resend` covers email only. WhatsApp and SMS wait for MSG91, which is a ₹500/month
     * subscription against roughly a hundred messages (D-12) and so is deferred until a real
     * wedding needs it rather than paid for during a build.
     */
    NOTIFY_DRIVER: z.enum(['fake', 'resend']).default('fake'),
    RESEND_API_KEY: z.string().optional(),
    /** Overrides the default sender. A couple replies to this, so it must be a real mailbox. */
    NOTIFY_FROM: z.string().optional(),

    PHOTO_DRIVER: z.enum(['bunny', 'fake']).default('fake'),
    BUNNY_STORAGE_ZONE: z.string().optional(),
    /**
     * Full read/write/**delete** credential for every catalogue's photographs. Server-only —
     * this is why photo bytes proxy through the app instead of going browser-to-origin the way
     * film uploads do.
     */
    BUNNY_STORAGE_PASSWORD: z.string().optional(),
    /** Bunny's regional origin code. `SG` is nearest India; `de` is Bunny's unprefixed default. */
    BUNNY_STORAGE_REGION: z.string().default('de'),
    /** The pull zone in front of the storage zone — public reads, no credential. */
    BUNNY_PHOTO_CDN_HOSTNAME: z.string().optional(),

    CRON_SECRET: z.string().min(16).optional(),

    /**
     * How long a title may sit in a non-terminal state before reconcile asks the provider what
     * actually happened. Two hours by default so the job never races a healthy webhook.
     *
     * It is configuration because a dead webhook makes it wrong: an operator then watches
     * "UPLOADING" for two hours on a film the provider finished in thirty seconds. Setting it
     * to 0 makes reconcile authoritative immediately, which is what you want while webhook
     * delivery is unproven — as it is behind Vercel Deployment Protection, where the provider's
     * POST is bounced to an SSO login and never reaches the app at all.
     */
    RECONCILE_STALL_MINUTES: z.coerce.number().int().nonnegative().default(120),

    /**
     * Who verifies an operator's password.
     *
     * `local` is the signed cookie over a hash this app stores: what shipped, and what the
     * offline paths need — the Playwright suite and CI run with no Supabase project at all.
     * `supabase` hands the credential to Supabase Auth, which is the prerequisite for partner
     * self-registration: verified email, password reset, and a password this app never sees
     * (doc 15 §6).
     *
     * Defaults to `local` so switching is deliberate. It requires a Supabase Auth password to
     * exist for each operator, and `docs/DEPLOYMENT.md` told operators to set that to something
     * random precisely because nothing used it — so flipping this without setting one first
     * locks the console.
     */
    AUTH_DRIVER: z.enum(['local', 'supabase']).default('local'),

    DEV_OPERATOR_EMAIL: z.string().email().default('operator@mehfilbox.test'),
    DEV_OPERATOR_PASSWORD: nonEmpty.default('mehfilbox-dev'),

    PLAYBACK_TOKEN_TTL_S: z.coerce.number().int().positive().default(4 * 60 * 60),

    /** Set by Vercel; surfaced on /api/health so a deploy can be identified. */
    VERCEL_GIT_COMMIT_SHA: z.string().optional(),
  })
  .transform((env) => ({
    ...env,
    // One canonical name downstream, whichever spelling the dashboard offered.
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY,
  }))
  .superRefine((env, ctx) => {
    if (env.DATA_DRIVER === 'supabase') {
      for (const key of [
        'NEXT_PUBLIC_SUPABASE_URL',
        'NEXT_PUBLIC_SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message:
              key === 'SUPABASE_SERVICE_ROLE_KEY'
                ? 'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY, sb_secret_…) is required when DATA_DRIVER=supabase'
                : `${key} is required when DATA_DRIVER=supabase`,
          })
        }
      }
    }

    if (env.VIDEO_DRIVER === 'bunny') {
      for (const key of [
        'BUNNY_LIBRARY_ID',
        'BUNNY_API_KEY',
        'BUNNY_CDN_HOSTNAME',
        'BUNNY_TOKEN_AUTH_KEY',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when VIDEO_DRIVER=bunny`,
          })
        }
      }
    }

    if (env.NOTIFY_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      // Fails at boot rather than at the first expiry warning. A notification driver that cannot
      // authenticate does not throw when it is constructed — it throws months later, at the one
      // moment the message mattered.
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY is required when NOTIFY_DRIVER=resend',
      })
    }

    if (env.PHOTO_DRIVER === 'bunny') {
      for (const key of [
        'BUNNY_STORAGE_ZONE',
        'BUNNY_STORAGE_PASSWORD',
        'BUNNY_PHOTO_CDN_HOSTNAME',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} is required when PHOTO_DRIVER=bunny`,
          })
        }
      }
    }

    const building = env.NEXT_PHASE?.includes('build') ?? false

    if (env.NODE_ENV === 'production' && !building) {
      if (env.SESSION_SECRET.startsWith('dev-only')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message: 'The example SESSION_SECRET must not be used in production',
        })
      }
      /**
       * The dev default is printed in this repository, so it is a published password. Login
       * reads the operator's hash from the database rather than this value, which is why it was
       * survivable — but `ALLOW_EPHEMERAL_DATA=1` in production would seed an operator from it,
       * and the console is publicly reachable.
       */
      if (env.DEV_OPERATOR_PASSWORD === 'mehfilbox-dev') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DEV_OPERATOR_PASSWORD'],
          message: 'The committed dev password must not be used in production',
        })
      }
      if (env.DATA_DRIVER !== 'supabase' && env.ALLOW_EPHEMERAL_DATA !== '1') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['DATA_DRIVER'],
          message: 'Production must run on the supabase driver; memory/file lose data on restart',
        })
      }
    }
  })

export type Env = z.infer<typeof schema>

function load(): Env {
  const parsed = schema.safeParse(process.env)
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid environment configuration:\n${detail}`)
  }
  return parsed.data
}

export const env: Env = load()
