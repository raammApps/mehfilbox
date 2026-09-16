# Subsystem map — `notifications`

Mapped 16 September 2026 against the code on `main` (HEAD `96fb305`). Where a document — or a
stale in-code comment — disagrees with the code, the code is what is described and the
disagreement is listed in §7. Line numbers refer to the files as read on this date.

---

## 1. Summary

Notifications is the one queue every message Mehfilbox sends rides through, and the one table that
records what was actually sent. It exists so that a request a person is waiting on — publishing a
wedding, asking for a credit, forgetting a password — never blocks on a third-party mailer: a
route writes a row (`enqueue`, `lib/notify/send.ts:16-49`) and returns; a bearer-guarded cron
(`/api/cron/notify`) drains it separately. Eight templates cover every message the product sends,
each rendered in English and Hindi from the same `lib/i18n.ts` dictionary the rest of the product
uses, so a template missing a Hindi string fails the same test a missing button label would. Two
kinds of recipient exist: a studio or couple, told about their own wedding (delivery, handover,
expiry/grace warnings, archive), and Mehfilbox's own ops inbox, told when something in the
pipeline is broken or a studio wants something from a human (`ops-alert`, `credit-request`). Only
one channel actually sends today — email, through Resend — behind a seam (`NotificationProvider`)
built to take a second driver without a rewrite; WhatsApp exists today only as a `wa.me` compose
link a studio sends by hand, and SMS exists only as a schema value nothing ever produces. A
separate, older path — Supabase Auth's own mailer — still sends exactly one message outside this
queue: the sign-up confirmation email, configured in the Supabase dashboard rather than in this
codebase.

## 2. Actors

| Actor | How they appear in code | What they trigger or receive |
|---|---|---|
| **Studio operator** | `requireOwnedCatalogue` / `requireOperator` (`lib/admin/session.ts`) | Triggers delivery, handover, credit-request, couple credential issuance; receives expiry/grace warnings, the archive message, and (via the originating studio path) warnings even after a wedding is handed over. |
| **Couple / client account** (`orgs.kind = 'couple'`) | Same session shape, org kind differs | Receives delivery (if a studio types their address), handover, expiry/grace/archive once they own the catalogue, the credential link for their first sign-in or a forgotten password; triggers `ops-alert` indirectly by closing their account (`POST /api/my/close`). |
| **Platform admin** | `requirePlatformAdmin` (`lib/admin/platform.ts`) | Triggers a credential link when creating a studio, adding an operator, or resending a password link. Never a recipient. |
| **Scheduled jobs (cron)** | Bearer `CRON_SECRET` (or `SESSION_SECRET` fallback) checked in each route | The only actor that queues *and* drains without a person in the loop: `warnings`, `lifecycle`, `notify` (drain), plus `reconcile`/`synthetic`/`usage`, which queue nothing directly except `usage`'s and `reconcile`'s and `synthetic`'s alerts. |
| **Mehfilbox ops** (`SUPPORT_EMAIL`) | Recipient only, never authenticated | Every `ops-alert` and every `credit-request`. If unset, `alertOps` logs a warning and sends nothing (`lib/notify/alert.ts:46-52`). |
| **GitHub Actions** | External caller, not part of the app | Drives `/api/cron/notify` every 15 minutes and `/api/cron/lifecycle` + `/api/cron/warnings` once a day, because Vercel's Hobby plan has no cron slot left for them (`.github/workflows/notify-drain.yml:1-15`). |

## 3. Capabilities

Queue, render and send

- `enqueue()` — renders the message at queue time (not send time) and writes a `queued` row; never sends — `lib/notify/send.ts:16-49`.
- `drain()` — sends everything queued, oldest first, up to a limit of 50; skips (not fails) a channel the active provider cannot carry — `lib/notify/send.ts:61-95`.
- Provider seam: one method, `send()`, no provider type leaking past it — `lib/notify/provider.ts:1-62`.
- Driver switch on `NOTIFY_DRIVER`, cached on `globalThis` — `lib/notify/index.ts:15-24`.
- Resend driver — email only, posts to `api.resend.com/emails`, reports the provider's own rejection detail — `lib/notify/resend.ts:15-65`.
- Fake driver — records every send in memory, claims all three channels so tests can exercise the "provider carries it" path, and can be told to fail the next send — `lib/notify/fake.ts:18-45`.
- Eight templates × subject/text/html, in English and Hindi (48 dictionary keys) — `lib/notify/templates.ts:16-29`, `lib/i18n.ts:147-193` (en), `lib/i18n.ts:315-360+` (hi).
- A template's unknown placeholder is left visible as `{name}` rather than rendered blank or `undefined` — `lib/notify/templates.ts:36-38`, `lib/i18n.ts:378-383`.
- `templateKeys()` — the list `tests/unit/i18n.test.ts` walks to guarantee every template has both languages — `lib/notify/templates.ts:53-59`.

Producers — what actually queues a message

- Expiry/grace warning ladder (60/30/7/1 days before lapse, 30/60/89 days into grace) — `lib/notify/schedule.ts:28,34,52-68,76-117`.
- Lapse-to-archive ("cold") message — `lib/lifecycle.ts:76-146`.
- Deliver-the-wedding email — `app/api/admin/catalogues/[id]/deliver/route.ts:27-59`.
- WhatsApp *compose*, not a send — `components/admin/SendToCouple.tsx:1-19,85-97`.
- Handover email, direct (linked couple account) — `app/api/admin/catalogues/[id]/transfer/route.ts:101-154`.
- Handover email, on claim (a forwarded link, once accepted) — `app/api/claim/route.ts:180-215`.
- Credential link email — one function, four callers: forgot password, a studio issuing a couple's sign-in, a platform admin creating a studio or adding an operator, and a platform admin resending a link — `lib/auth/credential-links.ts:89-109`; callers at `app/api/auth/forgot/route.ts:40`, `app/api/admin/catalogues/[id]/couple/route.ts:112`, `lib/admin/platform-accounts.ts:61`, `app/api/admin/platform/operators/[id]/password-link/route.ts:27`.
- Credit request, one per studio per day — `app/api/admin/credits/request/route.ts:23-60`.
- Ops alerts, time-window deduped — `lib/notify/alert.ts:41-75`, called from `app/api/cron/reconcile/route.ts:115-121` and `app/api/cron/synthetic/route.ts:93-102`.
- Couple account closure alert — `app/api/my/close/route.ts:28-42`.

Draining and scheduling

- `/api/cron/notify` — bearer-guarded drain endpoint, deliberately absent from `vercel.json` — `app/api/cron/notify/route.ts:1-49`.
- `/api/cron/warnings` — queues the day's expiry/grace rows — `app/api/cron/warnings/route.ts:1-31`.
- `/api/cron/lifecycle` — moves catalogues down the lapse ladder and queues the archive message — `app/api/cron/lifecycle/route.ts:1-30`.
- GitHub Actions workflow: drains every 15 minutes; once a day (03:40 UTC) also calls lifecycle then warnings, in that order, before draining — `.github/workflows/notify-drain.yml:16-115`.
- `runJob()` — every cron's work goes through this, leaving a `job_runs` row whether it throws or not — `lib/jobs/run.ts:18-46`.
- Synthetic guest-path check, hourly via its own workflow, alerts ops on failure — `.github/workflows/synthetic-check.yml`, `app/api/cron/synthetic/route.ts:35-107`.

Observability of the queue itself

- Platform health page row "Resend" — pings `api.resend.com/domains` with the configured key — `lib/health/probes.ts:128-139`.
- Platform health page row "Notification queue" — warns on any failure in 24h, or on a queued row older than an hour — `lib/health/probes.ts:141-153`.
- Platform health page row "Scheduled jobs" — compares each job's last `job_runs` row against its expected cadence — `lib/health/probes.ts:165-193`, `lib/jobs/run.ts:49-56`.
- `/api/health` deliberately does **not** report `NOTIFY_DRIVER` or queue state — only `DATA_DRIVER`/`VIDEO_DRIVER` — so it stays green through a mailer outage by design; the platform health page exists because of exactly that — `app/api/health/route.ts:12-22`.

Adjacent, out of this scope's `wa.me` composer

- Guest self-share (`ShareButton`, VE-6) and the couple's own "Share on WhatsApp" from `/my` are unrelated compose-links for a guest to forward the wedding itself, not a studio-to-couple delivery message — `components/streaming/ShareButton.tsx:1-40,79`, `app/my/c/[id]/page.tsx:81-90`.

Supabase Auth's own mail (outside this queue entirely)

- Sign-up confirmation, sent by Supabase's own SMTP, gated on the dashboard's "Confirm email" setting — `lib/admin/auth-supabase.ts:72-93`.
- `createUser()` (studio- or platform-issued accounts) sets `email_confirm: true`, so no confirmation mail is ever sent for those — `lib/admin/auth-supabase.ts:106-118`.

## 4. Workflows

### W1 · Queue and drain — the loop everything else feeds

| # | Step | Where | Data written | Email sent | Failure modes |
|---|---|---|---|---|---|
| 1 | Something decides a message is due (an action or a cron) | any producer, see §3 | — | — | — |
| 2 | `enqueue()` renders the template now, in the recipient's language, and writes a row | `lib/notify/send.ts:16-49` | `notifications` (`status='queued'`) | — | A `dedupeKey` collision returns `null` rather than throwing — the caller decides whether that means "already handled" or "nothing to report." |
| 3 | `/api/cron/notify` is called with `Authorization: Bearer $CRON_SECRET` | `app/api/cron/notify/route.ts:36-48` | — | — | Vercel sends **no header at all** when `CRON_SECRET` is unset, so a forgotten variable reads as a 401 rather than an obvious misconfiguration (`:38-39`). |
| 4 | `drain()` reads up to 50 queued rows, oldest first | `lib/notify/send.ts:61-95` | — | — | — |
| 5 | Per row: skip if the active provider's `channels` does not include this row's channel | `:68-72` | — | — | Counted as `skipped`, row stays `queued` — not burned as a permanent failure. This is the entire reason a `whatsapp`/`sms` row would survive until MSG91 lands (none exist today — see §7). |
| 6 | Otherwise: `provider.send()`, then `markNotification` | `:74-88` | `notifications.status, provider, provider_id, error, attempts, sent_at` | The actual send | Resend rejects → `status='failed'`, `error` carries Resend's own detail (`lib/notify/resend.ts:47-52`); network throw → same, message from the exception. Nothing surfaces this to a guest or studio — it is visible only on the platform health page or by reading the table. |
| 7 | Sequential re-calls are safe (nothing left `queued` sends twice); **concurrent** calls are not | comment, `app/api/cron/notify/route.ts:29-34` | — | — | N-54 (paused): no `sending` status exists yet to claim a row before sending, so two overlapping callers would both see and send the same rows. GitHub Actions serialises itself with a `concurrency` group; the exposure is a second caller — a manual `workflow_dispatch` mid-run, or a Vercel Pro cron added later without deleting the workflow. |

### W2 · Expiry and grace warning ladder (scheduled, N-21)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | `/api/cron/warnings` calls `queueDueWarnings()` | `app/api/cron/warnings/route.ts:21-31` | — | — | Same bearer check as every cron route. |
| 2 | Walk every **published** catalogue; skip draft (never given to anyone) | `lib/notify/schedule.ts:81-85` | — | — | — |
| 3 | `milestoneFor(includedUntil, now)` — pure date arithmetic, rung or `null` | `:52-68` | — | — | A date `includedUntil` cannot parse → `null`, silently skipped rather than guessed at. |
| 4 | On a rung, `recipientsFor(catalogue)`: the current owner's operators always; **also** the originating studio's operators, if the current owner is a couple | `:128-162` | — | — | An org with no `getOrg` result (deleted?) returns no recipients. |
| 5 | `enqueue()` per recipient, `dedupeKey = "<template>:<catalogueId>:<day>:<role>"` | `:98-109` | `notifications` | `expiry` or `grace`, per recipient's own language | **The dedupe key does not include the operator's id, only their role** (`studio` or `couple`) — see §7 for why a studio with two or more operators only has one of them actually receive each rung. |
| 6 | A replayed day queues nothing new — the unique index on `dedupe_key` (0014) does the enforcing, not application logic | migration `0014_notification_dedupe.sql` | — | — | `result.skipped` in the job's own JSON cannot distinguish "correctly deduped" from "a second operator's row was silently dropped" — see §7. |

### W3 · Lapse to archive — the "cold" message (scheduled, N-24)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | `/api/cron/lifecycle` calls `runLifecycle()` | `app/api/cron/lifecycle/route.ts:20-30` | — | — | Same bearer check. |
| 2 | Walk every catalogue with a `publishedAt`; `nextSubStatus()` decides `grace` or `cold` from two dates, or `null` | `lib/lifecycle.ts:41-65` | — | — | Unparseable date → `null`, skipped. |
| 3 | Write the new `subStatus` | `:88` | `catalogues.sub_status` | — | — |
| 4 | `tell()` — **only** fires a message when the transition is to `cold`; a transition to `grace` sends nothing here, because the warning ladder's 30-day-into-grace rung (W2) already covers it | `:113-146` | — | — | — |
| 5 | `enqueue()` **the current owner's operators only** — `template='archived'`, `dedupeKey="archived:<catalogueId>:<operatorId>"` | `:127-141` | `notifications` | `archived`, in the recipient's language | Unlike W2, this one correctly keys by operator id, so every operator of the current owner gets their own row. **But the originating studio, who W2 explicitly kept informed through every warning rung, is not told when the wedding actually goes cold** — see §7. |
| 6 | Never reaches `deleted` — that sub-status exists in the schema and is reachable only by "an explicit, recorded request," which today is `POST /api/my/close` (W8), and that route never touches `sub_status` at all | comment, `:16-19`; `lib/schema.ts:64` | — | — | `deleted` is a defined value nothing in the codebase ever writes. |

### W4 · Deliver the wedding to the couple (operator action, N-36)

| # | Step | Where | Data written | Email / WhatsApp | Failure modes |
|---|---|---|---|---|---|
| 1 | Overview, published catalogues only: `SendToCouple`, prefilled with the linked couple's address or an outstanding transfer's | `components/admin/SendToCouple.tsx` | — | The delivery text is rendered server-side once and shown under "What it says" | — |
| 2 | "Email it" → `POST /api/admin/catalogues/:id/deliver` | `app/api/admin/catalogues/[id]/deliver/route.ts:27-59` | `notifications` (`status='queued'`, **no `dedupeKey`**) | `delivery` template, catalogue's own language, carrying the public URL, wedding date, and `branding.presentedBy` | Draft catalogue → `VALIDATION_FAILED` "Publish the wedding before sending it to the couple" (`:32-36`). Bad address → 400 from the body schema. |
| 3 | Deliberately **not** deduplicated — a studio resending because an address was wrong, or the first attempt hit spam, is a normal thing to want | comment, `:22-25` | — | — | The table records every attempt, so "did we send it, and when" stays answerable regardless. |
| 4 | Drains on the same 15-minute cycle as everything else (W1) | — | — | — | UI's "goes out within fifteen minutes" holds only while the GitHub Actions schedule is actually running — see §7. |
| 5 | "Open in WhatsApp" — a `wa.me/?text=` link built client-side from the **same** rendered `delivery` text | `SendToCouple.tsx:90` | — | Nothing — this is a compose link, not a send | Nothing is recorded; the studio must be at a device signed into WhatsApp. The product is honest about this in its own comment: "not us sending anything" (`:10-13`). |

### W5 · Hand over a catalogue (operator or couple action)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1a | **Direct** (couple account already linked): "Hand over now" → `POST { direct: true }` | `app/api/admin/catalogues/[id]/transfer/route.ts:101-154` | `catalogues.org_id` (ownership moves), `support_access_until=null` | `handover`, to **every operator** of the couple org, catalogue's language, link to `/my` | No linked account → `VALIDATION_FAILED` "Create the couple's sign-in first, or send them a link." Each `enqueue()` failure is caught and logged per-operator, never surfaced to the studio (`:142-144`). |
| 1b | **Claim link** (no linked account): `POST { email }` returns a plaintext claim URL, shown once | `:46-93` | `transfers` row (`token_hash`, 14-day expiry) | **None.** The URL is copied or forwarded by the studio itself, by design — "partner and couple are already talking, usually on WhatsApp" (comment, `:20-27`) | A second link while one is outstanding → `VALIDATION_FAILED` "A handover is already waiting…". |
| 2 | The couple opens the link → `POST /api/claim` | `app/api/claim/route.ts` (enqueue at `:194-208`) | `catalogues.org_id`, `transfers` marked claimed | **Now** the `handover` template is queued, to `transfer.toEmail`, catalogue's language | Wrapped in try/catch; a queue failure is logged and swallowed — "a mailer being down must not turn a successful claim into an error" (`:190-193`). |
| 3 | Neither path deduplicates — a direct handover can only happen once (ownership already moved), and a claim can only be redeemed once (the transfer row is gone) | — | — | — | — |

### W6 · Credential links — every "set your password" (D-33)

One function, `sendCredentialLink()`, four independent callers; none deduplicate (no `dedupeKey`).

| # | Caller | Where | Purpose | Data written | Email |
|---|---|---|---|---|---|
| 1 | Forgot password | `app/api/auth/forgot/route.ts:29-56` | `reset`, 1-hour link | `credential_links` row | `credential` template. Always answers the same sentence regardless of whether the address exists (`:51-52`); a queue failure is logged, never surfaced (`:40-43`). Per-IP (5) and per-address (3) hourly limits *silently stop sending* rather than refuse (`:22-27`). |
| 2 | Studio issues a couple's first sign-in, `delivery='link'` | `app/api/admin/catalogues/[id]/couple/route.ts:112` | `set-password`, 14-day link | `credential_links` row | Same template. Failure caught and logged, does not block the response — the couple account is still created either way. |
| 3 | Platform admin creates a studio or adds an operator | `lib/admin/platform-accounts.ts:61` (`createOperatorFor`, used by both `createStudio:66-110` and `addOperator:113-123`) | `set-password`, 14-day link | `credential_links` row | Same template. The link is also returned in the API response, so the console can hand it over even with no mailer configured (`:59-61`). |
| 4 | Platform admin resends a link | `app/api/admin/platform/operators/[id]/password-link/route.ts:27` | `set-password`, fresh 14-day link | `credential_links` row | Same template. |

All four render in **the recipient operator's own org's locale**, defaulting to English when the org cannot be found (`lib/auth/credential-links.ts:102`).

### W7 · Credit request (operator action, D-38)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | A studio with no credit left clicks "Ask for a credit" (from the publish-refusal panel) | `app/api/admin/credits/request/route.ts:23-60` | — | — | — |
| 2 | `enqueue()`, `dedupeKey="credit-request:<orgId>:<day>"` | `:37-55` | `notifications` | `credit-request`, always English, to `SUPPORT_EMAIL`; carries the studio's name/slug, the requesting operator's email, current credit balance, and a link straight to that org's platform-console page | A second (or fourth) click the same day returns `queued: null` → the route reports `repeated: true` rather than sending a second email (`:57`). |
| 3 | A platform admin grants credits from the console, out of this scope | `docs/PROGRESS.md:1836` | `credits` row | — | — |

### W8 · Ops alerts (reconcile, synthetic check, couple closes their account)

| # | Producer | Where | Trigger | `AlertKind` / recorded reason | Dedupe |
|---|---|---|---|---|---|
| 1 | Nightly reconcile | `app/api/cron/reconcile/route.ts:115-121` | `settled > 0` — a title only reconcile (not the webhook) moved to a terminal state | `transcode webhook is not arriving` | 6-hour window (default), counted against `notifications` rows of `template='ops-alert'` since `now - withinHours`, via `countNotificationsSince` — **not** the `dedupe_key` unique index (`lib/notify/alert.ts:41-56`). |
| 2 | Hourly synthetic guest-path check | `app/api/cron/synthetic/route.ts:93-102` | Any of resolve/bundle/film/playback fails | `a guest cannot play a film`, with the step and detail | Same 6-hour window mechanism. |
| 3 | Couple closes their account | `app/api/my/close/route.ts:21-49` | `POST /api/my/close` — suspends the org, does **not** touch `catalogues.sub_status` (see W3 step 6) | `a couple closed their account`, naming the operator and org | Same mechanism, but this `AlertKind` string is unique to this call site, so it never competes with reconcile/synthetic's window; the enqueue failure here is caught and logged, never blocks sign-out (`:40-42`). |
| 4 | — | `lib/notify/alert.ts:46-52` | `SUPPORT_EMAIL` unset | — | Not an alert at all — `log.warn`, `{sent:false, reason:'no-recipient'}`. Worth its own log line "because an alerting system with nowhere to send is the exact shape of the problem it was built for" (comment). |

### W9 · Supabase Auth's own mail — the one message outside this queue

| # | Step | Where | Email | Failure modes |
|---|---|---|---|---|
| 1 | Public self-registration (`POST /api/partners`) calls `auth.signUp()` | `lib/admin/auth-supabase.ts:72-93` | Supabase's **own** confirmation email, through whatever SMTP is configured on the Supabase project dashboard — not `NOTIFY_DRIVER`, not `RESEND_API_KEY` | Supabase's built-in SMTP (the default, before anyone configures their own) allows only a few messages per hour; hitting it returns `over_email_send_rate_limit`, surfaced as `RATE_LIMITED` "Sign-ups are temporarily unavailable" (`:83-88`). Any *other* Supabase error reads as "That did not work. Try a different email address" — including a bad Resend key on Supabase's side, which is exactly what happened in production on 11 September (`docs/NEXT.md:496-507`, cited in `map-studio.md` gap 9). |
| 2 | `auth.createUser()` — used for every account this product itself creates (couple sign-ins, platform-created studios/operators) | `:106-118` | **None** — `email_confirm: true` is passed explicitly, so Supabase sends nothing | — |
| 3 | Whether "Confirm email" gates sign-in at all is a Supabase dashboard toggle the app cannot read | `docs/DEPLOYMENT.md:427-431` | — | — |
| 4 | Password reset and every other credential link moved **off** Supabase's mailer entirely as of D-33/D-34 (12 September) | `docs/DEPLOYMENT.md:437-445` | Goes through W6 instead | An in-code comment in `lib/env.ts:85-87` still says Supabase's dashboard mailer "sends registration and reset" — stale since that move; see §7. |

## 5. Data model touched

| Table.column | Written by | Migration |
|---|---|---|
| `notifications.id, template, channel, address, locale, subject, body_text, body_html, org_id, catalogue_id, status, provider, provider_id, error, attempts, created_at, sent_at` | Every producer in §3/§4, via `enqueue()` / `markNotification()` | `0009_notifications.sql:11-33` |
| `notifications.dedupe_key` + unique index (partial, `where dedupe_key is not null`) | `enqueue()` when a caller passes one (W2, W3, W7); enforced by Postgres, mirrored in the memory driver for parity | `0014_notification_dedupe.sql:11-14` |
| `notifications_queued_idx` (partial, `status='queued'`) | Read by `drain()`/`listQueuedNotifications` | `0009_notifications.sql:37-38` |
| `notifications_catalogue_idx` | "What did this couple receive" queries | `0009_notifications.sql:41` |
| `catalogues.sub_status` | `lib/lifecycle.ts:88` (`runLifecycle`) | `0001_initial_schema.sql` (column), lifecycle logic added with N-24 |
| `catalogues.included_until` | Read by both `lib/notify/schedule.ts` and `lib/lifecycle.ts`; written at creation and by the platform's term-extension route (out of scope) | `0001_initial_schema.sql` |
| `credential_links.id, operator_id, token_hash, purpose, expires_at, used_at, created_at` | `lib/auth/credential-links.ts:49-68` (issue), redeemed elsewhere (out of scope) | `0017_credentials.sql` (per `map-studio.md` evidence index) |
| `job_runs.job, started_at, finished_at, ok, detail` | Every cron in §3/§4 via `runJob()`, including `notify`, `warnings`, `lifecycle`, and (adjacently) `reconcile`/`synthetic`/`usage` | `0022_job_runs.sql:6-18` |
| `orgs.locale` | Read to pick a recipient's language when the org is not the catalogue's own couple | `0013_locale.sql` (per `map-studio.md`) |

RLS is enabled on `notifications` with no anon policy — only the service-role repository reads or writes it (`0009_notifications.sql:45`).

## 6. Configuration

All read through `lib/env.ts`, the only permitted `process.env` reader.

| Variable | Effect on this subsystem |
|---|---|
| `NOTIFY_DRIVER` (`fake` \| `resend`, default `fake`) | Which `NotificationProvider` `drain()` uses. **Production is `resend`.** `fake` records a send and returns success without sending — `lib/env.ts` refuses to boot with `fake` against `DATA_DRIVER=supabase` specifically because that combination once shipped for a day (`lib/env.ts:232-253`). |
| `RESEND_API_KEY` | Required when `NOTIFY_DRIVER=resend`; boot-time refusal if missing, rather than a runtime failure the first time a warning is due (`lib/env.ts:267-276`). Also what the platform health "Resend" row pings. |
| `NOTIFY_FROM` (default `Mehfilbox <hello@mehfilbox.com>`) | The `From` header on every email this queue sends. A couple can reply to it, so it must be a real inbox (comment, `lib/env.ts:102`). Independent of whatever address Supabase's own SMTP (W9) sends confirmation mail from — nothing keeps the two in sync (see §7). |
| `SUPPORT_EMAIL` | Recipient of every `ops-alert` and `credit-request`. Must be an address that can *receive* — a placeholder domain here means W8's alerts go nowhere, "which is how it sat for a day" (`docs/DEPLOYMENT.md:216`). |
| `CRON_SECRET` (falls back to `SESSION_SECRET` if unset) | Bearer every `/api/cron/*` route checks in production. Vercel sends **no** `Authorization` header at all when this is unset on its side, so a forgotten variable manifests as jobs that silently never run rather than an error (comment repeated in every cron route). |
| `DEMO_CATALOGUE_SLUG` | Which catalogue `/api/cron/synthetic` walks; wrong or unset here makes the synthetic check (and its ops-alerting) meaningless against production. |
| `RECONCILE_STALL_MINUTES` (default 120) | How long a title sits non-terminal before reconcile polls Bunny — directly gates when W8's "webhook is not arriving" alert can fire at all. |
| `VERCEL_GIT_COMMIT_SHA` | Stamped into every `ops-alert` as the deploy marker — "the first question of every investigation" (comment, `lib/notify/alert.ts:66-68`). |
| `ROOT_DOMAIN` | Builds every URL embedded in a message: the public wedding link, `/set-password/<token>`, `/claim/<token>`, the credit-request's link to the platform console. |
| `AUTH_DRIVER` (`local` \| `supabase`) | Only affects **W9** — whether Supabase Auth (and therefore its own confirmation mailer) is in the loop at all; irrelevant to this queue otherwise. |
| Supabase dashboard (not env): SMTP settings, "Confirm email", Site URL | Whether W9's confirmation email is delivered, and where its link lands. Entirely outside this codebase — `docs/DEPLOYMENT.md:410-434`. |
| `vercel.json` crons | Does **not** include `/api/cron/notify` or `/api/cron/warnings` — Vercel's Hobby plan allows two daily cron jobs and `reconcile`+`usage` (out of this scope) hold both. |
| GitHub Actions schedule (`notify-drain.yml`, `synthetic-check.yml`) | The actual schedule for draining, queuing warnings/lifecycle, and the synthetic check, until the Vercel account moves to Pro. **A public repository's schedules are disabled after 60 days with no commits** (comment in both workflow files). |

## 7. Gaps and rough edges

Missing or half-built

1. **WhatsApp does not send.** N-36 shipped the email and a `wa.me` compose link (W4 step 5); the real thing needs an `msg91` driver behind `NotificationProvider`, blocked on a ₹500/month subscription and Meta template approval, not on code — `docs/NEXT.md:319-327` (N-36c). `drain()` already skips a `whatsapp` row cleanly (W1 step 5), but **nothing in the codebase ever constructs one** — every `enqueue()` call in the repository passes `channel: 'email'` (confirmed by grep; zero hits for `channel: 'whatsapp'` or `channel: 'sms'`). The channel-skip logic is future-proofing for code that does not exist yet.
2. **SMS does not exist at all**, beyond the type. `Channel` includes `'sms'`, the `notifications.channel` CHECK constraint allows it, `FakeNotificationProvider.channels` claims it — and no template, no route, no UI ever produces one. Same D-12/MSG91 dependency as WhatsApp.
3. **In-app notifications do not exist.** `notifications` is a queue-and-audit table read by nobody's UI — not the studio console, not `/my`. There is no bell, inbox, or unread count anywhere in `components/` or `app/`; a grep for `NotificationBell`/`NotificationInbox`/"in-app notification" finds nothing. A couple or studio only ever learns something happened by reading the email (or, for delivery, the `wa.me` message a human sent).
4. **A studio with two or more operators does not all receive the expiry/grace ladder.** `recipientsFor()` (`lib/notify/schedule.ts:128-162`) maps every operator of an org to a `Recipient`, but `queueDueWarnings()`'s `dedupeKey` is `"<template>:<catalogueId>:<day>:<role>"` — keyed by **role** (`studio`/`couple`), not by operator id (`:108`). The first operator processed for a role claims that milestone's unique key; every other operator with the same role at the same rung collides on the `0014` unique index and is silently dropped, forever, for that milestone. This is reachable today: a platform admin can add a second operator to any studio (`lib/admin/platform-accounts.ts:113-123`), and nothing about the resulting console distinguishes "sent to everyone" from "sent to whoever went first." Contrast `lib/lifecycle.ts`'s `archived` message, which correctly keys by `operatorId` (`:139`) and does not have this problem.
5. **The studio is not told when a wedding it delivered actually goes cold.** N-21's own warning ladder deliberately keeps the *originating* studio informed even after handover — "a studio that hears nothing about a wedding lapsing cannot sell the renewal" (`lib/notify/schedule.ts:142-146`) — through every 60/30/7/1-day and 30/60-day-into-grace rung. But `lib/lifecycle.ts`'s `tell()` (the `archived` message, fired once, at the actual moment streaming stops) enqueues only to the **current** owner's operators (`:127-141`), which by then is the couple. The studio's last signal is the 89-day-into-grace warning; nothing ever confirms the transition actually happened, on the one message the product's own comment calls "the moment a couple will notice."
6. **The 300 GB delivery alert doesn't alert anyone.** `docs/PRICING.md` and the code's own comment frame it as something to know about (`app/api/cron/usage/route.ts:82-93`: "worth an email... worth knowing"), but `rollUp()` only does `log.warn('usage.delivery_alert', …)` — it never calls `alertOps()` or `enqueue()`. Given N-53b's still-open item ("logs that survive the invocation" — Vercel's log retention is brief and unqueryable, `docs/NEXT.md:262-273`), this alert is, in practice, unobserved in production today.
7. **N-54 is paused, not fixed.** `drain()` reads, sends, then marks — a `sending` intermediate status (to claim a row before sending) needs a migration, since `0009`'s CHECK constraint only allows `queued`/`sent`/`failed`, plus a way to un-stick a row a crashed drain left mid-send. Explicitly scheduled for "before the Vercel Pro move," when a second scheduler (Vercel's own cron) would otherwise coexist with the GitHub Actions one — `docs/NEXT.md:278-294`.
8. **GitHub Actions is a soft dependency for a hard requirement.** All of drain, lifecycle, warnings, and the synthetic check ride on a public repo's scheduled workflows, which GitHub disables after 60 days with no commits (both workflow files say so explicitly). A quiet repository — plausible for a small studio-facing product between building sessions — silently stops sending every queued email and stops catching guest-path failures until someone commits or manually re-enables the schedule from the Actions tab.
9. **Three different dedupe strategies, easy to conflate.** Expiry/grace and credit-request use the database-level unique `dedupe_key` (0014); ops-alerts use a time-window `count` against recent rows (`lib/notify/alert.ts:54-56`); delivery, handover and credential links use none at all, by deliberate choice in each case. None of this is wrong, but nothing states it in one place — a future change that "just adds a dedupeKey" to delivery, say, would silently break the documented "let a studio resend" behaviour (W4 step 3).
10. **The claim-link handover never emails**, by design — only the *direct* handover (already-linked couple account) auto-sends the `handover` template. This is the same fact `map-studio.md` §7 gap 23 already flags against `docs/spec/16-platform-v2.md:158-159`'s claim that "the claim link is also emailed" — restated here because it belongs to this subsystem specifically.
11. **`deleted` is unreachable.** The `sub_status` enum defines it (`lib/schema.ts:64`), and `lib/lifecycle.ts`'s own comment says it exists "only for an explicit, recorded request from the couple," but no route in the codebase ever writes it — including `POST /api/my/close`, the closest thing to that request, which suspends the org and raises an `ops-alert` without touching `catalogues.sub_status` at all.
12. **A stale in-code comment.** `lib/env.ts:85-87` still says the Supabase dashboard mailer "sends registration and reset" — true before D-33/D-34 (12 September), false since: reset now goes through this queue's `credential` template exactly like every other credential link (W6, W9 step 4). Nothing depends on the comment being right, but a reader trusting it would misconfigure Supabase's SMTP expecting it to carry traffic it no longer carries.

Docs that the code does not match

13. **`docs/PRODUCT.md` describes this subsystem as not built.** Row "Notifications *(new, 6 Sept 2026)*" (§2, `:145`) says "**Missing**... **This one blocks the most.**"; "Delivery message *(new)*" (§1.2, `:100`) says "**Missing**... Today the operator copies the link and writes their own"; "Told they now own it" (§1.3, `:115`) says "**Missing**... No migration email." All three describe a pre-N-50/N-36/N-21 state. Per `docs/PROGRESS.md`, N-50 (the notification seam) landed 7 September, and N-36 (delivery) and N-21 (the warning ladder, which became the handover email too — `docs/PROGRESS.md:943`) landed 8 September — all before this file's own "Last reviewed: 14 August 2026 — Extended 6 September 2026" stamp even closes (`docs/PRODUCT.md:16-19`). §8 (12 September) and §9 (13 September) add rows elsewhere in the same file but never revisit these three; a reader of `docs/PRODUCT.md` alone would not know this subsystem exists.
14. Related: "Email — auth" (`docs/PRODUCT.md:144`) — "Supabase Auth sends registration confirmation **and password reset**" — is stale in the same direction as gap 12 above: password reset moved off Supabase's mailer on 12 September (D-33/D-34), and this row was never updated to say so.

## 8. Evidence index

Queue, templates, provider seam
- `lib/notify/send.ts:1-49` enqueue; `:51-95` drain and `DrainResult`.
- `lib/notify/provider.ts:16-17` channels; `:26-34` `Recipient`; `:36-42` `SendResult`; `:44-62` `NotificationProvider`.
- `lib/notify/index.ts:1-27` driver switch, cached on `globalThis`.
- `lib/notify/fake.ts:1-45`; `lib/notify/resend.ts:1-65`.
- `lib/notify/templates.ts:16-29` `TEMPLATES`; `:40-50` `render`; `:53-59` `templateKeys`.
- `lib/i18n.ts:147-193` (English notify.\*); `:315-360+` (Hindi notify.\*); `:378-383` `translate`; `:395` `resolveLocalised`.
- `lib/schema.ts:631-659` `notificationSchema`.
- `lib/db/repository.ts:121,142,145,295-312` interface methods (`countNotificationsSince`, `recordJobRun`, `notificationQueueStats`, `enqueueNotification`, `listQueuedNotifications`, `markNotification`).
- `lib/db/supabase-repository.ts:1030,685-702,715,1534-1576` driver implementation.
- `lib/db/memory-repository.ts:231,305,323,843-878` driver implementation, including the in-memory `dedupeKey` mirror at `:846-849`.

Cron routes and scheduling
- `app/api/cron/notify/route.ts:1-49`; `app/api/cron/warnings/route.ts:1-31`; `app/api/cron/lifecycle/route.ts:1-30`.
- `app/api/cron/reconcile/route.ts:1-124`, alert at `:115-121`.
- `app/api/cron/synthetic/route.ts:1-107`, `walk()` at `:52-91`, alert at `:93-102`.
- `app/api/cron/usage/route.ts:1-103`, `DELIVERY_ALERT_GB` at `:27`, log-only alert at `:82-93` (no `enqueue`/`alertOps` call — confirmed by full read).
- `lib/jobs/run.ts:1-56`.
- `vercel.json:8-15` (crons list — `notify`/`warnings`/`lifecycle` absent).
- `.github/workflows/notify-drain.yml:1-115`; `.github/workflows/synthetic-check.yml:1-54`.
- `supabase/migrations/0009_notifications.sql:1-45`; `0014_notification_dedupe.sql:1-14`; `0022_job_runs.sql:6-18`.

Producers
- `lib/notify/schedule.ts:1-163` in full — ladder constants `:28,34`; `milestoneFor:52-68`; `queueDueWarnings:76-117`; `recipientsFor:119-162`.
- `lib/lifecycle.ts:1-149` in full — `nextSubStatus:41-65`; `runLifecycle:76-107`; `tell:113-146`.
- `app/api/admin/catalogues/[id]/deliver/route.ts:1-59`.
- `components/admin/SendToCouple.tsx:1-40,85-97`.
- `app/api/admin/catalogues/[id]/transfer/route.ts:1-172` in full — claim-link issue `:46-94`; `handOverNow:101-154`.
- `app/api/claim/route.ts:160-215` (handover enqueue on claim).
- `lib/auth/credential-links.ts:1-109` in full.
- `app/api/auth/forgot/route.ts:1-57`.
- `app/api/admin/catalogues/[id]/couple/route.ts:1-40,109-116` (call site at `:112`).
- `lib/admin/platform-accounts.ts:1-124` in full — `createOperatorFor:27-63`, call at `:61`; `createStudio:66-110`; `addOperator:113-123`.
- `app/api/admin/platform/operators/route.ts:1-38`.
- `app/api/admin/platform/operators/[id]/password-link/route.ts:2,27` (call site).
- `app/api/admin/credits/request/route.ts:1-61`.
- `lib/notify/alert.ts:1-76` in full.
- `app/api/my/close/route.ts:1-51`.

Supabase's own mail, and configuration
- `lib/admin/auth-supabase.ts:60-125` — `signIn`, `signUp:72-93`, `admin():100-104`, `createUser:106-118`, `setPassword:120-125`.
- `docs/DEPLOYMENT.md:190-240` (env var table); `:410-434` (§12, SMTP); `:437-449` (§13, credential links superseding Supabase's own reset mail).
- `lib/env.ts:35-46` (`ROOT_DOMAIN`, `SUPPORT_EMAIL`); `:71-92` (`SESSION_SECRET`/`CRON_SECRET` comments, stale W9 comment at `:85-87`); `:99-103` (`DEMO_CATALOGUE_SLUG`, `NOTIFY_DRIVER`, `NOTIFY_FROM`); `:118` (`CRON_SECRET`); `:145` (`RECONCILE_STALL_MINUTES`); `:161-175` (`AUTH_DRIVER`, `CAPTCHA_DRIVER`); `:180` (`VERCEL_GIT_COMMIT_SHA`); `:232-253` (fake-driver-against-supabase refusal); `:267-276` (`RESEND_API_KEY` required-with-resend refusal).
- `lib/health/probes.ts:128-193` (`probeMailer`, `probeQueue`, `probePipeline`, `probeJobs`).
- `app/admin/platform/health/page.tsx:1-92`; `app/api/health/route.ts:1-23`.

Docs consulted
- `docs/PRODUCT.md:1-27` (status legend, review dates), `:85-148` (§1.2/§1.3/§2, the stale rows), `:262-313` (§8/§9, confirming those rows are never revisited).
- `docs/NEXT.md:260-330` (N-53b, N-54, N-36c).
- `docs/PROGRESS.md:960-1001` (N-50), `1177-1232` (N-53), `1327-1420` (N-21), `1420-1443` (N-36), `1588-1616` (N-24), `1836` (credit-request).
- `docs/PRICING.md:144-183` (§2, "Nothing is deleted. It goes cold instead.", the warning-ladder spec).
- `map-studio.md` §3/§4/§7 (W10–W12), consulted for the delivery/handover/credit-request evidence that subsystem already gathered from the studio side, and for gap 23 (claim link never emailed) restated here as gap 10.

Tests that exercise this subsystem (for coverage, not evidence of behaviour)
- Unit: `tests/unit/notify.test.ts`, `warning-schedule.test.ts`, `lifecycle.test.ts`, `alerting.test.ts`, `credential-links.test.ts`, `delivery-message.test.ts`, `transfer.test.ts`, `i18n.test.ts`.
- E2E: `e2e/admin.spec.ts`, `couple.spec.ts`, `path-mode.spec.ts` exercise the handover **UI flow** (claim-link creation, one-outstanding-link refusal) against the fake driver; none assert on rendered email content, and none exercise the multi-operator dedupe-collision path in gap 4 — that finding comes from reading `schedule.ts` and `0014` directly, not from a failing test.
