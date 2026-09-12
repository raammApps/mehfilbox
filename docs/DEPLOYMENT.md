# Deployment

Everything needed to put Mehfilbox in front of a real planner, in order, with the values and the
traps. Follow it top to bottom the first time; after that, only §9 matters.

Two rules worth internalising before you start:

- **`pnpm preflight` is the authority**, not this document. It probes both services and reports
  what is actually true in a few seconds.
- **Every failure in §3 and §4 fails closed and silently.** A wrong Bunny setting does not throw
  — it produces a 403 a guest sees, or a title that never leaves "processing". That is why each
  step below has a verification, and why you should not skip them.

---

## 1. What you are deploying

One codebase, two surfaces (doc 02 §1):

| Surface | Host | Who | What |
|---|---|---|---|
| **Guest catalogue** | `<slug>.heirloomfilms.app` | Guests, no login | Profile gate, billboard, poster rows, title modal, player |
| **Admin console** | `admin.heirloomfilms.app` | Operators, login | Create catalogue, upload, title, customizer, publish |
| Root | `heirloomfilms.app` | — | A signpost with a sign-in link. There is no marketing site; doc 03 leaves it out on purpose. |

Both are served by the same Next.js app. `middleware.ts` decides which one you get from the
`Host` header, and `resolveTenant` is a pure function with exhaustive unit tests, so routing
behaviour is knowable without deploying.

## 2. Accounts and prerequisites

| | Needed for | Notes |
|---|---|---|
| Vercel | Hosting, wildcard TLS, cron | Or any container host — see §10 |
| Supabase | Postgres + RLS | Free tier is fine for Phase 0 |
| Bunny.net | Stream library | **Requires a balance.** A zero-balance account refuses to create zones with `user.insufficient_balance`, which reads like a permissions error and is not one. |
| A domain | `heirloomfilms.app` or yours | Needs wildcard DNS, so the registrar must support a `*` CNAME |

> Doc 12 §3: run a trademark search on the Indian registry (classes 41 and 42) before printing
> **"Mehfilbox"** on planner collateral. Unlike "Heirloom", it is a coined word — crowding is
> unlikely and a clean class is plausible, which is an argument for searching and filing rather
> than assuming.

## 3. Bunny Stream

Create a **Stream video library**. Pick the storage region nearest your audience — Bunny has no
India origin, so Singapore is the closest; delivery still uses Bunny's India PoPs, which is what
doc 05 §2's cost maths actually depends on.

Then, in the library's settings:

| Setting | Value | Why |
|---|---|---|
| Token authentication (pull zone → Security) | **ON** | doc 01 US-5 promises a copied `.m3u8` dies within the hour. Off, and every playback URL is permanent and public — while every test still passes. |
| IP pinning (`ZoneSecurityIncludeHashRemoteIP`) | **OFF** | doc 05 §4: Indian mobile IPs rotate mid-playback and it causes false failures |
| Block requests with no referrer (`BlockNoneReferrer`) | **OFF** | Defaults to ON for a new library. Native HLS players send no `Referer`, so leaving it on 403s everything — and looks exactly like a broken token |

**Three different keys, and mixing them up produces identical 401s:**

| Key | Where | Used for |
|---|---|---|
| Account API key | Account Settings → API | Managing libraries. The app never needs it. |
| **Library** API key | Stream → your library → API | `BUNNY_API_KEY`. All `video.bunnycdn.com` calls. |
| Library **read-only** key | Same page | `BUNNY_WEBHOOK_SECRET`. Bunny signs webhooks with it. |
| Token authentication key | Pull zone → Security | `BUNNY_TOKEN_AUTH_KEY`. Signs playback and poster URLs. |

**Webhook**: point the library's webhook at `https://<your-domain>/api/webhooks/bunny` — the
admin host in subdomain mode, the single host in path mode.

Verify: `pnpm preflight` should show token auth enforced, referrer blocking off, IP pinning off.
Then `pnpm verify:playback` uploads a real clip and asserts a signed manifest, a signed child
playlist and a signed poster all return 200 while all three unsigned return 403.

## 4. Supabase

```bash
pnpm bootstrap:sql > bootstrap.sql
```

Paste into the SQL editor and run. One transaction: 11 tables, 16 RLS policies, and the first
org. This step cannot be automated — PostgREST does not execute DDL, and the Management API
wants a personal access token rather than the secret key. That is a feature: arbitrary remote
DDL against a database holding people's weddings is not a capability worth building.

Then create the operator:

1. Authentication → Users → Add user. `operators.id` references `auth.users.id`, so the auth
   row must exist first.
2. Run the `insert into operators` statement printed at the end of the bootstrap script, with
   that user's id.

The app verifies its own scrypt hash (`lib/admin/session.ts`), so the Supabase Auth password on
that account is never used — set it to something random rather than something memorable.

Verify: `pnpm preflight` shows the schema and the first org. `pnpm test:integration` should be
10/10, including the RLS test.

> If the integration run fails immediately after applying the DDL with `PGRST205`, wait thirty
> seconds. PostgREST caches the schema and takes a moment to notice new tables.

## 5. DNS and addressing

`TENANCY_MODE=path` is the product (D-32, 12 September 2026). A catalogue's address is
`mehfilbox.com/<studio>/<wedding>` — the studio segment is the originating org's slug, frozen on
the catalogue at creation — and the console is `mehfilbox.com/admin`.

```
TENANCY_MODE=path
ROOT_DOMAIN=mehfilbox.com
```

| Surface | URL |
|---|---|
| Catalogue | `mehfilbox.com/kalyanam/aanya-vikram-2026` |
| A film, deep-linked | `mehfilbox.com/kalyanam/aanya-vikram-2026/watch/the-ceremony?t=428` |
| Legacy link | `mehfilbox.com/c/aanya-vikram-2026` → 301 to the address above |
| Sign in | `mehfilbox.com/login` |
| Console | `mehfilbox.com/admin` |

**DNS: the root and `www`, nothing else.** Two A records (or a CNAME on `www`) at the registrar,
nameservers left where they are, MX records untouched. One domain, one certificate, no wildcard —
which is the reason for the mode. `GO-LIVE.md` §4 has the exact records for the live domains.

Reserved first segments (`admin`, `api`, `c`, `d`, `claim`, `my`, `login`, `register`,
`set-password`, `privacy`, `terms`, `og`, `_next`, `fonts`, `media`, plus every reserved
subdomain label) can never be a studio slug; `lib/tenant.ts` lists them and registration refuses
them.

### `subdomain` — retired, kept for the harness

`TENANCY_MODE=subdomain` still works — `<wedding>.<root>` and `admin.<root>` — because the
Playwright suite boots one server this way and nothing about *rendering* differs between the
modes. It is not sold and no document describes it as an address any more. It needs a wildcard
record, which on Vercel means delegating the whole domain's nameservers; that cost is why it was
retired.

## 6. Environment variables

Set these on the Vercel project (Production, and Preview if you want previews to work).

**Required**

| Variable | Value | Secret |
|---|---|---|
| `DATA_DRIVER` | `supabase` | |
| `VIDEO_DRIVER` | `bunny` | |
| `ROOT_DOMAIN` | e.g. `marquee.raammcorp.in` — no protocol, no port | |
| `TENANCY_MODE` | `path` or `subdomain` — see §5 | |
| `SUPPORT_EMAIL` | Shown on the renewal screen, told to a suspended studio (N-27), **where every operational alert is sent** (N-53), and where a studio's credit request lands (N-65). It must be an address that can *receive* — a `.test` domain here means the alerting built in N-53 goes nowhere, which is how it sat for a day. | |
| `NOTIFY_DRIVER` | `resend` in production. The default is `fake`, which records a send and returns success without sending; `lib/env.ts` refuses to boot on `fake` against the supabase driver for exactly that reason. | |
| `NOTIFY_FROM` | `Mehfilbox <hello@mehfilbox.com>` — a verified Resend sender | |
| `DEMO_CATALOGUE_SLUG` | The catalogue the landing page offers as "open a demo wedding", and the one the synthetic check walks. **Production's slug differs from the seed fixture's**, so leaving this unset points the marketing CTA at a catalogue that does not exist — and it returns 200, because a missing catalogue renders "not available" rather than a 404. | |
| `SESSION_SECRET` | `openssl rand -hex 32`. **Generate a new one; do not reuse the dev value.** Signs operator sessions and passcode grants. | ● |
| `CRON_SECRET` | `openssl rand -hex 32`. See the warning below. | ● |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (older projects: `…ANON_KEY`) | |
| `SUPABASE_SECRET_KEY` | `sb_secret_…` (older projects: `SUPABASE_SERVICE_ROLE_KEY`) | ● |
| `BUNNY_API_KEY` | The **library** key | ● |
| `BUNNY_LIBRARY_ID` | Numeric, from the library dashboard | |
| `BUNNY_CDN_HOSTNAME` | `vz-….b-cdn.net`, hostname only | |
| `BUNNY_TOKEN_AUTH_KEY` | Pull zone → Security | ● |
| `BUNNY_WEBHOOK_SECRET` | The library **read-only** key | ● |

**Optional**

| Variable | Default | |
|---|---|---|
| `PLAYBACK_TOKEN_TTL_S` | `14400` (4h) | doc 05 §4 |
| `DEV_OPERATOR_EMAIL` / `DEV_OPERATOR_PASSWORD` | — | Ignored under `DATA_DRIVER=supabase` |
| `CAPTCHA_DRIVER` | `none` | `none` · `fake` · `turnstile` — the challenge after repeated sign-in and guest-code failures, and on every registration (D-34). `none` keeps the rate limits and lockouts and shows no widget. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | — | Required when `CAPTCHA_DRIVER=turnstile`. From the Cloudflare dashboard → Turnstile → the widget for `mehfilbox.com`. The site key is public by design; the secret never leaves the server. |

> **`CRON_SECRET` is the one people forget.** Vercel sends `Authorization: Bearer $CRON_SECRET`
> on scheduled invocations — and **no header at all** when it is unset. The jobs then 401 and
> never run, which surfaces weeks later as usage that was never recorded and stuck titles that
> were never reconciled. Nothing alerts on it, because from the outside nothing happened.

`lib/env.ts` validates all of this at boot and refuses to start a production deploy on an
ephemeral data driver or on the example `SESSION_SECRET`. A misconfigured deploy fails at boot
rather than on a guest's first request.

## 7. Deploy

`.env.vercel.local` holds all fifteen variables, already assembled and gitignored. Rather
than typing them into a web form — where one typo in `BUNNY_TOKEN_AUTH_KEY` produces a green
build and a 403 for every guest — push them from the file that the local verification scripts
already proved works:

```bash
vercel login                  # once; interactive, needs a browser
./scripts/deploy-vercel.sh
```

> The filename is deliberate. Next.js auto-loads `.env.production.local` on any production
> build, so deploy values kept under that name leak into local builds — `TENANCY_MODE=path`
> got in that way once and turned middleware into a no-op, failing 44 E2E tests with a
> symptom that pointed at Next.js. `.env.vercel.local` is never loaded by Next, and `.env*.local`
> still keeps it out of git.

The script links the project, replaces every variable (idempotent — safe to re-run), deploys,
and prints the verification steps.

After the first deploy, connecting the GitHub repo (`raammApps/mehfilbox`) to the project
means every push to `main` deploys.

> Production runs `ROOT_DOMAIN=heirloomfilms.in`. If the real URL differs, update it and redeploy
> — in `path` mode a wrong value breaks share links and the OG card, not routing, so the site
> looks fine while every link it hands out points somewhere else. See [`GO-LIVE.md`](./GO-LIVE.md).

`vercel.json` already pins the Mumbai region (`bom1`) and declares both cron jobs. CI runs lint,
typecheck, 198 unit and component tests, the contrast gate, the build, the first-load JS budget,
and 69 E2E specs — so a red pipeline is a real signal.

## 8. Verify the deployment

In order. Each one catches a different class of mistake.

```bash
# subdomain mode
curl https://admin.raammcorp.in/api/health
# path mode
curl https://marquee.raammcorp.in/api/health
```

Must report `"drivers":{"data":"supabase","video":"bunny"}`. **A deploy that silently came up on
the memory driver is exactly what this probe exists to catch** — it would work perfectly and
lose everything on the next restart.

Then:

1. **Sign in** at the admin URL for your mode (§5) and create a catalogue.
2. **Upload a real film.** Watch it reach `ready` on its own — that proves the webhook signature
   is right. If it sits in `processing`, the webhook is being rejected: check the logs for
   `bunny webhook: signature mismatch`, which prints the headers it actually received. The
   nightly reconciliation will rescue it within 24h either way, so this is a quality problem,
   not a data-loss one.
3. **Publish and open the guest URL on a phone**, on mobile data, not office wifi.
4. **Check the WhatsApp preview** by sending the link to yourself. Append `?v=2` when
   re-checking — WhatsApp caches previews for days (doc 10 §6).
5. **Confirm the crons ran** the next morning: `usage rollup complete` and the reconcile line.
   Silence here means `CRON_SECRET` is wrong.

Then work through doc 10 §6, the per-catalogue pre-handover runbook, before any link goes to a
couple.

## 9. Operating it

**Alert on two log lines:**

| Line | Meaning |
|---|---|
| `error.report` with `severity: error` | An unhandled server error or a client crash |
| `usage.delivery_alert` | A catalogue passed 300GB delivered this month — flaunted hard (good) or a leaked link (act on it) |

**Watch two numbers**, both emitted with a pre-computed `overBudget` boolean so you filter on a
flag rather than parse a threshold:

| Line | Target |
|---|---|
| `qoe.playback_start` | p75 under 1500ms on 4G — doc 01 §8, the metric the product lives or dies on |
| `qoe.rebuffer` | ratio under 1% |

Everything is structured JSON on stdout, which Vercel captures. No vendor is wired in;
`lib/observability.ts` is the seam if you want one, and swapping it changes no call sites.

**Rollback** is Vercel's previous deployment — one click, and doc 10 §6 asks you to confirm it
is available before every handover. Nothing in a deploy migrates data, so rolling back the app
never risks the content.

**Schema changes** are additive-only while a wedding is live. Add a migration to
`supabase/migrations/`, apply it in the SQL editor, then deploy — in that order, so the old
code never meets the new schema mid-request.

## 10. Container, if not Vercel

```bash
docker build -t heirloomfilms .
docker run -p 3000:3000 --env-file .env.production heirloomfilms
```

Standalone output, non-root user, health check on `/api/health`. No secret is baked in — the
build skips `lib/env.ts`'s production guards precisely so it can run without real configuration.

You lose three things Vercel provides, and each needs replacing: wildcard TLS (a reverse proxy
with a wildcard certificate), the cron scheduler (two entries hitting `/api/cron/reconcile` and
`/api/cron/usage` with the `Authorization: Bearer $CRON_SECRET` header), and ISR revalidation
across instances — run a single instance, or add shared cache handling, before scaling out.

## 11. Known gaps at deploy time

Honest, so they are not discovered at a wedding. Tracked in
[`../docs/NEXT.md`](../docs/NEXT.md).

- **The webhook signature has never been verified against a real delivery.** It needs a public
  URL, so it cannot be tested locally. It fails closed, and the nightly reconciliation is the
  safety net. Step 8.2 is how you confirm it.
- **The browse route renders dynamically, not ISR** (N-4). It reads the locale cookie, which
  opts it out of static generation. A real LCP cost on the page every guest lands on.
- **No Lighthouse in CI** (N-5). First-load JS is gated at 150KB; LCP and CLS are not.
- **The production database has no demo catalogue.** The nine-title fixture exists only in the
  `memory` and `file` drivers, and a real one needs real cleared footage (N-6, doc 13 §8).

## 11. Switching to Supabase Auth

`AUTH_DRIVER` decides who verifies an operator's password. It defaults to `local` — the signed
cookie over a hash this app stores — which is what the Playwright suite and CI need, since they
run with no Supabase project at all.

`supabase` hands the credential to Supabase Auth: a verified email address, a password reset
flow, and a password this application never sees. Doc 15 §6 makes it the prerequisite for
partner self-registration.

**Set a Supabase Auth password before flipping it.** §4 of this document told you to set that
password to something random, precisely because nothing used it. Flip `AUTH_DRIVER` without
changing it and the console locks.

1. Supabase → Authentication → Users → the operator → **"Reset password" on the existing row.**

   > **Do not delete and recreate the user.** `operators.id` references `auth.users(id)` **on
   > delete cascade**, so removing the auth account silently deletes the operator row with it —
   > and then no driver can sign you in, because the local one reads the same row. This happened:
   > the account came back with a new id, the operator row was gone, and login failed on both
   > drivers in a way that looked like the new authenticator was broken. If it happens again, the
   > fix is to re-insert the `operators` row with the *new* `auth.users.id`.
2. Confirm `operators.id` equals that user's `auth.users.id`. It will, if the operator was
   created the way §4 describes.
3. Set `AUTH_DRIVER=supabase` on the Vercel project and redeploy.
4. Sign in. If it fails, set `AUTH_DRIVER=local` and you are immediately back — the old hash is
   still in the row, untouched.

Authenticating is not the same as being allowed in: a Supabase user with no `operators` row is
refused, and refused *identically* to a wrong password, so neither answer tells an attacker
whether an address exists.

## 12. SMTP, before any partner registers

Supabase Auth sends a confirmation email on sign-up and a link on password reset. Out of the box
it sends both through **Supabase's built-in SMTP, which allows only a few messages per hour** —
it exists for development, and hitting the limit returns `over_email_send_rate_limit`.

That is not a detail to discover with a real studio on the phone. A partner who cannot receive
their confirmation cannot sign in at all, and the app cannot tell them why beyond "try again
shortly" — the limit is a property of the project, not of their address.

**Configure your own SMTP before opening registration.** Supabase → Project Settings →
Authentication → SMTP Settings. Any transactional provider works; Resend, SendGrid and Amazon
SES are the usual choices for an Indian entity, and all three have a free tier that comfortably
covers a partner sign-up rate.

Two related settings on the same screen worth deciding deliberately:

- **Confirm email** (`mailer_autoconfirm`). On by default, and it should stay on: an
  unconfirmed address means a partner account whose owner may never have asked for it. It does
  mean a partner must click the link before their first sign-in, which the sign-up screen says.
- **Site URL / redirect URLs**. The confirmation link points here. Left at its default, a partner
  confirms and lands somewhere that is not this deployment.

Until SMTP is configured, registration works but delivery does not, and the honest summary is
that partner sign-up is not ready for anyone outside your own testing.


## 13. Sign-in, credential links and the challenge

Since 12 September (D-33, D-34) sign-in is at `/login` with a Studio door and a Couple door;
`/admin/login` redirects there. Forgot-password and first-sign-in links are **ours**: a hashed,
single-use token on `/set-password/<token>`, sent through the notification queue in the recipient's
org's language, and redeemed through `AuthProvider.setPassword` — so they behave identically under
`AUTH_DRIVER=local` and `AUTH_DRIVER=supabase`, and never depend on Supabase's own reset emails or
its site-URL setting. §12's SMTP still matters for Supabase's *registration confirmation*; nothing
else sends through Supabase any more.

Under `AUTH_DRIVER=supabase` the driver uses the **service-role** key for two calls only — creating
an account on somebody's behalf and replacing a password from a redeemed link — which is why that
key must be present (it already is: the repository needs it).

**The challenge.** With `CAPTCHA_DRIVER=turnstile`, a Turnstile widget appears on sign-in and the
guest code after the third failure and on every registration; without it, a challenged attempt is
refused before the password is even checked. Create the widget in Cloudflare's dashboard as
*Managed*, allow `mehfilbox.com` (and the preview hostnames if you want previews to sign in), and
set both keys. Leave the driver at `none` until then — the per-address and per-IP lockouts apply
regardless.
