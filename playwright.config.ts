import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const BASE_URL = `http://localhost:${PORT}`

/**
 * A second server, in the mode production actually runs.
 *
 * `TENANCY_MODE` is read at boot, so path mode cannot be a project option on the subdomain
 * server — it needs its own process. Worth the extra build: path mode had **no coverage at all**
 * while being the deployed configuration, which is how Play could 404 for every guest with a
 * green suite (N-12). The routes genuinely differ — `/c/<slug>/watch/<title>` against
 * `/watch/<title>` — so this is a second surface, not a duplicate run.
 */
const PATH_PORT = 3101
const PATH_BASE_URL = `http://localhost:${PATH_PORT}`

/** Everything the two servers agree on. Divergence here is what N-12 §3 was about. */
const SHARED_ENV = {
  NODE_ENV: 'production',
  DATA_DRIVER: 'memory',
  // Explicit opt-in: a production build normally refuses an ephemeral store.
  ALLOW_EPHEMERAL_DATA: '1',
  VIDEO_DRIVER: 'fake',
  SESSION_SECRET: 'e2e-session-secret-0123456789abcdefghijklmnop',
  DEV_OPERATOR_EMAIL: 'operator@mehfilbox.test',
  // Not the repo's published default: the production guard refuses that, and this suite
  // deliberately boots with NODE_ENV=production. Fixed rather than random so specs can
  // sign in without threading a secret through them.
  DEV_OPERATOR_PASSWORD: 'e2e-operator-password',
  // The suite's challenge driver: a checkbox that yields a fixed token (D-34), so the widget's
  // appearance after repeated failures is exercised without Cloudflare.
  CAPTCHA_DRIVER: 'fake',
  // A `.test` host is taken as correctly configured and attached at once (doc 16 §1).
  DOMAIN_DRIVER: 'fake',
}

/**
 * Playwright drives the six critical journeys from doc 10 §2.
 *
 * Mobile first, because ~90% of traffic is a mid-range Android arriving from a WhatsApp link.
 * The desktop project exists to catch the enhancement layer, not the other way round.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  /**
   * **One worker, deliberately (N-33).**
   *
   * All three projects share one server process, one in-memory store and one demo catalogue.
   * Run in parallel they interfere: catalogues appear in each other's lists, the demo is read
   * while another worker is mid-write, and roughly one run in three failed on whichever test was
   * unlucky — the wizard list, a guest row, a caption. Each passed alone every time, which is the
   * signature of contention rather than a bug, and cost hours of chasing fixes for behaviour that
   * was already correct.
   *
   * Proved by running the whole suite with `--workers=1`: 108 passed, repeatedly, with no other
   * change.
   *
   * The cost is ~1.7 minutes instead of ~55 seconds. That is the right trade: a suite that fails
   * a third of the time teaches people to re-run it, and a re-run is how a real failure gets
   * ignored. Parallelism can come back when each worker gets its own store — the fix is
   * isolation, not concurrency.
   */
  workers: 1,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  timeout: 30_000,

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'mobile',
      // Doc 04 §1 and CLAUDE.md constraint 2: design and test at 360×800 first.
      use: { ...devices['Pixel 5'], viewport: { width: 360, height: 800 } },
      testIgnore: /path-mode\.spec\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
      testIgnore: /path-mode\.spec\.ts/,
    },
    {
      name: 'path-mode',
      // Mobile, because that is what a guest arrives on and path mode is a guest-facing concern.
      use: {
        ...devices['Pixel 5'],
        viewport: { width: 360, height: 800 },
        baseURL: PATH_BASE_URL,
      },
      testMatch: /path-mode\.spec\.ts/,
    },
  ],

  webServer: [
    {
      /**
       * The data cache under `.next/cache` survives between runs, and `unstable_cache` serves a
       * stale entry while it revalidates — so a row cached by last week's build, missing a column
       * added since, is what the first request of this run sees. Cleared before the build, once,
       * because the second server's build below starts after this one is listening.
       */
      command: 'rm -rf .next/cache/fetch-cache && pnpm build && pnpm start',
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      // A cold `next build` on a loaded machine exceeds three minutes. The suite itself runs in
      // well under a minute, so a generous boot budget costs nothing and removes a CI failure
      // that says "timed out" when nothing is actually wrong.
      timeout: 420_000,
      env: {
        ...SHARED_ENV,
        PORT: String(PORT),
        /**
         * The retired mode, requested explicitly (D-32). Rendering is identical between the
         * modes, and a catalogue at a host root is still the cheapest way to drive the guest
         * suites; only addressing differs, and the path-mode project below covers that.
         */
        TENANCY_MODE: 'subdomain',
        /**
         * The port has to match the one the server is actually on.
         *
         * It said `:3000` while the server ran on 3100, so every absolute URL the app produced —
         * the public catalogue link, the handover link — pointed at a port nothing was listening
         * on. Nothing caught it because every other spec navigates by relative path through
         * `baseURL`; the first test to follow a link the *app* generated found either a connection
         * refusal or, worse, whatever stray dev server happened to be on 3000 with its own store.
         */
        ROOT_DOMAIN: `mehfilbox.localhost:${PORT}`,
      },
    },
    {
      // The second build is nearly free: `.next` is warm from the first, and only the env differs.
      command: 'pnpm build && pnpm start',
      url: `${PATH_BASE_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 420_000,
      env: {
        ...SHARED_ENV,
        PORT: String(PATH_PORT),
        TENANCY_MODE: 'path',
        // No subdomain label: in path mode the catalogue hangs off the root host at /c/<slug>,
        // and `localhost` is reachable without the wildcard DNS that CI does not have.
        ROOT_DOMAIN: `localhost:${PATH_PORT}`,
      },
    },
  ],
})
