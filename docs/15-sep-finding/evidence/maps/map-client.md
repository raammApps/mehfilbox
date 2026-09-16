# Subsystem map — `client` (the couple's account)

Mapped 15 September 2026 against the code on `main` (HEAD `96fb305`). Where a document and the
code disagree, the code is what is described and the disagreement is listed in §7. Line numbers
refer to the files as read on this date. The studio side of every shared mechanism (handover,
support window, credits, publish) is mapped in `map-studio.md`; this map cross-references its §4
rather than re-deriving the mechanics, and focuses on what is new or different from the couple's
side of the same tables.

---

## 1. Summary

The client subsystem is the couple's own account — org `kind = 'couple'` — everything that exists
so a wedding (or an anniversary, a birthday, a naming day) has a home that outlives the studio that
made it. A couple never registers: their account is always created *for* them, either by a studio
issuing a sign-in (`POST /api/admin/catalogues/:id/couple`) or by a couple claiming a forwarded
handover link (`/claim/<token>`). Once signed in, `/my` lists everything they own or are merely
*linked* to before a handover, `/my/c/<id>` gives a small, couple-vocabulary panel for the things
worth deciding without a studio in the room (the guest code, the letter, which sections show, a
time-boxed window letting the originating studio back in to fix something), and — for any
catalogue they actually **own**, whether self-made or handed over — a "full editor" link drops
them into the *exact same* `/admin/c/<id>/*` console a studio uses: upload, title, customize,
publish behind the same credit gate, and Settings including delete. The couple can also start a
brand-new catalogue of their own (N-73) through the same five-step wizard in its "couple" shape.
Every write is still scoped by `lib/admin/session.ts`'s `org_id`; a couple differs from a studio in
almost nothing structural, only in vocabulary, in the one disjunction `lib/my/session.ts` adds
("mine, or linked to me"), and in the single route that is closed to them (issuing *another*
couple's sign-in).

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Couple account, linked** (a wedding a studio is still preparing; `catalogues.couple_org_id` points at them, `catalogues.org_id` does not) | `getCoupleSession` + `relationOf` → `'linked'` (`lib/my/session.ts:26-30,44-46`) | `/my`, sees the wedding card as "Being prepared by …"; on `/my/c/<id>`: the link/share/download block and the guest code only. |
| **Couple account, owner** (self-made, or handed over — `catalogues.org_id` is theirs) | `relationOf` → `'owned'`; `getEditableCatalogue`/`requireOwnedCatalogue` succeed with `via: 'owner'` exactly as for a studio (`lib/admin/session.ts:69-78,100-112`) | Everything a linked couple sees, plus the letter, section show/hide, the support-window control, **and** the full `/admin/c/<id>/*` console (overview, titles, photos, customizer, settings, domain) for that one catalogue. |
| **Suspended (closed) couple account** (`orgs.status = 'suspended'`, set by `/api/my/close`) | `requireCouple` throws `FORBIDDEN` "This account is closed." (`lib/my/session.ts:36-38`) on any **write**; the **read** paths (`getCoupleSession`, used by every `/my` page) do not check status at all | Every mutation is refused; the read pages are not gated the same way — see §7. |
| **A person holding a forwarded claim link, no account yet** | Unauthenticated; `app/claim/[token]/page.tsx` resolves the token server-side before showing anything | `/claim/<token>` only, until they submit a password and become a couple account. |
| **A person holding a credential link** (forgot-password, or a studio's `set-password` link) | Unauthenticated; `redeemableLink` (`lib/auth/credential-links.ts:74-81`) | `/set-password/<token>` only; the link is single-use regardless of who it was for. |
| **Studio operator, issuing or supporting** | Out of scope here — see `map-studio.md` Actors and its W11/W12 | Can create/link a couple's sign-in (owner only), and, inside an open support window, can edit films/photos/sections/branding/publish on a catalogue the couple now owns. |
| **Platform admin** | No `operators` row; the only party who can grant a credit to a couple-owned catalogue when neither the couple nor (in practice) the studio does | `/admin/platform/orgs/<id>/credits` — outside this scope, cited because it is the sole way a self-made catalogue's credit gate is ever cleared today. |
| **Guest** | Downstream of every decision here: the guest code, the letter, which sections are enabled, and whether the catalogue is still inside `SERVING_SUB_STATUSES` | Not an actor in this file; `lib/catalogue-access.ts` decides what they see. |

## 3. Capabilities

Getting an account (a couple never registers directly — see §7)

- A studio issues a couple's sign-in from the wizard's step 3 or the overview's `CoupleAccountPanel`, three outcomes on one route: link an existing couple org, create one and email a set-password link, or create one and hand the studio a temporary password to read out — `app/api/admin/catalogues/[id]/couple/route.ts:40-135`, `components/admin/CoupleAccountPanel.tsx`. (Studio-side mechanics: `map-studio.md` W11.)
- A couple with no account claims a wedding from a single-use, 14-day link forwarded by the studio; the claim page shows what is being handed over and by whom *before* asking for anything — `app/claim/[token]/page.tsx:17-52`, `components/admin/ClaimForm.tsx`, `app/api/claim/route.ts:42-145`.
- An address that already holds a couple account is **linked**, never duplicated, in both paths — one account per household, however many studios or weddings — `couple/route.ts:53-64`, `claim/route.ts:73-90`.
- A studio's own address is refused as the couple's email, in both paths — `couple/route.ts:56-60`, `claim/route.ts:76-78`.
- The couple org inherits the catalogue's `locale`, not the studio's — `couple/route.ts:86`.

Signing in and credentials (shared door, cross-ref `map-studio.md` W2 for the security mechanics)

- One `/login` page with a Studio/Couple tab that only changes wording — where a signed-in person lands is decided by `orgs.kind`, never by the tab — `components/auth/LoginForm.tsx:23-163`, `app/api/admin/session/route.ts:38-41`.
- A temporary password forces a change screen before anything else opens — `app/login/change-password/page.tsx`, `components/auth/ChangePasswordForm.tsx`.
- **Self-service "Change password" link on `/my/account`** — the couple's account page links to it directly; the studio console has no equivalent link anywhere (`map-studio.md` §7 item 2) — `app/my/account/page.tsx:25-30`.
- Forgot password: one neutral sentence regardless of outcome, a hashed one-hour single-use link — `app/login/forgot/page.tsx`, `components/auth/ForgotForm.tsx`, `app/api/auth/forgot/route.ts`.
- Redeeming a set-password/reset link is identical for a couple or a studio operator; the response names which door to send them back to — `app/api/auth/set-password/route.ts:53-58`.

The couple's home — `/my`

- One page lists every catalogue the account owns or is linked to, across as many studios as apply, each card saying who made it (studio name, or "Made by you") and its state (being prepared / live / paused / not published) — `app/my/page.tsx:29-129`.
- No search, filter or sort — deliberately simpler than the studio's `CatalogueBoard`; a couple's list is a small unfiltered grid.
- "Start a catalogue of your own" — the same wizard, couple-shaped — `app/my/page.tsx:61-66`.
- An operator who lands on `/my` is bounced to `/admin`; a couple who lands on `/admin` is bounced to `/my` — `app/my/page.tsx:32-34`, `app/admin/page.tsx:66`.

Managing one catalogue — `/my/c/<id>`

- The public link, with copy, a pre-filled WhatsApp share text, and (once published) "Download everything" to the guest-facing, no-JS `/c/<slug>/download` page that keeps working through grace and archive — `app/my/c/[id]/page.tsx:72-105`, `app/c/[slug]/download/page.tsx:1-33`.
- Guest code: set, change, or remove, live the instant it saves, available even while the studio still owns the row ("linked") — `components/my/panels.tsx:38-108`, `app/api/my/catalogues/[id]/route.ts:57-62`.
- The letter: rewritten as prose, live, in the couple's own language, with English kept as the fallback a Hindi rewrite never overwrites — **owned only** — `components/my/panels.tsx:110-162`, `app/api/my/catalogues/[id]/route.ts:64-96`, `modules/letter/index.ts:46-56`.
- Sections: shown or hidden without losing their configuration — **owned only** — `components/my/panels.tsx:164-202`.
- The support window: open the originating studio's access for 7 or 14 days, or close it early — **owned, and only when a different org originated it** — `components/my/panels.tsx:204-251`, `app/my/c/[id]/page.tsx:118-120`.
- "Open the full editor" on an owned catalogue — the same customizer route a studio uses — `app/my/c/[id]/page.tsx:97-104`.

Full admin console, for a catalogue the couple owns

- Overview, Titles/upload, Photographs, Customizer and Settings (including a per-wedding custom domain and delete-with-slug-confirmation) are all reachable by a couple who owns the row, through the *exact* routes and components a studio uses — `lib/admin/session.ts:69-120`, `app/admin/c/[id]/page.tsx`, `titles/page.tsx`, `photos/page.tsx`, `customizer/page.tsx`, `settings/page.tsx:12-17`.
- Only four panels are hidden from a couple owner on the overview — Send to couple, issue a sign-in, save as a house style, hand over — gated by `canHandOver = org.kind === 'partner' && via === 'owner'` — `app/admin/c/[id]/page.tsx:74-76,206-243`.
- **Exactly one route in the whole admin API is partner-only**: issuing a couple's sign-in (`couple/route.ts:49-51`). Photos, titles, section/branding autosave, publish, the catalogue PATCH/DELETE, domains, and credit requests are all symmetric by ownership, never by org kind (confirmed by grep — no other `kind === 'partner'` guard exists under `app/api/admin`).
- The publish credit gate applies identically; only the shown copy changes by `audience` — `components/admin/CreditPanel.tsx:12-43`, wired from `org?.kind` in `customizer/page.tsx:63`.

Starting a catalogue of your own (N-73)

- The same five-step wizard, reshaped: occasion asked first, no house-style step, no "the couple's sign-in" step — `components/admin/CreateWizard.tsx:82-83,290-337,697-725`.
- Seven occasions to choose from, two of them ("baby-shower", "naming-day") added specifically for a couple's own use — `lib/schema.ts:45-56`, migration `0025_occasions.sql`.
- Creation writes `orgId = originOrgId = ` the couple's own org, so `relationOf` reports it as `'owned'` immediately — `app/api/admin/catalogues/route.ts:100-148`, confirmed end to end in `tests/unit/couple-catalogues.test.ts:47-94`.
- Upload, titling and customizing run in the identical admin components a studio uses (`UploadManager`, `TitleList`, `CustomizerShell`) once the draft exists.
- Publish is credit-gated exactly as for a studio; a couple's account starts with **zero** credits (no registration grant), so the very first Publish attempt on a self-made catalogue always needs one added first — `tests/unit/couple-catalogues.test.ts:76-93`, `e2e/couple.spec.ts:96-107`.

Closing the account

- `POST /api/my/close` suspends the org (never deletes it), signs the browser out, and queues an internal `ops-alert` email — the catalogues are untouched and keep serving/archiving on their own schedule — `app/api/my/close/route.ts`, `components/my/panels.tsx:253-296`.

## 4. Workflows

### C1 · A studio gives a couple their sign-in (arrival, from the couple's side)

Mechanics of the studio-side call are `map-studio.md` W11; this is what the couple experiences.

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Studio picks "Email them a link" or "Show me a temporary one" and submits | `components/admin/CoupleAccountPanel.tsx:36-58,124-205` | see W11 | `credential` template, only for the link path | Studio sees the field-level error inline; the couple sees nothing yet. |
| 2a | **Link path**: couple opens the emailed URL | `app/set-password/[token]/page.tsx:18-38` → `redeemableLink` | — | — | Expired/spent/garbled token → "This link is no longer valid… Ask for a new one," with a link to `/login/forgot` (`SetPasswordPage:22-34`). |
| 2b | **Temporary path**: studio reads the password out; couple signs in at `/login?door=couple` | `components/auth/LoginForm.tsx` | — | — | Wrong password → "Those details did not work"; three failures and a captcha driver adds a challenge. |
| 3a | Couple sets a password | `components/auth/SetPasswordForm.tsx:12-63` → `POST /api/auth/set-password` | `operators.password_hash` (or the auth driver's own store); `credential_links.used_at` | — | Mismatched confirm field → "The two passwords do not match" (client-side only). |
| 3b | Temporary-password sign-in lands on the forced screen | `app/login/change-password/page.tsx` → `components/auth/ChangePasswordForm.tsx` | `operators.must_change_password = false` | — | — |
| 4 | Landing: `/my`, the wedding shown "Being prepared by `<studio>`" | `app/my/page.tsx:89-96` | — | — | — |

### C2 · Claiming a wedding from a forwarded link (no prior account)

The studio-side generation of the link (`{ email }` body, one live handover per catalogue, the
plaintext URL shown once with Copy) is `map-studio.md` W12 step 2. This is the couple's half,
which that map does not follow through.

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Couple opens `/claim/<token>`, forwarded over WhatsApp with no verifiable sender | `app/claim/[token]/page.tsx:17-52` | — | — | Dead token (missing, already claimed, or past its 14 days) → "This link is no longer valid," no hint which — `getTransferByTokenHash`, `:23-24`. |
| 2 | Page shows *what* is being handed over and *by whom* before any form field, and whether the address already has an account | `:26-29,43-51` | — | — | — |
| 3 | Couple types a name and a password (or, if the address already has an account, just its existing password) and submits | `components/admin/ClaimForm.tsx:33-62,106-155` | — | — | Client requires 12+ chars for a new password; nothing enforced client-side for an existing one. |
| 4 | `POST /api/claim` — rate-limited 10/IP/hour | `app/api/claim/route.ts:42-64` | — | — | 429 "Too many attempts"; dead/expired/claimed token → 404 "This link is no longer valid. Ask for a new one." (one message for all three, `:56-63`). |
| 5a | **Existing couple account**: sign in with the given password, then attach | `:73-90` | see step 6 | — | Address belongs to a studio org → 400 "That address belongs to a studio account"; wrong password → 400 "That is not the password for this account". |
| 5b | **New account**: create the credential first (nothing moves yet), then an `orgs` row (`kind='couple'`) and an `operators` row | `:92-134` | `orgs.id,name,slug,kind,createdAt`; `operators.id,orgId,email,name,role='admin',mustChangePassword=false,passwordHash` | — | <12 chars → 400 "Use at least 12 characters"; auth signUp failure → 400 "Could not create the account… may already be registered" (org rolled back on operator-insert failure, `:118-134`). |
| 6 | `attach()`: snapshot the studio's name onto `branding.presentedBy` if blank, move the row, spend the transfer, drop the guest cache | `:153-179` | `catalogues.org_id ← toOrgId`, `branding` (conditionally), `transfers.claimed_at,claimed_org_id` | `handover` template, to the claiming address, in the catalogue's language — failure is swallowed (`:194-214`) | — |
| 7 | Response carries no session — signing in is a deliberate next step, and Supabase confirmation status is unknown to this route | `:140-143` | — | — | `ClaimForm` shows "It is yours," explicitly signs out whoever else is on the device first (`N-32 §2`, `ClaimForm.tsx:96-102`), then sends them to `/login?door=couple&email=…`. |

### C3 · The support window (from the couple's side)

Mechanics and scoping are `map-studio.md` W12 step 3 and "Where the risk actually is." This adds
the couple's own control surface, which that map only shows from the receiving end.

1. `/my/c/<id>` shows `SupportWindowPanel` only when `relation === 'owned'` **and** the catalogue was made by a different org (`maker && !madeByYou`) — `app/my/c/[id]/page.tsx:118-120`.
2. "Open for 7 days" / "14 days" / "Close now" → `PATCH /api/my/catalogues/:id { supportDays }` — owned only, 403 otherwise ("Your studio is still preparing this one…") — `app/api/my/catalogues/[id]/route.ts:98-104`.
3. Writes `catalogues.support_access_until` = now + N days, or `null` to close — `route.ts:100-104`.
4. While open, `getEditableCatalogue` lets **only the originating studio** (`origin_org_id` match) in, `via: 'support'`; every other studio still 404s — confirmed by `tests/unit/couple-accounts.test.ts:292-303`.
5. Inside the window a studio may fix films/photos/sections/branding and Publish, but the settings route and the transfer route both 404 for it (`requireOwnedCatalogue` refuses `via: 'support'`) — `tests/unit/couple-accounts.test.ts:318-343`.
6. The window also closes on its own once the timestamp passes — no cron needed, it is a comparison at read time (`getCatalogueForSupport …gt('support_access_until', now)`, `lib/db/supabase-repository.ts:1326-1336`).

### C4 · Sign in, forgot, change password

Security mechanics (rate limits, captcha, generic error copy) are `map-studio.md` W2 in full;
only what differs for a couple is repeated here.

1. `/login?door=couple` shows couple-specific copy ("Your studio created this sign-in…") and, unlike the studio tab, no "create an account" link — only "Your studio gives you your sign-in" — `components/auth/LoginForm.tsx:72-81,126-132`.
2. `POST /api/admin/session` is org-kind-blind: it decides the landing (`/my` vs `/admin`) from `orgs.kind` read *after* authentication, never from the door the visitor picked — `app/api/admin/session/route.ts:38-41`.
3. Forgot/reset and change-password are the identical routes and copy as the studio's; `/login/change-password` is reached by anyone with a `mustChangePassword` flag or by a direct link — a couple has no in-app link to it except from `/my/account` (studio operators have none at all).
4. Sign-out clears the shared session cookie regardless of door — `components/admin/UserMenu.tsx:54-59` (reused by `CoupleChrome`).

### C5 · Publish (credit gate), guest-code change, and everything else already documented

For a catalogue a couple owns, Publish/unpublish, the credit gate, section/branding autosave,
upload and titling all run through the identical routes `map-studio.md` documents in W4–W9 —
nothing in those routes branches on org kind (verified by grep: no `kind === 'partner'` guard
exists outside `couple/route.ts`). The only couple-specific surface is the copy: `CreditPanel`'s
`audience='couple'` text ("which your studio can add for you, or we can") — `components/admin/CreditPanel.tsx:38-43`.

### C6 · Guest code change and the sign-out effect (N-71)

1. Two equivalent write paths for the same field: the lightweight `GuestCodePanel` on `/my/c/<id>` (`components/my/panels.tsx:38-108`) and the full `CatalogueSettings` privacy control on `/admin/c/<id>/settings` (owned catalogues only) — both end at `hashSecret`/`passcodeVersion + 1`.
2. `/my` path: `PATCH /api/my/catalogues/:id { passcode }` — allowed for **linked or owned** alike; writes `catalogues.privacy, passcode_hash, passcode_version` scoped to the *actual* owner (the studio's org while linked) — `app/api/my/catalogues/[id]/route.ts:57-62,108`.
3. `/admin` path: `PATCH /api/admin/catalogues/:id { privacy, passcode }` — owned only — same version bump — `app/api/admin/catalogues/[id]/route.ts:112-127`.
4. Either way, every browser holding the old code's grant cookie is refused at the next request: `verifyPasscodeGrant` compares the cookie's stamped version against the live `passcode_version` — `lib/catalogue-access.ts:56-61`; confirmed by `tests/unit/couple-accounts.test.ts:210-221`.
5. Failure modes: code under 4 characters is refused client-side (`minLength`); removing the code with a live grant cookie present still signs everyone out (version still bumps, `route.ts:125-127`); no confirmation step before the "Remove code" button beyond a `window.confirm`.

### C7 · Closing the account

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | `/my/account` → type `close` to confirm | `components/my/panels.tsx:253-296` | — | — | Button stays disabled until the literal word `close` is typed. |
| 2 | `POST /api/my/close` | `app/api/my/close/route.ts:21-49` | `orgs.status = 'suspended'` | `ops-alert` to `SUPPORT_EMAIL`, English, naming the operator and org — failure is only logged (`:40-42`) | Non-couple org → `requireCouple` throws `NOT_FOUND`. |
| 3 | Sign out and redirect | `route.ts:46-48`, `panels.tsx:261-264` | Auth cookies cleared | — | A network failure leaves `busy` stuck true with no error message shown (`panels.tsx:266`). |
| 4 | Catalogues are untouched; guests keep watching (`resolveAccess` never reads org status, only catalogue-level `subStatus`/`includedUntil`) | `lib/catalogue-access.ts:30-63` | — | — | See §7 for the read-side gap this leaves on `/my` itself. |

### C8 · Starting a catalogue of your own, end to end (N-73)

Confirmed as one continuous path by `e2e/couple.spec.ts:80-107` and `tests/unit/couple-catalogues.test.ts:47-113`.

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | `/my` → "Start a catalogue of your own" → `/admin/new` | `app/my/page.tsx:61-66` | — | — |
| 2 | Wizard in couple shape: occasion radio first, then name/date/city | `app/admin/new/page.tsx:16-46`, `CreateWizard.tsx:290-337` | localStorage draft (step 1 only, same limitation as the studio wizard) | Slug taken/reserved → same messages as the studio wizard. |
| 3 | Step 2 "The look": no house-style cards (a couple's org has none), theme + layout only | `CreateWizard.tsx:455,525-585` | — | — |
| 4 | Step 3: no couple-sign-in card (`mode==='couple'` hides it) | `CreateWizard.tsx:697-725` | — | — |
| 5 | `POST /api/admin/catalogues` | `app/api/admin/catalogues/route.ts:100-148` | `catalogues.org_id = origin_org_id = ` the couple's org; `tenant_slug` = their own org slug; everything else identical to a studio's creation | Same validation errors as the studio wizard; nothing here checks org kind. |
| 6 | Upload, title, customize — identical admin components | — | `titles.*`, `photos.*`, `draft_modules`, `draft_branding` | Identical to the studio path. |
| 7 | Publish → credit check finds **zero** credits (no registration grant for a couple org) | `app/api/admin/catalogues/[id]/publish/route.ts` (mechanics: `map-studio.md` W8) | — | 402 `CREDIT_REQUIRED` → `CreditPanel` (`audience='couple'` copy) every time, until someone (the platform, in practice) grants one. |
| 8 | Ask for a credit | `POST /api/admin/credits/request` | `notifications` row, `template='credit-request'`, **to `SUPPORT_EMAIL`** regardless of `audience` | See §7 — the couple's own copy implies the studio can help; the mechanism cannot reach the studio at all. |
| 9 | Once granted (platform action, outside this scope) and published, it appears in `/my` like any other owned catalogue | `app/my/page.tsx` | — | — |

## 5. Data model touched

| Table.column | Written by (client scope) | Migration |
|---|---|---|
| `orgs.id, name, slug, kind='couple', locale, created_at` | C1 (issued), C2 (claimed), C8 (self-made) | `0001_initial_schema.sql`, `0004_partners.sql:17-22` (`kind`), `0013_locale.sql` |
| `orgs.status` (`suspended`) | C7 close — a **second** writer of this column beyond the platform (`map-studio.md` §5) | `0010_platform_writes.sql:11-13` |
| `operators.id (FK auth.users), org_id, email, name, role='admin', must_change_password, password_hash, created_at` | C1, C2 | `0001_initial_schema.sql:20-30`, `0017_credentials.sql:27` |
| `credential_links.*` | C1 (`set-password`), C4 (`reset`) | `0017_credentials.sql:10-23` |
| `catalogues.couple_org_id` | Written only from the studio side (`couple/route.ts:61,109`); **read** throughout this scope to decide `relation` | `0018_couple_accounts.sql:13` |
| `catalogues.support_access_until` | C3 — the *only* writer in the product is the couple's own `PATCH /api/my/catalogues/:id` | `0018_couple_accounts.sql:14` |
| `catalogues.passcode_version` | C6, both write paths | `0018_couple_accounts.sql:15` |
| `catalogues.privacy, passcode_hash` | C6 | `0001_initial_schema.sql:57-59` |
| `catalogues.modules` (letter rewrite, section toggle) | C5/§3 "Managing one catalogue" | `0001_initial_schema.sql:53` |
| `catalogues.draft_modules` | C5 — kept in step with a live edit so a studio's in-flight fix does not restore the old letter (`api/my/catalogues/[id]/route.ts:94-95`) | `0001_initial_schema.sql:56` |
| `catalogues.org_id, origin_org_id` | C2 `attach()` (org_id moves); C8 (both set to the couple at creation) | `0001_initial_schema.sql:36`, `0004_partners.sql:50` |
| `catalogues.occasion` (7-value check) | C8 | `0001_initial_schema.sql:47-48` widened by `0025_occasions.sql` |
| `catalogues.tenant_slug` | C8 (frozen to the couple's own org slug, same rule as a studio) | `0016_tenant_path.sql` |
| `transfers.*` | C2 spent by claim (studio issues it — `map-studio.md` W12) | `0005_transfers.sql:11-41` |
| `credits.*` | C8 step 7 — read only in this scope; consumption is the shared publish route, granting is platform-only | `0021_credits.sql` |
| `notifications.*` | `credential` (C1), `handover` (C2), `ops-alert` (C7), `credit-request` (C8) | `0009_notifications.sql`, `0014_notification_dedupe.sql` |
| `auth.users` (Supabase) | C1 `admin.createUser`; C2 `signUp`; C4 `setPassword` | Supabase-managed |

RLS is enabled on every table with no anon policy (`0002_row_level_security.sql`); every route in
this scope goes through the service-role repository and is scoped in code by
`lib/admin/session.ts` / `lib/my/session.ts`, exactly as on the studio side.

## 6. Configuration

All read in `lib/env.ts`. Only the variables that change *this* subsystem's behaviour are listed;
the full reference table is in `map-studio.md` §6.

| Variable | Effect on this subsystem |
|---|---|
| `AUTH_DRIVER` (`local` \| `supabase`) | Who creates a couple's credential (`admin.createUser` vs a local scrypt hash) and who redeems a credential link. |
| `NOTIFY_DRIVER` (`fake` \| `resend`), `RESEND_API_KEY`, `NOTIFY_FROM` | `credential`, `handover`, `ops-alert` and `credit-request` emails. |
| `SUPPORT_EMAIL` | Recipient of the C7 ops-alert and the C8 credit request — **the only address a self-made catalogue's credit request or a lapsed catalogue's renewal request ever reaches** (see §7). |
| `CAPTCHA_DRIVER`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | The challenge on `/api/admin/session`, shared with the studio door. |
| `ROOT_DOMAIN`, `TENANCY_MODE` | Every printed address, and the `/claim`, `/set-password`, `/my`, `/login` roots themselves — all explicitly reserved in `lib/tenant.ts:120-139` so path-mode's `/<studio>/<wedding>` rewrite never swallows them. |
| `DATA_DRIVER` | The repository behind `listCataloguesForCouple`/`getCatalogueForCouple`/`getCatalogueForSupport` — must behave identically on memory, file and Supabase (the disjunction is repository-level, not SQL-only). |
| `VIDEO_DRIVER`, `PHOTO_DRIVER`, Bunny variables | Upload/photo mechanics for a couple's own catalogue (C8) — identical to the studio path, see `map-studio.md` §6. |
| `CRON_SECRET` | Bearer for `/api/cron/notify`, which drains the `handover`/`credential`/`ops-alert`/`credit-request` queue. |

## 7. Gaps and rough edges

Missing or half-built

1. **There is no direct couple sign-up.** The only registration page in the app is `app/admin/register` and it is partner-only (confirmed by `find app -iname "*regist*"`). A couple's account can only come from a studio's action (issuing a sign-in, or a handover) — which means the couple who wants to "start a catalogue of their own" for a baby shower or naming day (the exact use case N-73 names) can only reach that wizard if a studio has *already* given them an account for an actual wedding first. A couple with no wedding and no studio has no way into the product at all.
2. **Closing an account does not stop reading it.** `requireCouple` (used by every write) refuses a suspended org with "This account is closed" (`lib/my/session.ts:36-38`), but `getCoupleSession` — used by `MyPage`, `MyAccountPage` and `MyCataloguePage` — never checks `orgStatus` (`lib/my/session.ts:26-30`). The close route does sign the browser out immediately, but nothing stops the same person from signing back in (their Supabase credential is untouched) and browsing `/my` read-only forever, which contradicts the panel's own promise: "you stop being able to sign in" (`components/my/panels.tsx:272`).
3. **Every "add capacity" request quietly bypasses the studio, despite the product's own billing model saying the studio is the customer.** A couple's credit request (`CreditPanel` `audience='couple'`, "which your studio can add for you, or we can") and the guest-facing renewal screen's only action (`mailto:${SUPPORT_EMAIL}`, `app/c/[slug]/renew/page.tsx:48-54`) both go **only** to the platform's support inbox — `app/api/admin/credits/request/route.ts` has no path to the originating studio at all. This sits alongside the lifecycle-warning system, which *does* correctly cc the studio (`lib/notify/schedule.ts:124-159`) — so the couple is told "contact your studio" by one message and handed a platform-only mailto by the very next screen.
4. **A self-made catalogue is warned twice at every expiry/grace/archived milestone.** `recipientsFor` (`lib/notify/schedule.ts:128-159`) always treats `catalogues.origin_org_id` as a second party to notify — correct after a handover, but for a catalogue a couple made themselves `origin_org_id === org_id`, so the same operator is pushed into the recipient list twice (once with `role: 'couple'`, once with `role: 'studio'`) and both get queued, because the `dedupeKey` includes `role` (`schedule.ts:108`) and so does not collapse them. The two emails carry identical `params` — nothing in the template varies by role — so it reads as a plain duplicate.
5. **Module `meta.occasions` is decorative.** Every module declares which occasions it suits (e.g. `letter`'s excludes `baby-shower` and `naming-day` — `modules/letter/index.ts:25` — the two occasions N-73 was written for) but nothing reads the field anywhere in `app/`, `components/`, or `modules/registry.ts` (confirmed by grep for `.occasions`). The wizard's default template (`keepsake`, includes a letter) is chosen the same way regardless of occasion, and the customizer's Add-section menu offers every module to every occasion, so the field constrains nothing in either direction.
6. **The transfer/claim endpoints are ownership-scoped, not partner-scoped.** `POST/DELETE /api/admin/catalogues/:id/transfer` call `requireOwnedCatalogue`, with no `org.kind === 'partner'` check (contrast `couple/route.ts:49`, which does check). No UI ever exposes this to a couple (`canHandOver` hides the panel for `kind !== 'partner'`), but a couple who owns a catalogue could, by calling the API directly, generate a working 14-day claim link for **any** email address and hand their own wedding away — the `direct: true` shortcut is separately blocked (it requires `coupleOrgId`, which is null for a self-made or already-couple-owned row), but the email-link path is not.
7. **Two ways to change the guest code, slightly different reach.** `/my`'s `GuestCodePanel` works for `linked` **or** `owned`; `/admin/c/<id>/settings`'s privacy control only works for `owned` (`requireOwnedCatalogue`). Functionally consistent (both bump `passcode_version` the same way), but it means a linked couple who wants to also change, say, the timezone or premiere date has no path to Settings until the handover, even though they can already touch the passcode on the same row.
8. **No partial failure surfaced on close.** If `POST /api/my/close` fails at the network level, `CloseAccountPanel` sets `busy` back to `false` and shows nothing else (`components/my/panels.tsx:266-267`) — a silent no-op rather than a retry prompt.
9. **`operators.role` is meaningless here too.** A couple operator is always created with `role: 'admin'` (`couple/route.ts:98`, `claim/route.ts:124`) and there is no second couple-side operator or invite flow of any kind — one email per household account, always admin, matching the studio side's identical gap (`map-studio.md` §7 item 1).

Docs that the code does not match

10. `docs/spec/16-platform-v2.md:116-117` — already flagged in `map-studio.md` §7 item 22 for the studio side; from the couple's side the same correction applies: the couple's sign-in is issued from the **overview**, not "the catalogue's settings," and the couple never sees a "settings" framing for it at all.
11. `docs/spec/16-platform-v2.md:158-159` — already flagged in `map-studio.md` §7 item 23. Confirmed again from this side: `ClaimForm` and `/api/claim` exist purely for the case where **no** linked account was made in advance; under the current wizard (couple email collected up front, D-37) the emailed-link path (C1) is now the common case and the claim path (C2) is what fires only when a studio skipped that step or the account predates it.
12. `docs/PRODUCT.md` describes a couple's account only in aggregate ("their own account," §1/§8-adjacent sections) and does not mention that an owned catalogue grants the couple the **entire** studio console minus four panels — which is the single largest fact about this subsystem's actual shape and is not written down anywhere outside the code and its tests (`tests/unit/couple-accounts.test.ts:318-343`).

## 8. Evidence index

The couple's account, home, and one catalogue
- `app/my/layout.tsx:1-23`; `app/my/page.tsx:29-129`; `app/my/account/page.tsx:1-37`; `app/my/c/[id]/page.tsx:1-124`.
- `components/my/CoupleChrome.tsx:1-41`; `components/my/panels.tsx:1-297` (GuestCodePanel 38-108, LetterPanel 110-162, SectionsPanel 164-202, SupportWindowPanel 204-251, CloseAccountPanel 253-296).
- `lib/my/session.ts:1-60`.
- `app/api/my/catalogues/[id]/route.ts:1-118`; `app/api/my/close/route.ts:1-50`.

Getting an account: issued, or claimed
- `app/api/admin/catalogues/[id]/couple/route.ts:40-135`; `components/admin/CoupleAccountPanel.tsx:1-205`.
- `app/claim/[token]/page.tsx:1-52`; `components/admin/ClaimForm.tsx:1-155`; `app/api/claim/route.ts:1-215`.
- `app/api/admin/catalogues/[id]/transfer/route.ts:1-172` (handover mechanics, cross-ref only).
- `app/api/admin/catalogues/[id]/deliver/route.ts:1-59`.

Credentials, shared with the studio door
- `app/set-password/[token]/page.tsx:1-38`; `components/auth/SetPasswordForm.tsx:1-105`.
- `app/login/page.tsx:1-33`; `app/login/forgot/page.tsx:1-14`; `app/login/change-password/page.tsx:1-18`.
- `components/auth/LoginForm.tsx:1-163`; `components/auth/ForgotForm.tsx:1-67`; `components/auth/ChangePasswordForm.tsx:1-106`.
- `app/api/admin/session/route.ts:1-140`; `app/api/auth/set-password/route.ts:1-60`; `app/api/auth/forgot/route.ts:1-56`; `app/api/auth/change-password/route.ts:1-60`.
- `lib/auth/credential-links.ts:1-109`.

Authorisation, shared with the studio side
- `lib/admin/session.ts:1-120` (`getOperatorSession` 17-38, `requireOperator` 53-66, `requireOwnedCatalogue` 69-78, `getEditableCatalogue`/`requireEditableCatalogue` 93-120).
- `lib/db/repository.ts:263-289,346-354` (interface); `lib/db/supabase-repository.ts:1295-1336,1634-1646` (implementation of the couple/support disjunction and `transferCatalogue`).
- `lib/catalogue-access.ts:1-89`.

The full console reached through ownership
- `components/admin/AdminChrome.tsx:26-110` (`orgKind` rail branch 57-74).
- `app/admin/c/[id]/page.tsx:1-278` (`canHandOver` 74-76, banner 107-115, hidden panels 206-243).
- `app/admin/c/[id]/titles/page.tsx:1-40`; `app/admin/c/[id]/photos/page.tsx:1-40`; `app/admin/c/[id]/settings/page.tsx:1-50`; `app/admin/c/[id]/customizer/page.tsx:1-45`.
- `app/api/admin/catalogues/[id]/route.ts:1-197` (support-field split 93-103).
- `components/admin/CreditPanel.tsx:1-71`; `app/api/admin/credits/request/route.ts:1-59`; `app/api/admin/credits/route.ts:1-19`.
- `components/admin/UserMenu.tsx:1-119`; `components/admin/PublicLink.tsx:1-40`.

Starting a catalogue of your own
- `app/admin/new/page.tsx:1-46`; `components/admin/CreateWizard.tsx:1-90,280-350,440-595,690-740` (mode-specific lines: 63,83,90,290-337,697-725; default template 101).
- `app/api/admin/catalogues/route.ts:1-159`.
- `lib/schema.ts:44-56` (occasions); `modules/letter/index.ts:1-64`; `modules/contract.ts:23`.

Lifecycle, renewal, downloads (cited, mostly out of scope)
- `lib/notify/schedule.ts:1-163`; `lib/lifecycle.ts` (recipient/queue logic); `lib/notify/templates.ts:1-30`.
- `app/c/[slug]/renew/page.tsx:1-59`; `app/c/[slug]/download/page.tsx:1-60`.
- `middleware.ts:1-58`; `lib/tenant.ts:118-160` (`RESERVED_PATH_ROOTS`, `parseTenantPath`).

Data model
- `supabase/migrations/0001_initial_schema.sql:12-73`; `0004_partners.sql:17-22,50`; `0005_transfers.sql`; `0009_notifications.sql`; `0010_platform_writes.sql:11-13`; `0013_locale.sql`; `0016_tenant_path.sql`; `0017_credentials.sql`; `0018_couple_accounts.sql`; `0021_credits.sql`; `0025_occasions.sql`.

Tests consulted directly (not just listed for coverage)
- `tests/unit/couple-accounts.test.ts:1-360` (full read of describe blocks 133-360); `tests/unit/couple-catalogues.test.ts:1-115` (read in full); `tests/unit/transfer.test.ts` (`it` list only); `tests/unit/credential-links.test.ts` (`describe` list only).
- `e2e/couple.spec.ts:1-108` (read in full).

Docs consulted
- `docs/spec/README.md`; `docs/spec/13-agent-runbook.md`; `docs/spec/16-platform-v2.md:102-171` (D-37, §6, §3); `docs/PRODUCT.md`; `map-studio.md` §4 (W11, W12), §5, §7 items 1,2,22,23.
