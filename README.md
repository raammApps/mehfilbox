# Mehfilbox

A white-label platform that presents a wedding's best moments as the couple's own private,
cinematic streaming service. An operator at a wedding management company creates a catalogue,
uploads the films, arranges the sections in a customizer, and publishes a branded site the
couple's guests browse like a streaming app.

**It is a keepsake, not an archive.** 6–15 items, 3–5 sections, two screens of scroll. The full
40GB and the 2,000 photos stay wherever they live today.

The specification lives in [`docs/spec/`](docs/spec/). This README covers
running and shipping the code.

---

## Documentation

| | |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | How it fits together, with diagrams — **start here** |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Running it: accounts, variables, DNS |
| [`docs/README.md`](docs/README.md) | Why there are two documentation trees |
| [`docs/spec/`](docs/spec/) | The original specification, docs 01–15 |

## Quick start

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

Then open:

| What | Where |
|---|---|
| Demo catalogue | http://localhost:3000/?__catalogue=aanya-vikram |
| Admin console | http://localhost:3000/admin — `operator@mehfilbox.test` / `mehfilbox-dev` |
| Health probe | http://localhost:3000/api/health |

No Supabase project and no Bunny account are needed. The default drivers are in-process and
deterministic, which is what lets the whole test suite — and a planner demo on venue wifi — run
with nothing behind them.

### Addressing is configuration

`ROOT_DOMAIN` and `TENANCY_MODE` decide how catalogues are addressed, and neither reaches a
component — `catalogueUrl()` and `adminUrl()` in `lib/tenant.ts` are the only places that know.

| Mode | Catalogue | Admin | DNS |
|---|---|---|---|
| `subdomain` | `<slug>.example.com` | `admin.example.com` | Wildcard (needs nameserver delegation on Vercel) |
| `path` | `example.com/c/<slug>` | `example.com/admin` | One CNAME |

`/c/<slug>` is the real route in both; subdomain mode rewrites onto it, so path mode makes
`middleware.ts` a no-op.

**Locally**, the default `ROOT_DOMAIN=lvh.me:3000` gives you subdomain mode with no setup —
`*.lvh.me` is public DNS pointing at `127.0.0.1`, so `http://aanya-vikram.lvh.me:3000` just
works. `?__catalogue=<slug>` still works on a bare `localhost` and is what CI uses; it is
refused in production unless `ALLOW_EPHEMERAL_DATA=1`.

---

## Verification

```bash
pnpm verify
```

Runs lint, typecheck, the unit and component suites, and the palette contrast gate. End-to-end
runs separately because it builds and boots the app:

```bash
pnpm test:e2e
```

| Command | Covers |
|---|---|
| `pnpm test` | 168 unit and component tests |
| `pnpm test:e2e` | All six journeys in doc 10 §2, plus the OG budget and a zero-axe-violations gate across eight page states |
| `pnpm check:contrast` | Every colour pairing in doc 04 §2, read out of `globals.css` |
| `pnpm check:bundle` | Browse first-load JS against doc 05 §6's 150KB. Needs `pnpm build` first. |
| `pnpm test:integration` | The real Bunny and Supabase drivers. Opt-in; skips without credentials. |
| `pnpm verify:playback` | Uploads to Bunny and proves signed playback works and unsigned does not |
| `pnpm preflight` | Read-only readiness check for both external services |
| `pnpm typecheck` | Strict TS, `noUncheckedIndexedAccess`, no `any` |

The suite runs in about two seconds without a database. That is deliberate: a test suite that
needs infrastructure becomes a test suite nobody runs.

---

## Swappable drivers

Three seams keep the product from being welded to a vendor. Each has a real implementation and
a local one, and both go through the same interface.

| Seam | Interface | Drivers |
|---|---|---|
| Persistence | `lib/db/repository.ts` | `memory` · `file` · `supabase` |
| Video | `lib/video/provider.ts` | `fake` · `bunny` |
| Config | `lib/env.ts` | validated once, at boot |

`DATA_DRIVER=file` persists to `.data/store.json`, which survives a dev-server restart and makes
an offline demo possible. Production refuses to start on anything but `supabase` unless
`ALLOW_EPHEMERAL_DATA=1` is set explicitly.

Doc 05 §2 calls Bunny "a default, not a lock-in". Switching providers is one new class behind
`VideoProvider` and one line in `lib/video/index.ts`.

---

## Adding a module

The module system is the product's moat (doc 14). Adding one touches **its own folder plus one
registry line** — nothing else. `tests/unit/registry.test.ts` fails the build if any file outside
`modules/` names a module type.

```
modules/<type>/
  schema.ts    Zod config → validation and the generated editor form
  Guest.tsx    What a guest sees
  Editor.tsx   What the operator configures
  index.ts     defineModule({ meta, schema, Guest, Editor, defaults, advise })
```

Then one line in `modules/registry.ts`. The browse page, the customizer, the preview pane and the
admin all pick it up.

---

## Layout

```
app/
  c/[slug]/                 Guest catalogue (middleware rewrites the subdomain here)
    watch/[titleSlug]/      Player — its own route, needs a fresh token
    locked/ · renew/        Passcode gate · subscription renewal, never a 404
  admin/                    Operator console, auth-gated, light theme
  api/                      Route handlers, all through lib/http/handler.ts
components/
  streaming/                Billboard, PosterRow, TitleModal, ProfileGate, Player
  admin/                    UploadManager, CustomizerShell, PreviewPane, ThemePicker
  chrome/                   TopNav, SiteFooter, ThemeStyle
modules/<type>/             See above. registry.ts is the only wiring point.
lib/
  schema.ts                 Zod domain types — everything else infers from here
  tenant.ts                 Pure host → route resolution
  catalogue-access.ts       The one place a guest request is authorised
  video/ · db/ · admin/     The swappable seams
supabase/migrations/        Schema + RLS
e2e/ · tests/               Playwright · Vitest
```

---

## Deployment

**[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) is the full guide** — accounts, Bunny and Supabase
setup with the settings that fail closed, DNS, every environment variable, verification steps
and what to alert on. The summary below is orientation; that document is the procedure.

### Vercel (primary)

`mehfilbox.com` is canonical and `mehfilbox.in` redirects to it. Production runs `TENANCY_MODE=path`,
so a catalogue is `/c/<slug>` and no wildcard DNS is required; subdomain mode still works and is
what the wildcard would be for. `vercel.json` pins the Mumbai region — the audience is in India and
the CDN edge matters more than anything else in the config.

Two crons are declared there, `reconcile` and `usage`, and that is the plan's limit: Hobby allows
two, each running once a day. `/api/cron/notify` needs a quarter-hour cadence, so it is driven from
`.github/workflows/notify-drain.yml` instead and has no entry — see N-54.

### Container (portable)

```bash
docker build -t mehfilbox .
docker run -p 3000:3000 --env-file .env.production mehfilbox
```

Standalone output, non-root user, health check on `/api/health`. No secret is baked into the
image: `lib/env.ts` skips its production guards during the build phase precisely so the build
can run without real configuration.

### First run against Supabase and Bunny

```bash
pnpm preflight
```

Read-only. Probes both services and prints exactly what is missing and where to get it —
whether the Bunny key is an account key or a library key, whether the schema is applied, whether
token authentication is on. Exits non-zero when the *configured* drivers are not ready, so it
can gate a deploy. Run it first; the steps below are what it will ask for.

```bash
pnpm bootstrap:sql > /tmp/bootstrap.sql
```

1. Paste that into the Supabase dashboard's SQL editor and run it. It applies both migrations
   and creates the first org, in one transaction. Generating the script rather than executing it
   is deliberate: running arbitrary DDL would need an `exec_sql` RPC, and that is a permanent
   remote-code-execution hole in a database holding people's weddings.
2. Create the operator in Authentication → Users, then run the `insert into operators` statement
   printed at the end of the script (`operators.id` references `auth.users.id`).
3. In Bunny, create a **Stream video library**. Its dashboard gives you the library id, the CDN
   hostname (`vz-….b-cdn.net`) and, under Security, the token authentication key. Note that
   Bunny refuses to create any zone while the account balance is zero — it returns
   `user.insufficient_balance`, which reads like a permissions error and is not one. Note also
   that the Stream endpoints want the **per-library** key, not the account key; `pnpm preflight`
   tells the two apart.
4. Fill in `.env.local`, then flip the drivers:

   ```
   DATA_DRIVER=supabase
   VIDEO_DRIVER=bunny
   ```

   Supabase's newer key names are accepted as-is: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
   `SUPABASE_SECRET_KEY` work alongside the older `…ANON_KEY` / `…SERVICE_ROLE_KEY`.

5. Verify against the real services:

   ```bash
   pnpm test:integration
   ```

   These skip silently without credentials, so CI and offline work are unaffected. With
   credentials they exercise the Bunny and Supabase drivers directly — TUS ticket shape, signed
   playback URLs, jsonb round-trips, org scoping, and that the anon key cannot read a draft
   catalogue. Everything they create is prefixed `itest-` and torn down afterwards.

6. `GET /api/health` reports which drivers actually came up — check it after every deploy. A
   deployment that silently came up on the memory driver is the failure that probe exists for.

### Observability

Vendor-neutral by design: everything is structured JSON on stdout, which Vercel, Docker and a
plain `node server.js` all capture. No account is needed and nothing is added to the browser
bundle. Putting Sentry or Axiom behind it later is `lib/observability.ts` and nothing else — no
call sites change.

| Signal | Log line | Why it exists |
|---|---|---|
| Playback start, press-play → first frame | `qoe.playback_start` with `overBudget` | doc 05 §6's "the metric the product lives or dies on"; doc 01 §8 targets p75 < 1.5s |
| Rebuffer ratio | `qoe.rebuffer` with `overBudget` | doc 01 §8 targets < 1% |
| Playback failure | `qoe.playback_error` | Distinguishes "still processing" from a real fault |
| Per-catalogue monthly usage | `usage rollup complete`, nightly | doc 05 §2 cost guardrails |
| Delivery over 300GB/month | `usage.delivery_alert` (warn) | doc 05 §2 — flaunted hard, or a leaked link |
| Unhandled server error | `error.report` with a trimmed stack | Was a one-line reason with no way to find the code |
| Client crash | `error.report` scope `client` | Was visible only in a console nobody reads |

Alert on `usage.delivery_alert` and on `error.report` with `severity: error`. The two
`overBudget` booleans are pre-computed so a query filters on a flag rather than parsing a
threshold.

Guest telemetry carries **no identity** — a catalogue, a title, a duration, a coarse connection
label. Doc 06 §5 keeps the viewer side free of personal data and telemetry gets no exemption.

### What is enforced where

| Concern | Enforcement |
|---|---|
| Tenant isolation | Postgres RLS (`0002`) **and** org-scoped queries in `lib/admin/session.ts` |
| Service-role key never in the browser | `server-only` on `lib/env.ts`, `lib/db/*`, `lib/video/bunny.ts` |
| No catalogue is indexable | `X-Robots-Tag` on every response, plus per-page metadata |
| Passcode brute force | 5 attempts, 15-minute lockout per IP, constant-time compare |
| Playback token scope | Bound to catalogue **and** title, 4h expiry |
| No `-flix` in a product name | `appNameSchema`, rejected at catalogue creation |
| Palette contrast | `pnpm check:contrast` in CI, and live in the customizer at pick time |

---

## Known gaps

Recorded honestly rather than left to be discovered. Details and reasoning in
`docs/PROGRESS.md`.

- **The browse route renders dynamically, not ISR.** Reading the locale cookie opts the route
  out of static generation. Doc 05 §6 wants ISR here. The fix is to move locale into the path or
  resolve it client-side; it is a real LCP cost and it is not yet paid.
- **Operator auth is a signed cookie, not Supabase Auth.** The schema and RLS are written for
  Supabase Auth; the app currently verifies a scrypt hash itself. Fine for Phase 0's single
  operator, and the swap is contained to `lib/admin/session.ts`.
- **Poster candidates and trailers come from the provider, unstyled.** Doc 04 §6's generated
  artwork is implemented and used as the fallback everywhere, but three-frame extraction on
  `ready` is only as good as what Bunny returns.
- **Poster thumbnails 403 under token authentication.** Enabling it protects every file in the
  zone, including `/{guid}/thumbnail_1.jpg`, which `getStatus` returns as a plain URL and the
  admin renders directly. Signing them with the 4-hour playback TTL is wrong: `posterUrl` is
  persisted and embedded in ISR pages and the OG image. The fix is a redirect route
  (`/api/poster/<titleId>` → 302 to a freshly signed URL) so the stored value never expires.
  Until then, generated poster art is used — which is the default anyway.
- **The Supabase driver has never run.** `SupabaseRepository` and both migrations still have no
  execution behind them, pending the secret key and the bootstrap SQL. The Bunny driver is now
  covered by `pnpm test:integration` and `pnpm verify:playback`.
- **TUS resume against a real endpoint is unverified.** E2E-5 covers our half of the upload
  contract; resuming from a real acked offset after a real network drop needs a live provider and
  stays a device check (doc 10 §3 M-5).
- **No Lighthouse or QoE probe in CI.** Budgets live in `lib/budgets.ts` and the OG one is
  enforced; first-load JS, LCP and playback start are documented, not gated. Doc 09 P1-14.
- **Phase 1 modules are not built.** `continue_watching`, `timeline`, `checklist`, `randomiser`
  are Phase 1 by plan; the registry and `module_state` are ready for them.

The two things doc 13 §8 says not to delegate — real cleared footage for the demo, and measuring
playback start on real 4G at a venue — remain open by design.
