# Subsystem map — `platform` (the platform owner's console)

Mapped 16 September 2026 against the code on `main` (HEAD `96fb305`). Where a document and the
code disagree, the code is what is described and the disagreement is listed in §7. Line numbers
refer to the files as read on this date.

---

## 1. Summary

The platform subsystem is how Mehfilbox is run as a business rather than used as one studio's
tool. `platform_admins` is a table deliberately outside the `orgs`/`operators` graph (doc 15 §1):
a platform admin has no `org_id`, nothing converts an operator into one or back, and every page
here answers a plain `notFound()` to anyone else — the console is invisible before it is refused.
A platform admin is provisioned by hand, off the web app entirely (`scripts/create-platform-admin.ts`),
and signs in through the exact same `/login` form a studio or a couple uses; a second database
lookup added on 12 September 2026 (N-76) is the only reason that sign-in reaches anywhere; before
that fix the row had existed since the first migration and authorised nobody. Once in, the console
gives one person: a dashboard of platform-wide counts and the last ten things done; a searchable
list of every studio with the means to create one outright, suspend or restore it, set its storage
quota, grant it publish credits, add an operator to it, or hand any operator a fresh sign-in link;
the equivalent read-only list of every couple account; a searchable list of every catalogue on the
platform with the two writes that belong to the platform rather than the studio — extending how
long a wedding keeps serving, and taking one offline for abuse; an editor for platform-wide themes
layered on the seven built into the code; a table of every custom domain with a manual "mark
attached" for the deployment's current DNS driver; a live health board that asks "would a guest
notice" across ten services and six scheduled jobs; and an audit trail that is the only place every
other page's writes are ever read back. Every write funnels through one guard
(`requirePlatformAdmin`) and one recorder (`recordPlatformAction`); every page funnels through the
read equivalent (`getPlatformAdmin`). Today this is a single seat — one email, one password, kept
in a gitignored file, never printed to a terminal.

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Platform admin** | A `platform_admins` row keyed to a Supabase Auth user id, with no `org_id` (`lib/schema.ts:413-419`). Looked up by `getPlatformAdmin()` (`lib/admin/platform.ts:28-34`), never by anything in a request. | Every page and route in this map. Nothing else — the design's whole point is that this identity carries no org-scoped access at all (`lib/admin/platform.ts:9-26`). |
| **Studio operator** (`orgs.kind='partner'`) | The usual subject of a platform write: created (W4), suspended/restored (W5), quota-set (W6), credited (W7), given a second seat or a password link (W8). | `/admin/platform/**` answers 404 for them (`e2e/admin.spec.ts:62-70`); they only ever feel the *effect* of a platform write — a suspended screen, a credit balance, a "serving until" date, a theme in their picker. |
| **Couple account** (`orgs.kind='couple'`) | Listed on the Couples page with its operators and catalogues (W9); its catalogues and their term/offline state are reachable through the Catalogues pages exactly like a studio's. | Same as a studio operator: no visibility into this surface at all. |
| **Guest** | Never an actor here, but the audience every write ultimately affects: offline → "not yet available"; term extended → keeps playing; a withdrawn theme → their own wedding is unaffected; a domain marked attached → a new URL starts serving. | Out of scope for this map except as the reason a row exists. |
| **Scheduled jobs (cron)** | Authenticate with a bearer `CRON_SECRET`, never as a platform admin (`app/api/cron/*/route.ts`, out of this scope's file list). They write `job_runs`, which the Health page (W15) reads. | Cannot reach any `/api/admin/platform/**` route — a completely separate credential. |

## 3. Capabilities

Provisioning and sign-in

- Create the platform owner's Supabase Auth account and `platform_admins` row together, idempotently, writing the generated password only to a gitignored file — `scripts/create-platform-admin.ts:62-130`.
- Second lookup on the shared sign-in route: an authenticated user with no `operators` row is checked against `platform_admins` before being refused (N-76) — `app/api/admin/session/route.ts:82-109`.
- `getPlatformAdmin` / `requirePlatformAdmin`: the one place identity is resolved for every page and every write, answering `notFound()`/`NOT_FOUND` rather than a refusal that would confirm the surface exists — `lib/admin/platform.ts:28-44`.
- `recordPlatformAction`: the one place a platform write is audited, called after the write succeeds, denormalising the actor's email and the org's slug so the row still reads after either is gone — `lib/admin/platform.ts:56-74`.

Dashboard

- Platform-wide counts (studios, couples, catalogues live/draft, credits outstanding, health summary) and the last ten audit rows, each read fresh (no caching beyond the health probes' own) — `app/admin/platform/page.tsx:18-95`.

Studios

- Search every partner org by name or address — `app/admin/platform/studios/page.tsx:19-26`.
- Create a studio from the console: org, first operator, a set-password link, optional opening credits, in one recorded action — `components/admin/CreateStudioForm.tsx`, `app/api/admin/platform/orgs/route.ts`, `lib/admin/platform-accounts.ts:66-110`.
- Suspend or restore a studio, with a required reason on suspend and none on restore (the asymmetry is deliberate) — `components/admin/OrgStatusControl.tsx`, `app/api/admin/platform/orgs/[id]/status/route.ts`.
- Set or clear a studio's storage-quota override (the one entitlement field anything in the product actually reads) — `components/admin/OrgQuotaControl.tsx`, `app/api/admin/platform/orgs/[id]/quota/route.ts`, `lib/entitlements.ts:29-88`.
- Grant publish credits, additive only, with a required reason — `components/admin/OrgCreditsControl.tsx`, `app/api/admin/platform/orgs/[id]/credits/route.ts`.
- List who can sign in to an org, add another operator, and send any operator a fresh set-password link — `components/admin/OperatorControls.tsx`, `app/api/admin/platform/operators/route.ts`, `app/api/admin/platform/operators/[id]/password-link/route.ts`.
- One org's page: its catalogues (links only, no edit), its operators, its entitlement, its credit balance and its own audit trail — `app/admin/platform/orgs/[id]/page.tsx`.

Couples

- Every couple account with its operators (same password-link control as Studios) and every catalogue linked to or owned by it, distinguishing "theirs" from "being prepared" — `app/admin/platform/couples/page.tsx`.

Catalogues

- Search every catalogue on the platform, sorted soonest-to-lapse first — `app/admin/platform/catalogues/page.tsx`.
- One catalogue's page: owner, origin studio (if different), the guest URL, and the catalogue-filtered slice of its org's audit trail — `app/admin/platform/catalogues/[id]/page.tsx:27-97`.
- Extend (or shorten) a catalogue's term, with a required reason, reviving a lapsed wedding to `active` at once — `components/admin/CatalogueTermControls.tsx` (`ExtendTermControl`), `app/api/admin/platform/catalogues/[id]/term/route.ts`.
- Take a catalogue offline for abuse, or put it back for free — `components/admin/CatalogueTermControls.tsx` (`OfflineControl`), `app/api/admin/platform/catalogues/[id]/offline/route.ts`.

Themes

- Author a platform-wide theme starting from any built-in or existing custom one, with a live specimen and the same contrast gate the built-in seven are held to — `components/admin/ThemeStudio.tsx`, `app/api/admin/platform/themes/route.ts`.
- Edit an existing custom theme's tokens (repaints every wedding on it) or withdraw/restore it with one click (repaints nothing) — `components/admin/ThemeStudio.tsx:149-161`, `app/api/admin/platform/themes/[id]/route.ts`.

Domains

- List every custom domain with its status, whose it is, what it serves, and when it was last checked — `app/admin/platform/domains/page.tsx`.
- Mark a verified (or failed) domain attached by hand, for a deployment with no automatic `DomainProvider` — `components/admin/DomainAdmin.tsx`, `app/api/admin/platform/domains/[id]/attached/route.ts`, `lib/domains/index.ts:67-72`.

Health

- Ten services probed live with a three-second budget and a sixty-second cache, each a state and a plain-English sentence: database, Bunny Stream, Bunny Storage, photo CDN, Resend, notification queue, transcode pipeline, six scheduled jobs, the synthetic guest walk, and custom domains — `app/admin/platform/health/page.tsx`, `lib/health/probes.ts:69-254`.
- A "check again now" that bypasses the cache — `app/admin/platform/health/page.tsx:38-40`, `lib/health/probes.ts:33-35`.
- Every scheduled job leaves a record of when it ran, whether it worked, and its own reported detail, without ever letting the recording itself fail the job — `lib/jobs/run.ts:18-46`.

Audit

- Every platform write, newest first, up to 200 rows, with the free-text reason pulled out and everything else shown as JSON — `app/admin/platform/audit/page.tsx`.

## 4. Workflows

### W1 · Provision the platform admin (one-time, off the web app)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Run `pnpm platform:admin <email> [name]` locally | `scripts/create-platform-admin.ts:23-46` loads `.env.vercel.local`/`.env.local`, requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` | — | — | Missing env → prints an error and exits 1 (terminal only, no UI). |
| 2 | Look up an existing Supabase auth user by email | `:64-70` (`GET /auth/v1/admin/users?per_page=200`) | — | — | Request fails → thrown error with status + body, script exits 1. |
| 3 | Create the auth account if none exists, confirmed on creation | `:75-90`, password from `generatePassword()` (`:53-60`, four groups from an unambiguous 32-symbol alphabet) | `auth.users` (Supabase-managed) | none | Creation fails → thrown error. An **existing** account's password is left alone (`:77`). |
| 4 | Create the `platform_admins` row if none exists | `:93-112` | `platform_admins.id, email, name` (`created_at` defaults `now()`) | — | Insert fails → thrown error. An **existing** row is left alone (`:100-101`). |
| 5 | Hand over the credential | `:114-123` | `.env.platform.local` (gitignored) — the password is never printed to the terminal | — | — |
| 6 | Re-run any time | Idempotent both halves (`:75-77,100-101`) — "both halves, or neither works" (`:7-11`) | — | — | — |

### W2 · Sign in (shared door, second lookup — N-76)

1. Any door on `/login` posts to `POST /api/admin/session` exactly as a studio or couple would (`app/api/admin/session/route.ts:43-133`; `components/auth/LoginForm.tsx`).
2. Same rate limiting as every sign-in: 5 failures per address or 10 per IP in 15 minutes lock the attempt, a captcha is owed after 3 failures when a driver is configured (`session/route.ts:33-58,60-69`).
3. `auth.signIn(email, password)` authenticates against the configured driver; `operator = getOperator(user.id)` finds nothing for a platform admin, by design (`:75-80`).
4. **The second lookup, added by N-76**: only when `user && !operator`, `platformAdmin = getRepository().getPlatformAdmin(user.id)` runs (`:94-95`). Found → both rate buckets reset, `log.info('platform login: ok', …)`, response is `{ platformAdmin: {id,name,email}, landing: '/admin/platform' }` with the auth cookies copied across (`:96-109`).
5. `LoginForm` treats `landing` opaquely — `router.replace(body.landing ?? '/admin')` (`components/auth/LoginForm.tsx:56-57`) — no platform-specific client code was needed for N-76 at all.
6. Data written: none beyond the auth cookies; the two rate-limit buckets are reset on success.
7. Failure modes: wrong password or unknown email → the same generic "Those details did not work" every operator sees (`:111-117`) — a platform admin is not distinguishable from a failed guess. **On `AUTH_DRIVER=local` this path is structurally unreachable**: `LocalAuthProvider.signIn` only ever calls `getOperatorByEmail` (`lib/admin/auth-local.ts:35-38`), so `user` is already `null` before the platform-admin branch is considered — a platform admin cannot sign in on the local/memory driver at all, in dev or in CI (confirmed: no E2E exists for this path — see §7).

### W3 · Dashboard at a glance (read-only)

1. `GET /admin/platform` → `getPlatformAdmin()` or 404 (`app/admin/platform/page.tsx:18-21`).
2. `Promise.all([listOrgs(), listAllCatalogues(), listPlatformAudit({limit:10})])`, then `Promise.all([per-org creditBalance(), probeAll().then(summarise)])` (`:23-34`).
3. Five stat tiles: Studios (+ "N suspended" hint), Couples, Catalogues (live/draft split), Credits outstanding (sum of every org's available balance), Health (`ok`/`total` + a state word) — `:52-63`.
4. Last 10 audit rows: action, org slug, actor email, timestamp, and `detail.reason` if present — `:71-92`.
5. No writes. Failure mode: not a platform admin → `notFound()`.

### W4 · Create a studio (the phone-sale path)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Open the collapsed "Create a studio" button on Studios | `components/admin/CreateStudioForm.tsx:86-103` | — | — | — |
| 2 | Fill studio name, contact name, email, language, opening credits (0–50, default 1), a free-text reason | `:104-165` | — | — | Required-field browser validation only; no per-field server errors are surfaced (see step 6). |
| 3 | `POST /api/admin/platform/orgs` | `app/api/admin/platform/orgs/route.ts:19-31` schema: name/contactName 2–80, email, locale, credits 0–`MAX_GRANT`(50), reason ≤500 | — | — | `requirePlatformAdmin()` first — 404 if not an admin. |
| 4 | Build the org | `lib/admin/platform-accounts.ts:66-86`, slug from `suggestOrgSlug` | `orgs.id, name, slug, kind='partner', locale, branding={presentedBy:name}, created_at` | — | — |
| 5 | Create the first operator | `createOperatorFor` (`:27-63`): checks `getOperatorByEmail` first; `auth.createUser` with an unknown 32-byte password | `operators.id(=auth user id), org_id, email, name, role='admin', password_hash('' under Supabase), must_change_password=false, created_at`; `credential_links` row (`purpose='set-password'`) | Queues a **`credential`** template email (drained by the same 15-minute cron the studio surface uses) | Existing address → 400 "That address already has an account"; Supabase refusal → 400 "That address cannot be used". |
| 6 | Grant opening credits, if any | `:98-107` | `credits` rows (`planId='deliver', grantedBy=admin.email, reason ?? 'Opening credits', expiresAt=+24mo`) | — | — |
| 7 | Compensation on failure | `:89-96` | Org **deleted** if the operator step throws | — | The Supabase auth user, if one was created, is stranded (no operator row references it) — same shape as studio self-registration's own rollback. |
| 8 | Record and respond | `orgs/route.ts:35-47` | `platform_audit` row (`action:'org.create'`, `detail:{email,credits,reason?}`) | — | — |
| 9 | Show the link once | `CreateStudioForm.tsx:57-83` | — | — | "Shown once, works once, fourteen days"; `router.refresh()` updates the table below. |

### W5 · Suspend or restore a studio (N-27)

1. Active studio: "Suspend this studio" reveals a **required** reason and a destructive-styled "Suspend `<name>`" / Cancel; suspended studio: a single "Restore access", no confirmation — the asymmetry is deliberate (`components/admin/OrgStatusControl.tsx:56-127`).
2. `POST /api/admin/platform/orgs/:id/status {status, reason?}` → `requirePlatformAdmin()`; org 404 if missing; **no-op early return** if `status` is already what was asked, so the audit trail stays "a log of changes rather than of clicks" (`app/api/admin/platform/orgs/[id]/status/route.ts:31-43`).
3. `setOrgStatus(org.id, status)` — writes `orgs.status` only, never touching a catalogue.
4. `recordPlatformAction({action: 'org.suspend'|'org.restore', detail:{from,to,reason?}})`.
5. Downstream effect: `requireOperator()` starts throwing `FORBIDDEN` for every write that studio attempts, and the studio's own `/admin` renders "This account is suspended" rather than looping back to login — the session survives suspension by design (`lib/admin/session.ts:30-66`; `app/admin/page.tsx:36-50`, studio scope). Weddings already delivered are untouched: status lives on `orgs`, never on `catalogues`.
6. Failure modes: org id not found → the `ApiError` message shown under the form; nothing stops re-suspending an already-suspended org except the early-return above (no-op, not an error).

### W6 · Set a studio's storage quota (N-27b)

1. `components/admin/OrgQuotaControl.tsx:60-98` shows "on the default of 20 GB" or the override; a GB number field, "Set", and "Back to default" (only when an override exists).
2. `POST /api/admin/platform/orgs/:id/quota {storageGb: number|null, reason?}` → `requirePlatformAdmin()`; org 404 check; reads `before = getOrgEntitlement(org.id)` (`app/api/admin/platform/orgs/[id]/quota/route.ts:31-42`).
3. `setOrgStorageQuota(org.id, storageGb)` — `storageGb: null` **deletes** the `entitlements` row rather than nulling a field, so "back to default" tracks `DEFAULT_LIMITS.storageGb` if it ever changes rather than freezing today's number; a number **upserts** it (`lib/db/supabase-repository.ts:428-455`).
4. `recordPlatformAction({action:'org.quota.set'|'org.quota.clear', detail:{from,to}})` — `from`/`to` are always resolved against `DEFAULT_LIMITS.storageGb` rather than recorded as `null`, so the row reads correctly years later (`quota/route.ts:48-54`).
5. Effect: `resolveLimits(catalogueEntitlement, orgEntitlement)` is what the upload path actually checks, catalogue beating org per field (`lib/entitlements.ts:70-88`) — but nothing anywhere in this scope ever writes a **catalogue**-level entitlement, so in practice the org override is the only lever this console has.
6. Failure modes: non-integer or ≤0 GB → Set stays disabled client-side; org not found → 404 message under the form.

### W7 · Grant credits

1. `components/admin/OrgCreditsControl.tsx:56-101` shows "N available · M spent · K expired" and a form: count (1–50) + a **required** reason.
2. `POST /api/admin/platform/orgs/:id/credits {count, reason}` → `requirePlatformAdmin()`; org 404 check; `grantCredits(makeCredits({orgId, count, grantedBy: admin.email, reason}))` — writes `count` rows to `credits` (`planId='deliver', purchasedAt=now, expiresAt=+24mo, consumedByCatalogueId=null`) (`app/api/admin/platform/orgs/[id]/credits/route.ts:34-36`).
3. `recordPlatformAction({action:'credits.grant', detail:{count,reason}})`; response returns the fresh balance; `router.refresh()`.
4. **Additive only** — there is no revoke or reduce endpoint anywhere in this scope; the route's own comment says a credit a studio was told it had is a promise (`orgs/[id]/credits/route.ts:16-17`).
5. Failure modes: count outside 1–50 or an empty reason → Grant stays disabled client-side; org not found → 404.

### W8 · Add an operator / recover access

1. An org's "Who can sign in" card lists every operator with email + role and a "Send a password link" button each; **zero** operators renders a red "Nobody. This org cannot be signed into…" (`app/admin/platform/orgs/[id]/page.tsx:80-107`) — a real, reachable state when a Supabase `auth.users` deletion cascades an operator row away.
2. "Add a person" reveals name/email/role(admin|uploader) (`components/admin/OperatorControls.tsx:59-152`).
3. `POST /api/admin/platform/operators {orgId,email,name,role}` → `requirePlatformAdmin()`; `addOperator()` loads the org (404 if gone), then the same `createOperatorFor()` as W4 step 5 — writes `operators.*` + a `credential_links` row and queues a `credential` email; returns the link (`lib/admin/platform-accounts.ts:113-123`).
4. `recordPlatformAction({action:'operator.create', detail:{email,role}})`; the form shows "Added `<email>`; their set-password link is queued" plus the raw link (`OperatorControls.tsx:69-78`).
5. "Send a password link" (same button on Studios' org page and on Couples) → `POST /api/admin/platform/operators/:id/password-link` → `requirePlatformAdmin()`; operator 404 check; `sendCredentialLink(operator,'set-password')` — a **fresh** `credential_links` row + a queued `credential` email; `recordPlatformAction({action:'operator.password-link', detail:{email}})`; the link is shown inline as "Queued for `<email>`." (`app/api/admin/platform/operators/[id]/password-link/route.ts`; `OperatorControls.tsx:21-56`).
6. Failure modes: email already in use → "That address already has an account"; Supabase refusal → "That address cannot be used"; org id missing → 404 "Org not found"; operator id missing → 404 "Operator not found"; both buttons are fire-once with no retry affordance beyond clicking again.

### W9 · Couples (read, plus the reused password-link write)

1. `GET /admin/platform/couples` → every `orgs.kind='couple'` with its operators and `listCataloguesForCouple(org.id)` (catalogues linked to *or* owned by that couple) (`app/admin/platform/couples/page.tsx:15-27`).
2. Each row: account name, since-date, operators (each with the W8-step-5 password-link button — the **only** write on this page), and catalogues tagged "theirs" (`catalogue.orgId === org.id`) vs "being prepared" (linked, not yet transferred) (`:57-83`).
3. Zero operators → red "Nobody can sign in to this account." (`:64-66`) — the couple-side mirror of W8 step 1.
4. There is no create-couple, suspend-couple, or credit-grant control on this page even though a couple org can hold credits and be granted them — that only happens by following the link to its `/admin/platform/orgs/<id>`.

### W10 · Catalogues across the platform (search, then drill in)

1. `GET /admin/platform/catalogues?q=` → `listAllCatalogues()`, filtered in-request by couple name/slug/studio name, sorted soonest-to-lapse first by `includedUntil` (`app/admin/platform/catalogues/page.tsx:24-38`).
2. Table: couple, owner (studio link), state, wedding date, "serving until", term (sub-status) (`:71-109`).
3. `GET /admin/platform/catalogues/<id>` → header (status, owner link, origin studio if different, wedding date, slug, sub-status, live guest URL), the two platform-only controls (W11, W12), and an audit trail (`app/admin/platform/catalogues/[id]/page.tsx:27-97`).
4. That trail is `listPlatformAudit({orgId: catalogue.orgId, limit:50})` filtered in memory to `detail.catalogueId === catalogue.id` (`:32-34`) — **not** a catalogue-scoped query (see §7).
5. No write lives on the list page; both live on the detail page.

### W11 · Extend a catalogue's term

1. `components/admin/CatalogueTermControls.tsx:25-105` (`ExtendTermControl`): current `includedUntil`, a date field defaulted to it, a "+1 year" shortcut, a **required** reason.
2. `POST /api/admin/platform/catalogues/:id/term {includedUntil:'YYYY-MM-DD', reason}` → `requirePlatformAdmin()`; catalogue 404 check; `includedUntil` normalised to midnight UTC (`app/api/admin/platform/catalogues/[id]/term/route.ts:38`).
3. `updateCatalogue(id, catalogue.orgId, {includedUntil, ...(stillRunning && !SERVING_SUB_STATUSES.includes(subStatus) ? {subStatus:'active'} : {})})` — writes `catalogues.included_until`, and — only when the new date is in the future **and** the wedding was not already in an actively-serving sub-status (i.e. it was `lapsed`/`cold`/`deleted`) — also `catalogues.sub_status='active'`, putting it back on the air at once rather than waiting for the next lifecycle cron (`:39-44`).
4. `recordPlatformAction({action:'catalogue.term', detail:{catalogueId,slug,from,to,reason}})`; `revalidateCatalogue(updated.slug)` clears the guest-facing cache immediately.
5. Deliberately **not** studio-editable: the route's own comment says a self-service renewal date is a billing hole (`term/route.ts:16-20`).
6. Failure modes: date not `YYYY-MM-DD` → 400 "Use YYYY-MM-DD"; empty reason → 400, and "Set the term" is disabled client-side until both fields are filled; catalogue not found → 404.

### W12 · Take a catalogue offline, or put it back

1. `components/admin/CatalogueTermControls.tsx:107-176` (`OfflineControl`): three states — "Archived" (the lifecycle cron's own state, no control shown), "Off the air" ("Put it back"), "On the air" ("Take offline", gated behind a **required** reason). A catalogue that was never published shows no button at all ("Its studio publishes it; nothing to do here.", `:148`).
2. `POST /api/admin/platform/catalogues/:id/offline {offline, reason}` → `requirePlatformAdmin()`; catalogue 404 check; refuses `offline:false` on a never-published catalogue (400 "This wedding has never been published; its studio publishes it", `app/api/admin/platform/catalogues/[id]/offline/route.ts:36-38`); no-op early return if `status` already matches.
3. `updateCatalogue(id, orgId, {status: offline?'draft':'published'})` — writes `catalogues.status` **only**; `published_at` is untouched, so putting it back spends no credit — a wedding that was up has already spent its one.
4. `recordPlatformAction({action:'catalogue.offline'|'catalogue.online', detail:{catalogueId,slug,reason}})`; `revalidateCatalogue(updated.slug)`.
5. For abuse only, never a billing dispute — both the route and the component's own copy say so; guests see "not yet available" exactly as a studio's own unpublish shows.
6. Failure modes: empty reason → "Take offline"/"Put it back" disabled client-side; offline:false on a never-published catalogue → 400 (defensive; the UI already hides the button, so this only fires via a direct API call).

### W13 · Author, edit, and withdraw a theme (D-35)

1. `GET /admin/platform/themes` → `ThemeStudio({builtIn: builtInThemes(), custom: listCustomThemes()})`, the custom list read live rather than through the cached resolver so a just-saved theme is visible at once (`app/admin/platform/themes/page.tsx:17-38`).
2. Left rail: "Yours" (each with Edit / Withdraw-Restore) and "Built in" (each with "Start from this") (`components/admin/ThemeStudio.tsx:163-246`).
3. "Start from this" seeds a draft (tokens copied; id/name blank for a new theme) and opens the editor plus a live specimen painted with the guest page's own `themeCss()` (`:65-73,95-103,524-613`).
4. Editing: name (auto-slugifies the id while it is untouched and the theme is new; the id is frozen once editing an existing one), 9 colour tokens (native picker or typed hex), dark/light scheme, card edge, 3 corner radii, display/body font, poster palette — all client state until Save (`:260-470`).
5. A live contrast panel lists every required pair with its ratio and a ✓/✗, computed by the same `judgeTheme()` the server re-checks; Save is disabled while any pair fails (`:474-509`).
6. New → `POST /api/admin/platform/themes` → `requirePlatformAdmin()`; refuses an id shadowing a built-in (400 "That id belongs to a built-in theme") or an existing custom id (400 "A theme with that id already exists"); `assertThemeReadable(tokens)` re-runs the gate server-side; `saveCustomTheme()` writes a `themes` row (`id,name,description,tokens,enabled,created_by=admin.email,created_at,updated_at`) (`app/api/admin/platform/themes/route.ts:35-51`).
7. Edit → `PATCH /api/admin/platform/themes/:id` → `requirePlatformAdmin()`; 404 distinguishes "Built-in themes are changed in code, not here" from a genuinely missing id (`app/api/admin/platform/themes/[id]/route.ts:36-41`); merges onto the existing row, re-validates contrast, `saveCustomTheme()`.
8. Either way: `recordPlatformAction({action:'theme.create'|'theme.update'|'theme.withdraw'|'theme.restore'})`; `revalidateThemes()` drops the cached list every guest page and every picker reads.
9. A card's own toggle button PATCHes `{enabled: !current}` directly, independent of the editor form (`ThemeStudio.tsx:149-161`).
10. Effect: **withdrawing repaints nothing** — a wedding already on the theme keeps rendering it; **editing an existing theme's tokens repaints every wedding on it**, live, and the console says so above the form before Save.
11. Failure modes: id taken → field-level error under the Id input; any pair under its minimum ratio → Save stays disabled, each failing pair named with the ratio needed; PATCH on a built-in id → 404 "Built-in themes are changed in code, not here"; PATCH on a missing id → 404 "Theme not found".

### W14 · Domains: list, and mark attached by hand

1. `GET /admin/platform/domains` → `listAllDomains()` + org names; the banner text depends on `env.DOMAIN_DRIVER` — `'none'` (what production runs) shows manual-attachment instructions and a count of `status='verified'` rows waiting; anything else says attachment is automatic (`app/admin/platform/domains/page.tsx:20-35`).
2. Table: host, whose (org link), serves (one wedding link, or "every wedding the studio makes" for a null `catalogueId`), status, last-checked + error; a "Mark `<host>` attached" button shows only for `status` in `{verified, failed}` (`:56-90`).
3. `POST /api/admin/platform/domains/:id/attached` → `requirePlatformAdmin()`; domain 404 check; refuses a still-`pending` domain (400 "DNS has not been verified for this domain yet") (`app/api/admin/platform/domains/[id]/attached/route.ts:23-25`); if not already active, `activate(domain)` writes `domains.status='active', error=null` and stamps `catalogues.served_at` for every catalogue the domain covers (`lib/domains/index.ts:67-72`).
4. `recordPlatformAction({action:'domain.attach', detail:{host,catalogueId}})`.
5. This is the manual half of attachment for `DOMAIN_DRIVER=none`; DNS **verification** ("Check DNS") is a studio-side action (`lib/domains/index.ts:checkAndAdvance`), never a platform one — the platform only ever turns `verified`/`failed` into `active`.
6. Failure modes: domain not found → 404; not yet verified → 400 (the button is only shown for verified/failed rows, so this mostly guards a direct API call); no email is sent to the studio either way when attachment completes.

### W15 · Health (D-40)

1. `GET /admin/platform/health[?fresh=1]` → `probeAll({fresh})` runs all ten probes (each 3-second-budgeted, remembered 60 seconds unless `fresh=1`), then `summarise()` for the header dot (`app/admin/platform/health/page.tsx:16-42`; `lib/health/probes.ts:229-254`).
2. Ten rows, each a coloured dot (ok/warn/down/unconfigured), a label, a one-sentence detail, elapsed ms and a checked-at time: Database, Bunny Stream, Bunny Storage, Photo CDN, Resend, Notification queue, Transcode pipeline, Scheduled jobs, Synthetic guest path, Custom domains (`probes.ts:69-226`).
3. "Scheduled jobs" checks `latestJobRuns()` against the fixed `JOBS` list — notify/15 min, synthetic/60 min, reconcile/usage/lifecycle/warnings each once a day (`lib/jobs/run.ts:49-56`) — marking a job `warn` if it has never run, `down` if its last run failed, `warn` again if it is more than 1.5× its own cadence overdue (`probes.ts:165-193`).
4. "Synthetic guest path" reads the newest `job='synthetic'` run's own `detail.steps` and names the first that failed (`:195-206`) — the one row reporting on another system's correctness (can a guest actually press play) rather than this app's uptime.
5. Purely read-only: no writes, no audit rows. Failure mode: not a platform admin → 404.

### W16 · Audit trail

1. `GET /admin/platform/audit` → `listPlatformAudit({limit:200})`, newest first (`app/admin/platform/audit/page.tsx:9-13`).
2. Table: when, who, action, org, detail (`reason` pulled out as its own line, everything else JSON-stringified) (`:29-63`).
3. The only page with no write of its own, and the only place every other workflow's `recordPlatformAction` call is ever read back in full — no search, filter, export, or pagination past 200 rows.

## 5. Data model touched

| Table.column | Written by (platform scope) | Migration |
|---|---|---|
| `platform_admins.id, email, name, created_at` | W1 (`scripts/create-platform-admin.ts`, direct REST insert — not through the app's `Repository`) | `0004_partners.sql:35-40` |
| `orgs.id, name, slug, kind='partner', locale, branding, created_at` | W4 `createStudio` | `0001_initial_schema.sql:12-17` (base columns); `kind` added `0004_partners.sql:17-22` |
| `orgs.status` (`active`/`suspended`) | W5 `setOrgStatus` — the only place in the product that writes it | `0010_platform_writes.sql:11-13` |
| `platform_audit.*` | Every write workflow (W4–W8, W11–W14) via `recordPlatformAction` | `0010_platform_writes.sql:15-28` |
| `operators.id, org_id, email, name, role, password_hash, created_at` | W4, W8 `createOperatorFor` | `0001_initial_schema.sql:20-28` |
| `credential_links.*` | W4, W8 (`set-password`, via `sendCredentialLink`) | `0017_credentials.sql:10-` |
| `credits.*` | W4 (opening credits) and W7 (grant) — never consumed or revoked from this scope | `0021_credits.sql:7-21` |
| `entitlements.org_id, storage_gb` | W6 `setOrgStorageQuota` (upsert on set, delete on clear) | Table `0006_entitlements.sql:29-53` (provisioned with **"nothing writes these rows yet"**, `:8-11`); N-27b (8 Sept) is the first code that ever does |
| `catalogues.included_until` | W11 term | `0001_initial_schema.sql:65` |
| `catalogues.sub_status` | W11 term (conditionally, to `'active'`) | `0001_initial_schema.sql:66-67` |
| `catalogues.status` (`draft`/`published`/`archived`) | W12 offline/online | `0001_initial_schema.sql:59` |
| `themes.id, name, description, tokens, enabled, created_by, created_at, updated_at` | W13 create/edit/withdraw | `0019_themes.sql:8-19` |
| `domains.status='active', error=null` | W14 attach (via `activate`) | Table `0023_domains.sql:7-20` |
| `catalogues.served_at` | W14 attach (stamped by `activate`/`stamp` for every catalogue the domain covers) | `0023_domains.sql:26-29` |
| `job_runs.*` | **Not** written by anything in this scope — written by the six `/api/cron/*` route handlers via `runJob` (`lib/jobs/run.ts:18-29`, out of scope's file list); only *read* here, by W15 | `0022_job_runs.sql:6-14` |
| `notifications.*` (`template='credential'`) | W4, W8 (queued by `sendCredentialLink`, drained elsewhere) | `0009_notifications.sql:11-` |

Every table above carries RLS with no anon policy; every read and write in this scope goes through
the service-role `Repository` and is gated by `requirePlatformAdmin`/`getPlatformAdmin` in code —
there is no `org_id` to scope by, which is the design (`lib/admin/platform.ts:9-26`).

## 6. Configuration

All read in `lib/env.ts` except where noted.

| Variable | Effect on this subsystem |
|---|---|
| `AUTH_DRIVER` (`local` \| `supabase`) | **Decides whether this whole surface can be reached at all.** `SupabaseAuthProvider.currentUser()` authenticates directly against Supabase (`lib/admin/auth-supabase.ts:47-53`), so `getPlatformAdmin()` works independently of any `operators` row. `LocalAuthProvider.currentUser()`/`signIn()` both require an `operators` row to return anyone (`lib/admin/auth-local.ts:23-38`) — a platform admin cannot authenticate on the local/memory driver under any circumstances. |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY`/`SUPABASE_SERVICE_ROLE_KEY` | Used directly (not through `lib/env.ts`) by `scripts/create-platform-admin.ts:33-47` to create the auth account and the `platform_admins` row; also the credential the app's own Supabase repository uses for every read/write in this scope. |
| `DATA_DRIVER` (`memory` \| `file` \| `supabase`) | The repository behind every read and write here; the Database health probe reports `ok` with "nothing remote to reach" on anything but `supabase` (`lib/health/probes.ts:71-73`). |
| `CAPTCHA_DRIVER`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The same challenge as any sign-in, owed after 3 failures on the shared `/login` route (`app/api/admin/session/route.ts:53-58`). |
| `VIDEO_DRIVER`, `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY` | The Bunny Stream health row; `unconfigured` unless `VIDEO_DRIVER=bunny` with both keys set (`lib/health/probes.ts:82-96`). |
| `PHOTO_DRIVER`, `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_PASSWORD`, `BUNNY_STORAGE_REGION`, `BUNNY_PHOTO_CDN_HOSTNAME` | The Bunny Storage and Photo CDN health rows (`probes.ts:105-126`). |
| `NOTIFY_DRIVER`, `RESEND_API_KEY` | The Resend health row (`probes.ts:128-139`), and whether the `credential` emails W4/W8 queue ever actually leave (drained by infrastructure out of this scope). |
| `RECONCILE_STALL_MINUTES` (default 120) | The threshold the Transcode-pipeline health row uses to call a title "stuck" (`probes.ts:156-163`). |
| `DOMAIN_DRIVER` (`none` \| `fake` \| `vercel`) | Decides the Domains page's banner copy and whether "Mark attached" (W14) is the only path to `active` at all — production runs `none` (per `docs/NEXT.md`), so it always is. Also read by the Custom-domains health row to decide whether "verified and waiting" is a `warn` (`probes.ts:208-226`). |
| `CRON_SECRET` | Bearer for the six `/api/cron/*` routes that write `job_runs`, which the Scheduled-jobs health row reads — entirely separate from `platform_admins` authentication. |
| `ROOT_DOMAIN`, `TENANCY_MODE` | Every guest URL printed on the org and catalogue pages (`publicUrlOf`), and why `/admin/platform/**` is never rewritten by the tenant middleware — `admin` is on `RESERVED_SUBDOMAINS` and path-mode only rewrites a recognised tenant path (`middleware.ts:20-58`; `lib/schema.ts:80-94`). |
| `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` | Written **by** `scripts/create-platform-admin.ts` into `.env.platform.local` for a human to move into a password manager — not part of the validated `lib/env.ts` schema, and nothing in the app ever reads them back. |

## 7. Gaps and rough edges

Missing or half-built

1. **This surface has no positive end-to-end test.** The only E2E assertion is the negative one — an ordinary operator gets a 404 (`e2e/admin.spec.ts:62-70`) — and it cannot be otherwise: the local/memory auth driver has no way to authenticate a platform admin at all (`lib/admin/auth-local.ts:23-38`), so every positive path in this map is unit-tested against a stub authenticator and has only ever been walked for real in production (`docs/PROGRESS.md:1884,2032-2041`).
2. **No impersonation / "sign in as this studio" for support**, deliberately — doc 15 §1 keeps the console read-mostly and `docs/REQUIREMENTS.md:27` names "never impersonate without a trail" as a requirement rather than a built control. Still true: nothing in this scope creates a session for anyone but the admin's own account.
3. **No revenue, cost, or platform-wide storage-usage figure anywhere.** The dashboard shows counts and a credit total, never a ₹ amount or a GB total across studios (`app/admin/platform/page.tsx:52-63`); `docs/PRODUCT.md:309` and `docs/NEXT.md` (N-82) both still list a cost line as unbuilt.
4. **`plans`/`plan_id` remains completely unused.** The quota route's own comment says so: "`plans` has no rows and nothing in the product consumes a plan id" (`app/api/admin/platform/orgs/[id]/quota/route.ts:19-24`). Tiered plans are still "Proposed" (`docs/PRODUCT.md:307`, N-80) — storage quota (W6) is the only entitlement lever this console actually has.
5. **No "ask for more storage" loop analogous to credits.** Credits have "Ask for a credit" → a deduped notification → a platform grant (studio scope); storage has nothing equivalent — a studio that needs more space has to ask outside the product, and the platform admin sets a number with no request to act on (`docs/PRODUCT.md:306`, N-79).
6. **Credits are permanent inventory; there is no undo.** Quota can be reset to `null` (back to the default), but a mis-keyed credit grant cannot be reduced or revoked anywhere in this scope — the route's own comment treats this as intentional ("a credit a studio was told it had is a promise"), but it also means a typo compounds forever.
7. **A catalogue's audit trail can silently truncate.** `app/admin/platform/catalogues/[id]/page.tsx:32-34` reads the **org's** last 50 platform-audit rows and filters in memory for `detail.catalogueId` — a studio with more than 50 other recorded actions (suspends, quota changes, other weddings' terms) since the one that matters can push it out of the window, with no indication on the page that anything was cut off.
8. **`PlatformNav`'s "My own console" link is dead for the documented normal case.** `components/admin/PlatformNav.tsx:39-41` points at `/admin`, which — for an admin created purely via `pnpm platform:admin` and holding no `operators` row anywhere — immediately bounces back to `/admin/platform` (`app/admin/page.tsx:16-24`). Harmless, but the label promises a destination this admin never has.
9. **Attaching a domain notifies nobody.** `activate()` stamps `catalogues.served_at` and flips the status, but nothing in `lib/domains/index.ts` enqueues an email — a platform admin who marks a domain attached has no built-in way to tell the studio it is done (mirrors the identical gap already on record for the studio-side "Check DNS" flow).
10. **The Scheduled-jobs health row is only as trustworthy as infrastructure outside this scope.** `lifecycle` and `warnings` ride the same GitHub Actions workflow as the studio-facing notification drain, and a public repository's scheduled workflows are disabled after 60 days with no commits — the health page would eventually just report "never run" for two jobs with no code change on either side.
11. **The Custom-domains health row and the Domains page can disagree for up to a minute.** Both independently call `listAllDomains()` and count by status, but the health probe's result is cached for 60 seconds while the Domains page always reads fresh (`lib/health/probes.ts:208-226` vs `app/admin/platform/domains/page.tsx:20-24`) — a platform admin could see a green dot while the table already shows a `failed` row.
12. **The platform can act on an org it did not create.** `createStudio` always writes `kind='partner'`; there is no platform-side way to originate a bare **couple** account — a couple org only ever comes from a studio issuing a sign-in (studio scope) or a couple registering themselves at `/my`. Every control here (suspend, quota, credits, add-operator) works on either kind once the org exists, but none of them can make a couple org exist.

Docs that the code does not match

13. **`docs/PRODUCT.md` §1.1 (lines 70–75) is stale and unmarked as such.** Written before the 12 September "second pass," it still reads: "Tenant management: **Partial** … No suspend, no edit … no plan assignment, no delete"; "User management: **Missing** — No view of operators or couples, no password reset on their behalf"; "Plan and quota assignment: **Missing** — nothing writes one." All three are now wrong or half-wrong: suspend/restore exists and is audited (W5, N-27); a full operator list, add-operator and password-link exists on both the Studios org page and Couples (W8/W9, N-66); **storage quota** assignment exists and writes (W6, N-27b) — only **plan** assignment (a `plan_id`) remains genuinely unbuilt, and the doc's own wording conflates the two. The file's preamble (`:21-26`) says §8 "carries the new rows" for the second pass but never marks §1.1 superseded, so a reader who stops there gets a materially wrong picture of what this console can do.
14. **`docs/spec/16-platform-v2.md` §8's table (`:298-307`) is accurate but incomplete.** It lists the Studios page's writes as create/suspend-restore/quota/grant-credits/password-link/add-operator — correct — but the table predates N-27b by a few days and its prose around it does not call out the storage-quota control specifically; nothing here contradicts the code, it simply shipped after this table was last edited.

## 8. Evidence index

Provisioning and sign-in
- `scripts/create-platform-admin.ts:1-19` design note; `:23-46` env loading and args; `:53-60` password generation; `:62-90` the auth account; `:92-112` the row; `:114-130` handoff.
- `lib/admin/platform.ts:9-26` design note; `:28-34` `getPlatformAdmin`; `:36-44` `requirePlatformAdmin`; `:46-74` `recordPlatformAction`.
- `app/api/admin/session/route.ts:21-41` doc comment and `landingFor`; `:52-69` challenge and rate limits; `:74-80` sign-in and the first (operator) lookup; `:82-109` the second (platform-admin) lookup and response, N-76; `:111-133` the shared refusal and studio/couple success path.
- `lib/admin/auth-supabase.ts:11-21` design note; `:47-53` `currentUser`; `:55-63` `signIn`.
- `lib/admin/auth-local.ts:9-19` design note; `:23-28` `currentUser`; `:30-46` `signIn`.
- `components/auth/LoginForm.tsx:56-57` generic `landing` redirect.
- `lib/schema.ts:404-419` `platformAdminSchema` and its design note.
- `e2e/admin.spec.ts:55-70` the one E2E assertion this surface has.
- `docs/PROGRESS.md:1884` "no E2E" note (N-27); `:2026-2050` the N-76 entry in full.
- `docs/spec/15-partners-and-scale.md:45-55` the `platform_admins`-has-no-org design.

Dashboard
- `app/admin/platform/page.tsx:1-113` in full (design note `:10-17`; guard `:18-21`; reads `:23-34`; stats `:52-63,97-113`; audit list `:71-92`).

Studios and one org
- `app/admin/platform/studios/page.tsx:1-118` in full.
- `components/admin/CreateStudioForm.tsx:1-189` in full.
- `app/api/admin/platform/orgs/route.ts:1-49` in full.
- `lib/admin/platform-accounts.ts:1-25` design note; `:22-25` `unknownPassword`; `:27-63` `createOperatorFor`; `:65-110` `createStudio`; `:112-123` `addOperator`.
- `app/admin/platform/orgs/[id]/page.tsx:1-174` in full (design note `:17-27`; reads `:41-47`; controls `:67-108`; catalogues `:110-147`; audit `:149-170`).
- `components/admin/OrgStatusControl.tsx:1-128` in full.
- `app/api/admin/platform/orgs/[id]/status/route.ts:1-64` in full.
- `components/admin/OrgQuotaControl.tsx:1-113` in full.
- `app/api/admin/platform/orgs/[id]/quota/route.ts:1-66` in full.
- `lib/entitlements.ts:1-31` design notes; `:39-54` `Entitlement`; `:56-88` `resolveLimits`.
- `lib/db/supabase-repository.ts:419-455` `getOrgEntitlement`/`setOrgStorageQuota`.
- `components/admin/OrgCreditsControl.tsx:1-102` in full.
- `app/api/admin/platform/orgs/[id]/credits/route.ts:1-50` in full.
- `lib/admin/credits.ts:16` `MAX_GRANT`.
- `components/admin/OperatorControls.tsx:1-154` in full.
- `app/api/admin/platform/operators/route.ts:1-41` in full.
- `app/api/admin/platform/operators/[id]/password-link/route.ts:1-40` in full.
- `lib/auth/credential-links.ts:89-109` `sendCredentialLink`.

Couples
- `app/admin/platform/couples/page.tsx:1-91` in full.

Catalogues
- `app/admin/platform/catalogues/page.tsx:1-122` in full.
- `app/admin/platform/catalogues/[id]/page.tsx:1-101` in full.
- `components/admin/CatalogueTermControls.tsx:1-177` in full.
- `app/api/admin/platform/catalogues/[id]/term/route.ts:1-64` in full.
- `app/api/admin/platform/catalogues/[id]/offline/route.ts:1-56` in full.
- `lib/schema.ts:58-59` `catalogueStatusSchema`; `:64-68` `subStatusSchema`/`SERVING_SUB_STATUSES`.
- `supabase/migrations/0001_initial_schema.sql:59` `catalogues.status`; `:65-69` `included_until`/`sub_status`/`sub_plan`/`sub_until`.
- `lib/catalogue-cache.ts:83-85` `revalidateCatalogue`.

Themes
- `app/admin/platform/themes/page.tsx:1-39` in full.
- `components/admin/ThemeStudio.tsx:1-63` design note and setup; `:75-161` list panel and toggle; `:163-259` editor shell; `:260-470` form fields; `:472-513` contrast panel and submit; `:519-613` `ThemeSpecimen`.
- `app/api/admin/platform/themes/route.ts:1-65` in full.
- `app/api/admin/platform/themes/[id]/route.ts:1-59` in full.
- `lib/admin/themes.ts:1-24` `assertThemeReadable` in full.
- `themes/contract.ts:63-79` `customThemeSchema`.
- `themes/registry.ts:124-128` `builtInThemes`/`getBuiltInTheme`.
- `themes/resolve.ts:37-39` `revalidateThemes`.
- `supabase/migrations/0019_themes.sql:1-21` in full.
- `scripts/check-contrast.ts:68-82` — confirms `pnpm check:contrast` (CLAUDE.md's enforced rule) holds only the built-in seven to the gate; a platform-authored theme is gated only at write time, in the API route, never in CI.

Domains
- `app/admin/platform/domains/page.tsx:1-104` in full.
- `components/admin/DomainAdmin.tsx:1-39` in full.
- `app/api/admin/platform/domains/[id]/attached/route.ts:1-39` in full.
- `lib/domains/index.ts:67-80` `activate`/`deactivate`; `:101-128` `checkAndAdvance` (the studio-side counterpart).
- `supabase/migrations/0023_domains.sql:1-29` in full.

Health and jobs
- `app/admin/platform/health/page.tsx:1-92` in full.
- `lib/health/probes.ts:1-256` in full (every `probe*` function and `probeAll`/`summarise`).
- `lib/jobs/run.ts:1-57` in full.
- `app/api/health/route.ts:1-23` the shallow, public, unauthenticated counterpart this page is not.
- `supabase/migrations/0022_job_runs.sql:1-17` in full.
- `.github/workflows/notify-drain.yml:1-31` (the `lifecycle`/`warnings` steps riding the same schedule as the studio-facing drain); `.github/workflows/synthetic-check.yml:1-45`.
- `vercel.json` — the two Hobby-plan cron slots (`reconcile`, `usage`), confirming why the other four jobs run from GitHub Actions instead.

Audit
- `app/admin/platform/audit/page.tsx:1-68` in full.
- `lib/schema.ts:207-223` `platformAuditSchema` and its design note.
- `supabase/migrations/0010_platform_writes.sql:1-28` in full.
- `lib/db/repository.ts:70-99,101-126,166-219` the `Repository` interface's platform-relevant slice (orgs/operators, platform audit, custom themes, platform admin, entitlements).
- `lib/db/memory-repository.ts:175,194,202,236,242,268,282,305,314,323,342,361,407,411,415,425,429,459,463,632,637,698` — the in-memory implementation of every method this scope calls.
- `lib/db/supabase-repository.ts:379,419,428,636,650,685,698,715,766,817,905,915,1042,1059,1062,1071,1157,1167,1172,1193-1195,1199,1289,1295,1374,1815,1857` — the Supabase implementation of the same.

Cross-subsystem (read for context, not modified)
- `lib/admin/session.ts:1-66` `requireOperator` and the suspension choke point.
- `app/admin/page.tsx:1-40` the platform-admin bounce (`:16-24`) and the suspended-studio screen (`:36-50`).
- `middleware.ts:1-58` confirms `/admin/platform/**` passes through the tenant rewrite untouched.
- `lib/schema.ts:80-94` `RESERVED_SUBDOMAINS` (includes `admin`).
- `lib/http/handler.ts:10,38,51` `route`/`readJson`/`noStore`; `lib/http/errors.ts:29,54` `ApiError`/`errorResponse` — shared infrastructure every route in this scope uses identically.
- `docs/spec/16-platform-v2.md:293-334` §8 (the platform console) and §9 (platform health) in full.
- `docs/spec/15-partners-and-scale.md:38-70` §1 (the isolation design).
- `docs/PRODUCT.md:1-26` header and the second-pass preamble; `:64-78` the stale §1.1 table; `:255-292` §8, the second pass's own rows; `:293-314` §9, the 13 September gaps.
- `docs/REQUIREMENTS.md:27` the platform admin's role, as originally specified.
- `docs/NEXT.md:408-411,509-511` N-27c and the closed N-76 entry.
- `package.json:16-36` `check:contrast`, `verify`, `preflight`, `platform:admin` scripts.
- `.eslintrc.json:16-29` confirms `scripts/**` is exempt from the `no-restricted-properties` rule on `process.env`, which is why `create-platform-admin.ts` reading it directly is not a lint violation.

Tests that exercise this subsystem (for coverage, not evidence of behaviour)
- Unit: `tests/unit/platform-admin.test.ts`, `platform-console.test.ts`, `platform-themes.test.ts`, `platform-writes.test.ts`.
- E2E: `e2e/admin.spec.ts` (one negative assertion only, `:55-70`) — no positive-path E2E exists for this subsystem (see §7 item 1).
