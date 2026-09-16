# Subsystem map — `commerce` (entitlements, credits, the lapse ladder)

Mapped 16 September 2026 against the code on `main` (HEAD `96fb305`). Where a document and the
code disagree, the code is what is described below and the disagreement is listed in §7.

---

## 1. Summary

Commerce is the part of Mehfilbox that decides how much a catalogue may hold, whether it may go
live, and what happens when its paid term runs out — while not yet being able to take anyone's
money for any of it. Three primitives carry the whole subsystem: an **entitlement** (a per-org or
per-catalogue override of the 20 GB storage default, resolved catalogue-over-org-over-default,
`lib/entitlements.ts`), a **credit** (a token good for exactly one catalogue's first publish,
granted at registration or by a platform admin, expiring 24 months after purchase, `credits`
table), and the catalogue's own **`subStatus`** (`included → active → grace → cold` on a fixed
date ladder, never automatically `deleted`, `lib/lifecycle.ts`). A studio operator meets it as a
storage bar and an 80%-full warning while uploading, and as a 402 "this wedding needs a credit"
panel when Publish is clicked with none left. A platform admin meets it as three consoles — grant
credits, set a quota, extend a term — each write recorded to an audit trail. A couple/client meets
it only as a renewal screen with a `mailto:` link if their wedding lapses. Razorpay
(`docs/NEXT.md` N-20) is the piece that is supposed to make all of this self-service, and it is
entirely undone: there is no payment code, no webhook, no invoice table, and not one
Razorpay-related environment variable anywhere in the repository. Every rupee that has moved so
far is a platform admin typing a free-text reason into an audit row after money changed hands
somewhere else — a bank transfer, cash, UPI outside the product.

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Studio operator** (org `kind = 'partner'`) | `requireOperator()` (`lib/admin/session.ts:53-66`) | Own storage usage and 80% warning; the publish credit gate and `CreditPanel`; `GET /api/admin/credits`; "Ask for a credit". Never sees another org's numbers. |
| **Client/couple operator** (org `kind = 'couple'`) | Same session shape, `getEditableCatalogue`/`requireEditableCatalogue` (`lib/admin/session.ts:100-120`) | Same publish gate on a catalogue they started themselves (`/my`, N-73); starts with **zero** credits — `CreditPanel audience="couple"` copy differs (`components/admin/CreditPanel.tsx:38-43`). |
| **Studio inside a support window** (`via: 'support'`) | `getEditableCatalogue` (`lib/admin/session.ts:100-112`) | May still publish a handed-over wedding (and so may still spend a credit on the **originating** org, `catalogue.orgId`) but cannot see or change quota/credits screens, which live under `/admin/studio` and `/admin/credits`, not the catalogue. |
| **Platform admin** (`platform_admins` row, no `operators` row) | `requirePlatformAdmin()` (`lib/admin/platform.ts:28-45`) | Grants credits, sets/clears a storage quota, extends a term, suspends/restores a studio, takes one catalogue offline, creates a studio with opening credits — every write goes through `recordPlatformAction` (`lib/admin/platform.ts:56-74`). |
| **Guest** | Not an actor with agency here | The object of the lapse ladder: `resolveAccess` (`lib/catalogue-access.ts:30-64`) decides whether they see the wedding, the `/renew` screen, or nothing. Never sees a price. |
| **Scheduled jobs** (Vercel Cron, no human present) | `runJob` wrapper (`lib/jobs/run.ts:18-29`), bearer-authed on `CRON_SECRET` | `lifecycle` moves the ladder daily; `warnings` queues expiry/grace emails daily; `usage` rolls up storage/delivery daily; `reconcile` is **not** commerce — it settles stuck video transcodes (see §7, correction 1). |
| **Razorpay** | Named throughout `docs/PRICING.md`, `docs/NEXT.md` N-20, doc 15 §4 | Zero lines of code, zero env vars (`lib/env.ts`, grepped). A paper actor: the thing every "until Razorpay lands" sentence in the UI is waiting for. |

## 3. Capabilities

Entitlements and the storage quota

- Resolve the effective limit per field, catalogue-entitlement then org-entitlement then a `20` GB
  default — `lib/entitlements.ts:29-31,70-88` (`resolveLimits`).
- Compute whether one more upload fits (a title with no reported size counts as zero) —
  `lib/entitlements.ts:105-116` (`storageCheck`).
- Compute usage level `ok`/`warn` (≥80%)/`full` (≥100%) and roughly how many hours of 720p/1080p
  footage the plan holds — `lib/entitlements.ts:131-164` (`hoursFor`, `storageUsage`).
- Refuse a film upload (`app/api/admin/uploads/route.ts:51-79`) or a photograph upload, the latter
  counting **every rendition** (`app/api/admin/catalogues/[id]/photos/route.ts:139-156`), whose
  size would exceed the resolved limit, before a byte moves.
- Sum a catalogue's real stored bytes (titles + every photo rendition) for both checks —
  `lib/db/memory-repository.ts:611-623`, `lib/db/supabase-repository.ts:1259-1274`.
- Show the operator usage vs. plan, an hours-of-film hint, and an 80% warning quoting
  ₹25/GB/month — `app/admin/c/[id]/page.tsx:39-65,126-163`.
- Platform admin sets or clears a studio's storage override with a reason on the audit trail;
  clearing **removes the row** rather than zeroing it, so "back to default" tracks a moving
  default — `app/api/admin/platform/orgs/[id]/quota/route.ts:31-64`,
  `components/admin/OrgQuotaControl.tsx`.
- A `catalogue`-level entitlement is fully read and would out-rank the org's, but **nothing in the
  product ever writes one** — every entitlement write targets `org_id` only (§7).
- A query error reading `entitlements` is swallowed as "no grant" rather than thrown, erring
  toward the free tier — `lib/db/supabase-repository.ts:1210-1241`.

Credits and the publish gate

- Registration grants a new studio one credit, 24-month expiry — `lib/admin/credits.ts:43-52`,
  called from `app/api/partners/route.ts:134`.
- A studio the platform creates can start with opening credits in the same recorded action —
  `lib/admin/platform-accounts.ts:98-106`.
- A catalogue's **first** publish consumes the soonest-to-expire eligible credit of its own org; a
  republish, or a wedding published before credits existed, spends nothing —
  `app/api/admin/catalogues/[id]/publish/route.ts:26-41`.
- On Supabase the spend is pick-then-guarded-claim (three attempts against `consumed_at is null`)
  so two publishes racing for the last credit cannot both win it —
  `lib/db/supabase-repository.ts:788-813`.
- One `balanceOf` function, shared by both drivers, computes available/consumed/expired so they
  cannot disagree — `lib/db/memory-repository.ts:39-49`.
- Operator reads their balance (`GET /api/admin/credits`) and sees "N credits to publish with" on
  the console — `app/api/admin/credits/route.ts:9-18`, `app/admin/page.tsx:100-104`.
- Publish with none left refuses `CREDIT_REQUIRED` (402); the customizer shows a panel naming the
  price (₹1,999, or five for ₹7,999) and "Ask for a credit" —
  `components/admin/CustomizerShell.tsx:284-296,497`, `components/admin/CreditPanel.tsx`.
- "Ask for a credit" emails `SUPPORT_EMAIL` once per studio per day, naming the studio, wedding,
  operator and balance — `app/api/admin/credits/request/route.ts:23-59`.
- Platform admin grants credits — additive only, a required reason, an audit row, reflected in the
  studios list's own "Credits" column — `app/api/admin/platform/orgs/[id]/credits/route.ts:24-48`,
  `app/admin/platform/studios/page.tsx:10,27,71-96`.

The lapse ladder and renewal

- Move `included`/`active` → `grace` the day after the term ends, `grace` → `cold` after
  `GRACE_DAYS = 90`; every other state, including `deleted`, is terminal and reachable only by an
  explicit action elsewhere — `lib/lifecycle.ts:23,39-65`.
- Run that transition over every published catalogue daily, logging and emailing each move into
  `cold` (grace is covered by the warning ladder below) — `lib/lifecycle.ts:76-139`, cron wrapper
  `app/api/cron/lifecycle/route.ts:20-29` (job `lifecycle`, labelled **"Lapse ladder"** in
  `lib/jobs/run.ts:54`).
- Queue expiry warnings at 60/30/7/1 days before the term ends and grace warnings at 30/60/89 days
  in, to studio and couple, deduplicated — `lib/notify/schedule.ts:27-30,53-67,76-114`, cron
  wrapper `app/api/cron/warnings/route.ts:21-29`.
- Authorise every guest request against subscription state **before** publish state, so a lapsed
  catalogue always reads as "renew", never "gone" — `lib/catalogue-access.ts:30-64`
  (`SERVING_SUB_STATUSES`, `lib/schema.ts:64-68`).
- Show the guest a renewal screen — titles list, a `mailto:SUPPORT_EMAIL` button, "download
  everything" — with no online payment on it anywhere — `app/c/[slug]/renew/page.tsx`.
- Surface renewal urgency to the operator ahead of housekeeping: "Subscription lapsed", "Renewal
  due" (grace), "Lapses in N days" (≤30 out), "Renews in N days" (≤60 out) —
  `lib/admin/catalogue-health.ts:36-103`.
- The studio's own settings screen shows "Serving until" **read-only** — an operator-editable
  field until D-39 moved it to the platform, because it made a renewal free —
  `components/admin/CatalogueSettings.tsx:224-234`.
- Platform admin manually "renews" a catalogue — the only mechanism that writes `includedUntil`
  today; a future date on a non-serving catalogue also sets `subStatus='active'` immediately
  rather than waiting for the next cron — `app/api/admin/platform/catalogues/[id]/term/route.ts:27-62`.
- Platform admin takes one catalogue offline/online for **abuse**, distinct from a billing action;
  putting one back spends no credit and republishes the last-published content —
  `app/api/admin/platform/catalogues/[id]/offline/route.ts:25-54`.
- Platform's cross-org catalogues list is sorted soonest-to-lapse-first — its own renewal-season
  worklist — `app/admin/platform/catalogues/page.tsx:37-38,104`.

Platform console writes and the audit trail

- Suspend or restore a whole studio account, for non-payment or abuse (W11) —
  `app/api/admin/platform/orgs/[id]/status/route.ts:31-62`.
- Every platform commerce write here — credit grant, quota, term, offline/online, suspend,
  studio create — lands on one `platform_audit` row, and a non-admin gets `NOT_FOUND` rather than
  `FORBIDDEN` so probing confirms nothing — `lib/admin/platform.ts:22-26,40-45,56-74`.

Usage measurement

- Nightly per-catalogue rollup of stored GB (real) and delivered GB (derived, §7) —
  `app/api/cron/usage/route.ts:44-99`, `lib/db/repository.ts:385-397`.
- Log (not email) any catalogue delivering ≥300 GB in a month — `app/api/cron/usage/route.ts:27,82-94`.
- Every cron here records a `job_runs` row the platform health page reads — `lib/jobs/run.ts:18-56`.

## 4. Workflows

### W1 · A studio registers and receives the trial credit

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | `POST /api/partners` with business/contact/email/password | `app/api/partners/route.ts:54-96` | `auth.users`, `orgs` (`kind='partner', status='active'`), `operators` | Supabase's own confirmation mail (not this subsystem's queue) | Rate-limited at 3/IP/hour → 429; existing/refused email → 400 "That did not work"; `AUTH_DRIVER=local` on Supabase data → 500 with a DEPLOYMENT hint the operator never sees. |
| 2 | Grant the trial credit | `grantRegistrationCredit` (`lib/admin/credits.ts:43-52`), called at `partners/route.ts:134` — **after** the operator exists, so a rolled-back registration never strands a credit | `credits`: `planId='deliver', grantedBy='registration', reason='Your first wedding is on us.', purchasedAt=now, expiresAt=+24mo` | — | If org creation succeeded but the operator insert failed, the org is deleted first (`:123-129`) and no credit is ever granted. |
| 3 | Sign in, land on `/admin` | — | — | — | Console shows "1 credit to publish with." (`app/admin/page.tsx:100-104`). |

### W2 · Publish a wedding (the credit gate)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Click Publish in the customizer | `components/admin/CustomizerShell.tsx:240-296` | — | — | — |
| 2 | Flush the draft modules and branding first, so Publish can never ship a stale draft | `:246-269` | `catalogues.draft_modules`, `catalogues.draft_branding` | — | Either save refused → "Your changes could not be saved, so nothing was published." (a suspended studio's write returns 403 here.) |
| 3 | `POST /api/admin/catalogues/:id/publish` — credit check only when `publishedAt IS NULL` | `app/api/admin/catalogues/[id]/publish/route.ts:26-41` | `credits.consumed_by_catalogue_id, consumed_at` on the soonest-to-expire eligible credit of `catalogue.orgId` | — | No eligible credit → **402 `CREDIT_REQUIRED`**, "Publishing this wedding needs a credit, and there is none left to spend." |
| 4 | Refused publish shows the credit panel | `CustomizerShell.tsx:291-296,497` → `components/admin/CreditPanel.tsx` | — | — | Panel names the price and offers "Ask for a credit" (→ W3). Catalogue stays `draft`; nothing is lost. |
| 5 | On success: promote `draft_modules → modules`, `draft_branding → branding`, set `status='published'`, `publishedAt` (first time only), carry pending titles/photos live, revalidate the guest cache | `publish/route.ts:43-78` | `catalogues.modules, branding, status, published_at, draft_modules=null, draft_branding=null`; `titles.live_at`; `photos.live_at` | — | — |
| 6 | Unpublish ("Take offline" in Settings) | `DELETE …/publish` (`publish/route.ts:83-91`), `components/admin/CatalogueSettings.tsx:61-66` | `catalogues.status='draft'` (`published_at` kept) | — | Guests see "not yet available", never a 404. A **republish after this spends no second credit** — `publishedAt` is already set. |

### W3 · Out of credits: ask, and the platform grants

1. Operator clicks "Ask for a credit" on the refused-publish panel —
   `components/admin/CreditPanel.tsx:15-29`.
2. `POST /api/admin/credits/request` — looks up the org and (optionally) the catalogue, computes
   the current balance, and queues one email to `SUPPORT_EMAIL` with a `dedupeKey` of
   `credit-request:<org>:<day>` — `app/api/admin/credits/request/route.ts:23-58`. **Data written:**
   one `notifications` row (`template='credit-request'`). **Email:** to us, naming the studio,
   slug, couple, operator, and available/consumed counts. **Failure mode seen by the operator:**
   none — a second click the same day returns "Already asked today" rather than a second email
   (`queued === null`); a network failure shows "That did not send. Try again in a moment."
3. A platform admin opens `/admin/platform/orgs/<id>`, sees the balance
   (`app/admin/platform/orgs/[id]/page.tsx:41-46,78`), and grants a count with a required reason —
   `components/admin/OrgCreditsControl.tsx:29-51`.
4. `POST /api/admin/platform/orgs/:id/credits` — **data written:** `credits` rows
   (`grantedBy=<admin email>`), `platform_audit` (`action='credits.grant'`, `detail={count,
   reason}`) — `app/api/admin/platform/orgs/[id]/credits/route.ts:24-48`. **Failure modes:** a
   non-admin gets 404, not 403 (`requirePlatformAdmin`); `count` outside 1–50 or an empty reason →
   400.
5. The studio's next Publish attempt on the same wedding succeeds with no other action —
   verified end to end in `tests/unit/credits.test.ts:136-152`.

### W4 · Upload against the storage quota (films and photographs)

1. Operator drops a file in the Upload Manager (films) or Photo Manager (photographs).
2. Server resolves the effective limit — catalogue entitlement, then org entitlement, then the
   `20` GB default — and sums real stored bytes across every title and every photo rendition —
   `lib/entitlements.ts:70-88`, `app/api/admin/uploads/route.ts:51-56`,
   `app/api/admin/catalogues/[id]/photos/route.ts:139-146`.
3. **Films:** declared size pushes the total over the limit → 400 `VALIDATION_FAILED`, "This
   catalogue holds N GB and M GB is already used. Add storage, or remove a film first."
   (`uploads/route.ts:72-79`). Otherwise a `titles` row is created at `status='uploading'` with the
   declared `size_bytes` and a tus upload ticket is returned.
4. **Photographs:** the same check, but over **all three renditions** of the incoming file → 413
   `UPLOAD_LIMIT`, "This catalogue holds N GB and M GB is already used. Add storage, or remove
   something first." (`photos/route.ts:150-156`). Otherwise a `photos` row is written with
   `size_bytes` summed across renditions.
5. **Data written on success:** `titles.size_bytes` (declared, corrected later by the transcode
   webhook or `cron/reconcile`) or `photos.size_bytes` (all renditions). **No email** in this
   workflow. **Failure the operator sees either way:** a plain-language refusal naming the plan's
   GB, what is already used, and "Add storage, or remove \[a film / something] first" — with no
   in-product way to actually add storage (see §7).
6. The overview page shows the resulting usage against the plan, with an 80%-used warning banner
   quoting ₹25/GB/month — `app/admin/c/[id]/page.tsx:126-163`.

### W5 · Platform admin changes a studio's storage quota

1. `/admin/platform/orgs/<id>` → `components/admin/OrgQuotaControl.tsx:14-54` — a GB value and an
   optional reason, or "Back to default".
2. `POST /api/admin/platform/orgs/:id/quota` — **data written:** `entitlements` row upserted
   (`org_id`, `storage_gb`) or **deleted** if the value is `null`, plus a `platform_audit` row
   recording `from`/`to` (the default is written explicitly even when the org was already on it) —
   `app/api/admin/platform/orgs/[id]/quota/route.ts:31-63`.
3. **Failure modes:** non-positive or >10,000 GB → 400; non-admin → 404. No confirmation step —
   the docstring calls a mistyped quota "corrected here in five seconds", unlike suspension.
4. **Effect proven by a test that removes it:** a 50 GB catalogue that fits under a 100 GB override
   and would not fit under the 20 GB default (`docs/PROGRESS.md:1503-1527`, N-27b).

### W6 · Platform creates a studio with opening credits

1. `/admin/platform/studios` → "Create a studio": name, contact email/name, locale, an opening
   credit count (0–50), a reason.
2. `POST /api/admin/platform/orgs` — creates the credential (an unknown password, a set-password
   link mailed to the contact), the org, the operator, and — if `credits > 0` — the opening grant,
   all in `createStudio` — `app/api/admin/platform/orgs/route.ts:28-48`,
   `lib/admin/platform-accounts.ts:65-106`. **Data written:** `orgs`, `operators`, `credits[]`,
   `platform_audit` (`action='org.create'`, `detail={email, credits, reason}`). **Email:** a
   set-password credential link to the new operator.
3. **Failure modes:** the contact email already has an account → 400 field error; anything after
   the credential succeeds is compensated the same way self-registration is (the org step has no
   surrounding transaction).

### W7 · The lapse ladder moves a catalogue — automatic, daily

1. `GET /api/cron/lifecycle`, bearer-authed on `CRON_SECRET` (falls back to `SESSION_SECRET`;
   Vercel sends no header at all if the variable is unset, which is why a forgotten secret shows up
   as a job that silently never runs) — `app/api/cron/lifecycle/route.ts:20-29`.
2. For every **published** catalogue, compute `nextSubStatus`: `included`/`active` → `grace` the
   day after `includedUntil`; `grace` → `cold` after 90 more days — `lib/lifecycle.ts:39-65`.
3. **Data written:** `catalogues.sub_status`. **Email:** only on the move into `cold` — the
   `archived` template, to every operator of the owning org, `dedupeKey='archived:<catalogueId>:<operatorId>'`
   (`lib/lifecycle.ts:107-139`). The move into `grace` sends nothing here (it is covered by W8).
4. **What a guest sees once `cold`:** `resolveAccess` returns `lapsed` and they land on
   `/renew` (`lib/catalogue-access.ts:38-40`), never a 404.
5. **What never happens:** nothing in this job, or anywhere else, moves a catalogue to `deleted`;
   a state-enumeration test exists specifically to prove it (`docs/PROGRESS.md:1588-1618`).
6. **Job bookkeeping failure mode:** if `recordJobRun` itself fails, the ladder still ran — only
   the platform health page's "last run" goes stale (`lib/jobs/run.ts:31-46`).

### W8 · The expiry/grace warning ladder — automatic, daily

1. `GET /api/cron/warnings`, same auth pattern — `app/api/cron/warnings/route.ts:21-29`.
2. For every published catalogue, check today against `BEFORE_EXPIRY = [60,30,7,1]` days before
   `includedUntil`, or `INTO_GRACE = [30,60,89]` days after — `lib/notify/schedule.ts:27-30,53-67`.
3. **Data written:** one `notifications` row per recipient (studio operators, and the couple where
   linked) with a `dedupeKey` of `<template>:<catalogueId>:<day>:<role>`, so a hard-run cron never
   repeats a milestone — `lib/notify/schedule.ts:76-114`. **Email templates:** `expiry` or `grace`.
4. **Channel, in practice: email only.** `Notification.channel` accepts `email`/`whatsapp`/`sms`
   (`lib/schema.ts:634`), and `PRICING.md` §2 promises all three — but every call site in this
   subsystem hardcodes `channel: 'email'`, and no WhatsApp/SMS driver exists behind
   `NOTIFY_DRIVER` (`fake`/`resend` only, `lib/env.ts:100-101`). See §7.
5. **Failure mode a recipient can hit:** none visible — a failed send is retried by the drain job
   (`/api/cron/notify`), outside this subsystem's scope.

### W9 · A guest meets a lapsed or unpublished catalogue

1. Any guest route resolves through `resolveAccess(slug)` — `lib/catalogue-access.ts:30-64`.
2. Subscription state is checked **before** publish state: `subStatus` not in
   `SERVING_SUB_STATUSES`, or `includedUntil` already past (belt-and-braces against a status that
   lied) → `{ kind: 'lapsed' }` regardless of whether the wedding is otherwise published.
3. **What the guest sees:** `/renew` — the couple's name, the film list, a `mailto:SUPPORT_EMAIL`
   button, and the "download everything" link — never a broken link, never a 404 —
   `app/c/[slug]/renew/page.tsx`.
4. **What does not exist on that screen, or anywhere:** a price, a "pay now" button, or any way for
   the guest or the couple to move `subStatus` themselves. The only way off `/renew` is W10.
5. A draft (never published) catalogue instead reads `{ kind: 'draft' }` → "not yet available",
   never "renew" — a different, non-commercial failure mode from the same function
   (`lib/catalogue-access.ts:50`).

### W10 · Platform admin manually "renews" a catalogue

1. `/admin/platform/catalogues/<id>` → `ExtendTermControl` — a new date (with a "+1 year"
   shortcut) and a required reason describing what was paid —
   `components/admin/CatalogueTermControls.tsx:25-105`.
2. `POST /api/admin/platform/catalogues/:id/term` — **data written:** `catalogues.included_until`;
   if the new date is in the future and the catalogue was not already in a serving `subStatus`, it
   is set straight to `active` (rather than waiting for the next `lifecycle` run to notice);
   `platform_audit` row with `from`/`to`/`reason` — `app/api/admin/platform/catalogues/[id]/term/route.ts:27-61`.
3. **No email** is sent by this route itself. **No credit, invoice, or payment record of any kind
   is written** — the entire transaction's evidence is the free-text `reason` string on the audit
   row (e.g. "Keep renewal, ₹2,500 paid 12 Sept", the component's own placeholder text).
4. **Failure modes:** malformed date → 400; empty reason → the submit button stays disabled
   client-side; non-admin → 404; unknown catalogue → 404.
5. The guest's `/renew` screen and the operator's "Serving until" both reflect the new date on
   their next load — no separate cache to invalidate beyond `revalidateCatalogue`.

### W11 · Platform admin suspends a studio, or takes one catalogue offline

1. **Studio-wide, for non-payment or abuse:** `POST /api/admin/platform/orgs/:id/status`
   (`{status:'suspended'|'active', reason?}`) — **data written:** `orgs.status`,
   `platform_audit` (`action='org.suspend'|'org.restore'`) —
   `app/api/admin/platform/orgs/[id]/status/route.ts:31-61`. **Effect:** `requireOperator` throws
   `FORBIDDEN` for every subsequent read and write by that studio (`lib/admin/session.ts:53-66`);
   sign-in still succeeds so the console can show *why*, rather than looping back to the login
   page. **No catalogue's `subStatus`, `includedUntil` or guest visibility changes** — a billing
   dispute with the studio must never take an already-delivered wedding off the air.
2. **One catalogue, for abuse only (never billing):** `POST
   /api/admin/platform/catalogues/:id/offline` — **data written:** `catalogues.status`
   (`published ⇄ draft`), `platform_audit` (`action='catalogue.offline'|'catalogue.online'`) —
   `app/api/admin/platform/catalogues/[id]/offline/route.ts:25-54`. **Failure modes:** putting back
   a catalogue that was never published → 400 "its studio publishes it"; a required reason. Putting
   one back **spends no credit** and does not re-run the publish route's promotion logic — it flips
   `status` directly, so any unpromoted draft content stays unpromoted.

### W12 · Nightly usage rollup and the delivery alert

1. `GET /api/cron/usage` — for every catalogue, sum each title's provider usage (`storedGb`,
   `deliveredGb`, `watchSeconds`) — `app/api/cron/usage/route.ts:44-69`.
2. **Data written:** `usage_rollup` upserted per `(catalogue_id, month)` —
   `lib/db/repository.ts:385-393`. **No email.** A catalogue at ≥300 GB delivered in the month logs
   a `warn`-level line, not an alert to anyone — `app/api/cron/usage/route.ts:82-94`.
3. **Where this is read back:** nowhere in the product. `listUsage` exists on the repository
   interface and both drivers implement it (`lib/db/memory-repository.ts:1081`,
   `lib/db/supabase-repository.ts:1841`), but no console page or component calls it — see §7.
4. **`deliveredGb` is derived, not measured:** Bunny reports watch-**time** per video, never
   bandwidth per catalogue, so `deliveredGb = watchSeconds × PRICING.md §1's bitrate figure` — an
   estimate pending N-24a's real 15-hour upload (`docs/PROGRESS.md` N-25 entry;
   `supabase/migrations/0015_usage_watch_seconds.sql`).

## 5. Data model touched

| Table.column | Written by | Migration |
|---|---|---|
| `entitlements.id, org_id, catalogue_id, plan_id, max_titles, max_photos, storage_gb, valid_until, created_at` | `org_id` rows only: W5 (`setOrgStorageQuota`). `catalogue_id` rows: **nothing writes one** (read path only). | `0006_entitlements.sql:32-50` |
| `plans.*` | Nothing. Zero rows; seeded from nowhere. | `0006_entitlements.sql:16-27` |
| `credits.id, org_id, plan_id, granted_by, reason, purchased_at, expires_at, consumed_by_catalogue_id, consumed_at` | W1 (registration grant), W3/W6 (platform grant), W2 (consume on first publish) | `0021_credits.sql:7-19` |
| `catalogues.included_until, sub_status, sub_plan, sub_until` | W1/creation (+12 months, `included`); W7 (`grace`/`cold`); W10 (`included_until`, `active`) | `0001_initial_schema.sql:65-69` (columns); `sub_plan`/`sub_until` are carried but never written by any route in this subsystem — no monthly/yearly self-serve plan exists |
| `catalogues.status, published_at, modules, draft_modules, branding, draft_branding` | W2 (publish/unpublish); W11 (`offline` route, `status` only) | `0001_initial_schema.sql` (base columns); `0011_draft_branding.sql` (`draft_branding`); `0012_content_waits_for_publish.sql` |
| `orgs.status` | W11 (suspend/restore) | `0010_platform_writes.sql:11-13` |
| `platform_audit.id, actor_id, actor_email, action, org_id, org_slug, detail, created_at` | Every platform write in W3/W5/W6/W10/W11 | `0010_platform_writes.sql:15-28` |
| `titles.size_bytes` | W4 (declared at upload; corrected by the transcode webhook or `cron/reconcile`) | `0007_storage_only.sql:9` |
| `photos.size_bytes` | W4 (summed across renditions) | `0007_storage_only.sql:10` |
| `usage_rollup.catalogue_id, month, stored_gb, delivered_gb` | W12 | `0001_initial_schema.sql:190-196` |
| `usage_rollup.watch_seconds` | W12 | `0015_usage_watch_seconds.sql:10` |
| `notifications.*` (credit-request, expiry, grace, archived templates) incl. `dedupe_key` | W3, W7, W8 | `0009_notifications.sql`, `0014_notification_dedupe.sql` |
| `job_runs.*` | Every cron in this subsystem, via `runJob` | `0022_job_runs.sql` |

Not written by anything in this subsystem, still in the schema or the plan: `plans.*` (empty),
`entitlements.max_titles`/`max_photos` ("superseded by storage_gb… retained for history",
`0007_storage_only.sql:23-27`), `catalogues.sub_plan`/`sub_until`. Not in the schema at all, though
specified: `invoices`, `lifecycle_events`, `orgs.plan_ends_at`, `catalogues.term_ends_at`,
`catalogues.archived_at`, `catalogues.originals_purged_at` (`docs/REQUIREMENTS.md:185-190`) —
grepped absent from every file under `supabase/migrations/`.

RLS is enabled on `entitlements`, `plans`, `credits` and `platform_audit` with no anon policy
(`0006_entitlements.sql:60-64`, `0021_credits.sql:23-24`, `0010_platform_writes.sql:35`); every
route above reaches them through the service-role repository, scoped in code.

## 6. Configuration

All read once in `lib/env.ts`, the only permitted `process.env` reader.

| Variable | Effect on this subsystem |
|---|---|
| `SUPPORT_EMAIL` (`lib/env.ts:46`) | Recipient of every "Ask for a credit" request (W3); the `mailto:` target on the guest renewal screen (W9). |
| `CRON_SECRET` (optional, `:118`) / `SESSION_SECRET` (required, `:71`, fallback) | Bearer token the `lifecycle`, `warnings` and `usage` crons require in production; unset `CRON_SECRET` means Vercel sends no header at all, so the job silently never runs rather than erroring. |
| `RECONCILE_STALL_MINUTES` (default 120, `:145`) | Governs the **video**-transcode safety net only (`cron/reconcile`) — not the lapse ladder; see §7 correction 1. |
| `NOTIFY_DRIVER` (`fake`\|`resend`, default `fake`, `:100`), `RESEND_API_KEY` (`:101`) | Whether credit-request/expiry/grace/archived mail actually sends. No driver exists for the `whatsapp`/`sms` channel values the schema already allows. |
| `DATA_DRIVER` (`memory`\|`file`\|`supabase`, `:48`) | Which repository implements every credit/entitlement/audit write; production must be `supabase`. |
| `ROOT_DOMAIN` (`:34`) | Used to build the "open this org" link inside the credit-request email (`app/api/admin/credits/request/route.ts:53`). |
| `AUTH_DRIVER` (`local`\|`supabase`, `:161`) | Gates whether platform-created and self-registered accounts (W1, W6) can actually be authenticated against Supabase. |

Not environment-configured — literal constants, changed only by editing code:

| Constant | Value | Where |
|---|---|---|
| `DEFAULT_LIMITS.storageGb` | `20` GB | `lib/entitlements.ts:29-31` |
| `CREDIT_TERM_MONTHS` | `24` | `lib/admin/credits.ts:14` |
| `REGISTRATION_GRANT` | `1` | `lib/admin/credits.ts:15` |
| `MAX_GRANT` (one platform grant) | `50` | `lib/admin/credits.ts:16` |
| `GRACE_DAYS` | `90` | `lib/lifecycle.ts:23` |
| `BEFORE_EXPIRY` / `INTO_GRACE` (days) | `[60,30,7,1]` / `[30,60,89]` | `lib/notify/schedule.ts:27,30` |
| `DELIVERY_ALERT_GB` | `300` | `app/api/cron/usage/route.ts:27` |
| `MAX_UPLOAD_BYTES` (per file) | `20` GB | `lib/video/provider.ts:128` |
| `GB_PER_HOUR` (standard/fullHd) | `2.15` / `4.29` | `lib/entitlements.ts:131` |
| Storage warning threshold | 80% used | `lib/entitlements.ts:162` (`storageUsage`) |
| Demo/E2E credit seed | 40 credits, `grantedBy='demo'` | `lib/db/seed-data.ts:359-369` |

## 7. Gaps and rough edges

**Correction to the map's own brief.** The lapse ladder does **not** live in
`app/api/cron/reconcile` — that route is doc 05 §8's video-transcode safety net: it polls Bunny
for titles stuck `uploading`/`processing` and settles them, and touches no subscription field
(`app/api/cron/reconcile/route.ts:42-123`). The actual ladder is `lib/lifecycle.ts`, run from
`app/api/cron/lifecycle/route.ts` and registered as job `lifecycle`, labelled **"Lapse ladder"**
in `lib/jobs/run.ts:54`.

Missing or half-built, in the code

1. **Razorpay is entirely absent.** Not one line of payment code, not one webhook, not one
   `RAZORPAY_*` (or any payment-related) key in `lib/env.ts` — grepped clean. Every "until Razorpay
   lands" sentence in the UI (`CreditPanel.tsx:62`, `docs/PRODUCT.md:284`) is accurate.
2. **No invoice or revenue record of any kind.** `docs/REQUIREMENTS.md:185-190` specifies an
   `invoices` table (gstin, amount_paise, gst_paise, tds_paise, razorpay ids); it does not exist.
   The only record that money changed hands is a free-text `reason` string on `platform_audit` or
   `credits.reason` — "why does this studio have 12 credits" is answered by prose, not a ledger.
3. **`plans` is a real table with zero rows and no reader.** `entitlements.plan_id`,
   `max_titles`, `max_photos` are written nowhere and read nowhere;
   `app/api/admin/platform/orgs/[id]/quota/route.ts:19-23` says so in its own comment. Neither
   pricing ladder — PRICING-MODEL.md's superseded 5-tier storage ladder nor PRICING.md's current
   3-tier duration ladder (Deliver/Keep/Cinema) nor the proposed Light/Medium/Heavy/Custom ladder
   (D-44/N-80) — is represented in code. The only real enforced number is the flat 20 GB default.
4. **Catalogue-level entitlements are dead code in practice.** `resolveLimits` and
   `getEntitlements` fully implement and test "a catalogue's own grant beats its org's", but no
   route anywhere writes an `entitlements` row with `catalogue_id` set — only `setOrgStorageQuota`
   (org-scoped) exists. The scenario the code comment argues for — "a couple who buys storage must
   not stay capped by a partner who has already left the relationship" (`lib/entitlements.ts:57-65`)
   — has no way to actually happen today.
5. **What is sold is not what is enforced.** `docs/PRICING.md:27-31` sells 100–200 GB per plan;
   the code's actual default, absent a platform admin manually raising it, is `20` GB
   (`lib/entitlements.ts:29-31`, matched by `docs/USAGE-GUIDE.md:463`). A studio sold "Deliver,
   100 GB" is capped at 20 GB until someone remembers to open the quota control.
6. **Renewal is entirely manual and off-ladder.** The only thing that ever writes
   `includedUntil` forward is a platform admin typing a date into `ExtendTermControl` (W10) — no
   self-service renewal, no proration, no downgrade check against content that would no longer fit
   (`PRICING.md` §3's "remove 20 GB to renew on Keep" has no code behind it). The `studio_gone`
   escape-hatch predicate (D-26) is explicitly deferred until the checkout it would gate exists —
   `docs/NEXT.md:329-345` (N-24b).
7. **"Archive" reduces nothing.** Going `cold` blocks guest streaming (`resolveAccess`) and sends
   one email; it does **not** trim a catalogue to its best rendition, purge original files, or
   reduce `catalogueStorageBytes` in any way. `PRICING.md §2`'s entire archive-tier pricing
   (₹999–1,499/yr, "≈30 GB, ₹340/year") assumes a storage-reduction step that has no implementation
   — the storage bill for a cold catalogue keeps compounding exactly as if it were still `active`.
8. **Warnings are email-only.** `Notification.channel` allows `whatsapp`/`sms` (`lib/schema.ts:634`)
   and `PRICING.md §2` promises all three, but every `enqueue()` call in `lib/lifecycle.ts` and
   `lib/notify/schedule.ts` hardcodes `channel: 'email'`, and `NOTIFY_DRIVER` supports only
   `fake`/`resend` (`lib/env.ts:100`) — no WhatsApp/SMS driver exists (`docs/NEXT.md:322-328`,
   N-36c: blocked on an MSG91 subscription and Meta template approval, not on code).
9. **Usage rollups are write-only.** `listUsage` is implemented by both drivers and called by
   nothing in `app/` or `components/` — the nightly `stored_gb`/`delivered_gb`/`watch_seconds` rows
   exist solely to drive the ≥300 GB **log** line; no console surfaces a studio's or a catalogue's
   delivery history despite `usage_rollup` existing since Phase 0.
10. **`deliveredGb` is a modelled number, not a measurement.** Bunny has no per-catalogue bandwidth
    API; the figure is `watchSeconds × PRICING.md §1`'s bitrate assumption, which is itself
    unverified pending N-24a's real 15-hour wedding upload — every dollar-cost argument in
    `PRICING.md` §5 currently rests on an estimate, not a measured number.
11. **Two independent code paths can move `catalogues.status` to `published`.** The studio's own
    `/publish` (W2, credit-gated, promotes `draft_modules`/`draft_branding`) and the platform's
    `/offline` "put it back" (W11, never credit-gated, never promotes drafts — documented as
    intentional, `app/api/admin/platform/catalogues/[id]/offline/route.ts:16-18`).
12. **No cap anywhere in code on catalogues per studio or studios per platform** — only storage is
    limited. `docs/NEXT.md:322-326` (N-81) calls this deliberate, but it is deliberate only in
    prose; nothing in the code itself documents or enforces an upper bound.
13. **The studio-facing "lapse dashboard" (N-37) does not exist.** What exists is the *platform's*
    own cross-org catalogues list, sorted soonest-to-lapse (`app/admin/platform/catalogues/page.tsx`)
    — useful to us, not to a studio deciding which of their own couples to call.

Docs that the code does not match (§ is the instruction to say so when this happens)

14. `docs/ROADMAP.md` is dated **6 September 2026** (`:4`) and unrevised since; three status rows
    are now stale against code that landed 8–12 September — `:76` "plan capacity shown… Missing,
    N-23" is built (`app/admin/c/[id]/page.tsx:126-163`, the 80% warning); `:95` "Lifecycle…
    nothing drives it" is driven daily since 8 Sept (`lib/lifecycle.ts`, W7); `:98` "platform
    admin writes with an audit trail | Missing" is built (`lib/admin/platform.ts:56-74`).
15. `docs/PRODUCT.md`'s §1/§2 tables are marked "Last reviewed 14 August… Extended 6 September"
    (`:16-19`) and were never reconciled against the same file's own later, accurate "12 Sept"
    rows further down (`:284-309`). The older rows still claim `:139` "Quota management… **Nothing
    writes a grant yet**" (false since N-27b) and `:97` "See what a plan holds | Missing" (built,
    item 14). `:140`'s "Renewal… nothing writes it, warns about it, or acts on lapse" is only
    partly true: the ladder writes `subStatus` and warns automatically (W7, W8) — only the *paid*
    renewal is genuinely missing, a narrower claim than the row makes.
16. `docs/USAGE-GUIDE.md:481` repeats the identical stale "**Nothing writes a grant yet**" claim.
17. `docs/PRICING-MODEL.md` states its own supersession at the top (`:5-7`, "Where the two
    disagree, `PRICING.md` wins") — its 5-tier Highlights/Signature/Full Wedding/Cinema/Cinema Plus
    storage ladder is historical working-out, not a live proposal; neither it nor the ladder that
    replaced it is seeded anywhere in code (item 3 above).
18. `docs/PRICING.md:14-20` itself flags its headline storage ladder (Light/Medium/Heavy/Custom,
    D-44) as "**proposed 13 September 2026, not yet decided**" — correctly unbuilt, and correctly
    marked as such in the doc; not a disagreement, but worth noting it is the one pricing question
    in this subsystem the docs are honest about being open rather than merely undone.

## 8. Evidence index

Entitlements and storage quota
- `lib/entitlements.ts:1-164` — whole file: `DEFAULT_LIMITS`/`limitsSchema` (29-37),
  `entitlementSchema` (40-52), `resolveLimits` (70-88), `bytesToGb`/`storageCheck` (92-116),
  `GB_PER_HOUR`/`hoursFor` (131-139), `StorageUsage`/`storageUsage` (142-164).
- `app/api/admin/uploads/route.ts:9,32-79` — quota check on films.
- `app/api/admin/catalogues/[id]/photos/route.ts:10,139-156` — quota check on photographs.
- `app/admin/c/[id]/page.tsx:15,39-65,126-163` — usage display and 80% banner.
- `app/api/admin/platform/orgs/[id]/quota/route.ts:1-64`; `components/admin/OrgQuotaControl.tsx:1-112`.
- `lib/db/repository.ts:148-155,194-224,258,385-397` — `Repository` interface: credits,
  entitlements, `catalogueStorageBytes`, usage.
- `lib/db/memory-repository.ts:39-49,334-362,439-480,611-623` — `balanceOf`, credits, entitlements,
  `catalogueStorageBytes`.
- `lib/db/supabase-repository.ts:419-452,756-818,1210-1274` — entitlements, credits,
  `getEntitlements` fallback-on-error, `catalogueStorageBytes`.
- `lib/schema.ts:64-68,192,213-221,254-269,634` — `subStatusSchema`/`SERVING_SUB_STATUSES`,
  `orgStatusSchema`, `platformAuditSchema`, `publishCreditSchema`/`CreditBalance`, channel enum.
- `supabase/migrations/0006_entitlements.sql:1-64`, `0007_storage_only.sql:1-28`.

Credits and the publish gate
- `lib/admin/credits.ts:1-53` — whole file.
- `app/api/admin/credits/route.ts:1-18`; `app/api/admin/credits/request/route.ts:1-59`.
- `app/api/admin/platform/orgs/[id]/credits/route.ts:1-48`;
  `components/admin/OrgCreditsControl.tsx:1-101`.
- `app/api/admin/catalogues/[id]/publish/route.ts:1-91` — credit gate 26-41; promotion 43-78;
  unpublish 83-91.
- `components/admin/CustomizerShell.tsx:105,240-315,497` — publish flow, `creditRequired` state.
- `components/admin/CreditPanel.tsx:1-71` — whole file.
- `app/api/partners/route.ts:54-144` — registration incl. `grantRegistrationCredit` at 134.
- `lib/admin/platform-accounts.ts:1-106` — `createStudio`, opening credits 98-106.
- `app/api/admin/platform/orgs/route.ts:1-48`.
- `app/admin/page.tsx:100-104` — credit-balance line. `app/admin/platform/studios/page.tsx:10,27,71-96`.
- `supabase/migrations/0021_credits.sql:1-24`.
- `tests/unit/credits.test.ts:1-176`; `e2e/credits.spec.ts:1-77`.

The lapse ladder, warnings, and renewal
- `lib/lifecycle.ts:1-139` — whole file.
- `app/api/cron/lifecycle/route.ts:1-29`; `lib/jobs/run.ts:1-56` (job registry).
- `lib/notify/schedule.ts:1-118` — whole file; `app/api/cron/warnings/route.ts:1-29`.
- `lib/catalogue-access.ts:1-87` — whole file, `resolveAccess` 30-64.
- `app/c/[slug]/renew/page.tsx:1-69` — whole file.
- `lib/admin/catalogue-health.ts:1-103` — `catalogueAttention`.
- `components/admin/CatalogueSettings.tsx:224-234` — read-only "Serving until".
- `app/api/admin/platform/catalogues/[id]/term/route.ts:1-62`;
  `app/api/admin/platform/catalogues/[id]/offline/route.ts:1-54`;
  `components/admin/CatalogueTermControls.tsx:1-176`.
- `app/admin/platform/catalogues/page.tsx:1-45` — soonest-to-lapse worklist.
- `app/api/admin/platform/orgs/[id]/status/route.ts:1-61`; `lib/admin/session.ts:53-66`.
- `supabase/migrations/0001_initial_schema.sql:65-69,190-196`; `0009_notifications.sql`;
  `0014_notification_dedupe.sql`; `0015_usage_watch_seconds.sql:1-10`.
- `app/api/cron/reconcile/route.ts:1-123` — the correction: video-transcode reconciliation, no
  subscription field touched, not the lapse ladder.

Platform audit, and usage rollup
- `lib/admin/platform.ts:22-45,56-74` — `getPlatformAdmin`/`requirePlatformAdmin`,
  `recordPlatformAction`; `supabase/migrations/0010_platform_writes.sql:1-35`.
- `app/api/cron/usage/route.ts:1-103` — whole file.
- `lib/db/repository.ts:385-397`; `lib/db/memory-repository.ts:1081`;
  `lib/db/supabase-repository.ts:1828-1853`; `lib/video/provider.ts:114,128`.

Configuration
- `lib/env.ts:34,46,48,71,100-101,118,145,161` — `ROOT_DOMAIN`, `SUPPORT_EMAIL`, `DATA_DRIVER`,
  `SESSION_SECRET`, `NOTIFY_DRIVER`/`RESEND_API_KEY`, `CRON_SECRET`, `RECONCILE_STALL_MINUTES`,
  `AUTH_DRIVER`.
- `lib/db/seed-data.ts:359-369` — demo/E2E credit seed.

Docs used, and where they disagree with the code (§7 has the detail)
- `docs/PRICING.md:1-378` — read in full; plans table 27-44, who is billed 48-62, lapse rules
  114-184, adding storage 188-207, three years 211-230, economics 234-296, unresolved §6 315-338.
- `docs/PRICING-MODEL.md:1-40` — superseded banner 1-9, old 5-tier ladder 20-30 (skimmed; not
  re-derived here since `PRICING.md` supersedes it by its own statement).
- `docs/NEXT.md:190-218,300-345,400-433` — N-79, N-80, N-24a, N-24b, N-27c, N-20.
- `docs/REQUIREMENTS.md:185-208` — §9 data-model additions, §10 phase-exit tests, §11 open questions.
- `docs/reference/00-decision-log.md:440-464,626-641,679-688` — D-26, D-27, D-38, D-39, D-44.
- `docs/ROADMAP.md:1-9,60-98` — dated header; status tables for couple/studio/platform.
- `docs/PRODUCT.md:15-19,65-142,270-309` — review dates; old §1/§2 tables; the 12 Sept changelog.
- `docs/USAGE-GUIDE.md:457-484` — §15 limits and entitlements.
- `docs/PROGRESS.md:1503-1527,1588-1618,1822-1849` — N-27b, N-24, N-65 build notes.
