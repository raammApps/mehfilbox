# Subsystem map — `auth-security`

Mapped 16 September 2026 against the code on `main` (HEAD `96fb305`). Where a document and the
code disagree, the code is what is described and the disagreement is called out. Line numbers
refer to the files as read on this date.

---

## 1. Summary

Authentication and security is the choke-point layer every other subsystem calls through rather
than reimplements. Three questions are answered here, once each: *who is this* (two swappable
`AuthProvider` drivers behind one interface — a signed cookie over an app-held scrypt hash, or
Supabase Auth — `lib/admin/auth-provider.ts:24-67`, `lib/admin/auth.ts:11-15`); *what org may they
touch* (`lib/admin/session.ts`, the only place `org_id` enters a query, per CLAUDE.md's own framing
of it); and, for the actors who never hold an `operators` row at all, *what a guest's cookie proves*
(a passcode grant, a signed video token, or — today — an unsigned photograph URL,
`lib/catalogue-access.ts`, `lib/downloads.ts`). A fourth identity, the platform admin, is kept
structurally outside the first two: a separate `platform_admins` table with no `org_id` and no code
path that converts an operator into one (`lib/admin/platform.ts`). Every admin API route reaches its
data through one of three functions in `session.ts`; every guest route reaches its catalogue through
one function in `catalogue-access.ts`; Postgres Row Level Security stands behind both as a backstop
that the app's own service-role key deliberately bypasses. The credential-issuance pattern (an
unguessable password nobody is told, a hashed single-use link, or two dictionary words and four
digits shown once) is written once and reused by registration, a studio issuing a couple's sign-in,
and the platform creating an operator — no caller invents its own. Three concrete weaknesses sit in
production today, all named in `docs/NEXT.md` and none secret: photographs are unsigned on a public
pull zone (N-83), the guest passcode currently grants downloads that Sandeep's own rule (D-43) says
should require a signed-in account (N-85), and the rate limiters/lockouts live in one Vercel
instance's process memory with no `Content-Security-Policy` behind them (N-86). Everyone who signs
in — a studio operator, a couple/client account, a platform admin — and everyone who does not — a
guest with a link, a script probing any of the above — is inside this subsystem's threat model.

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Guest** (no account) | No identity at all; `resolveAccess`/`requireServableCatalogue` decide purely from cookies (`lib/catalogue-access.ts:30-64`) | A published, premiered, non-lapsed catalogue; a `passcode` cookie unlocks a passcode-privacy one; today the same cookie is also sufficient to pull the download manifest (N-85, §7). |
| **Studio operator** (`operators.role` admin/uploader, org `kind='partner'`) | `requireOperator()` → `OperatorSession` (`lib/admin/session.ts:53-66`) | Everything scoped to its own `org_id`; a handed-over wedding only inside a support window opened by the couple (`session.ts:93-120`). |
| **Couple / client account** (org `kind='couple'`) | Same `operators` row shape, same session primitives, gated by org kind — no separate identity system (`lib/my/session.ts:21-40`) | Catalogues it owns, plus ones linked before handover (`relationOf`, `lib/my/session.ts:46-48`); may rewrite its own passcode, letter, section visibility and the studio's support window (`app/api/my/catalogues/[id]/route.ts:18-62`). |
| **Platform admin** | No `operators` row at all — a disjoint `platform_admins` table (`supabase/migrations/0004_partners.sql:35-44`), read by `getPlatformAdmin`/`requirePlatformAdmin` (`lib/admin/platform.ts:28-44`) | Everything under `/admin/platform`; every write is audited (`recordPlatformAction`, `platform.ts:56-74` → `platform_audit`, `0010_platform_writes.sql:15-31`). Signs in through the same door and the same `POST /api/admin/session` as everyone else. |
| **Suspended org** (operator or couple) | Session still mints; `requireOperator`/`requireCouple` throw `FORBIDDEN` (`session.ts:62-64`, `lib/my/session.ts:34-36`) | May still change its own password — `getOperatorSession` rather than `requireOperator` is used deliberately in that one route (`app/api/auth/change-password/route.ts:26-32`). |
| **Script / attacker** — the threat model the rest of this file is written against | Not a code actor; the subject of the rate limiters, captcha, hashing, signed URLs, and the gaps in §7 | Exactly what §7 leaves open. |

## 3. Capabilities

**Identity & session**

- One swappable interface over "who is this" — `currentUser`, `signIn`, `signOut`, `signUp`, `createUser`, `setPassword` — with a `local` driver (signed cookie over an app-held scrypt hash) and a `supabase` driver (Supabase Auth; the publishable key for the signed-in client, the service-role key only for the two admin-only operations), switched once on `AUTH_DRIVER` behind a `globalThis` symbol — `lib/admin/auth-provider.ts:24-67`, `lib/admin/auth.ts:7-15`, `lib/admin/auth-local.ts:20-74`, `lib/admin/auth-supabase.ts:22-130`.
- HMAC-SHA256-signed, stateless session cookie (`mehfilbox_session`, 12h TTL) carrying `sub`/`orgId`/`exp`, verified with `timingSafeEqual` against a forged signature — no session table, so an edge deploy needs no round trip — `lib/auth.ts:17-66`.
- The Supabase driver's `currentUser()` revalidates against the auth server (`auth.getUser()`) rather than trusting the cookie's own claim — `lib/admin/auth-supabase.ts:47-53`.
- Authentication (which user) and authorization (what org) are two different files on purpose: `AuthProvider` only ever answers "which user"; `lib/admin/session.ts` is the sole place `org_id` enters a query, so swapping the authenticator can never widen anyone's reach — `lib/admin/auth-provider.ts:12-16`, `lib/admin/session.ts:8-20`.
- Passwords and passcodes hashed with scrypt (32-byte key, random 16-byte salt, `scheme$salt$key` at rest, constant-time compare); deliberately **not** `server-only`, unlike its sibling `lib/auth.ts`, so seed/rotate scripts can hash outside Next's server context — `lib/crypto.ts:1-33`.
- A couple's account is not a separate identity system — it is an `operators` row like a studio's, gated on `org.kind === 'couple'`, built entirely on `getOperatorSession`/`getSessionOrg` — `lib/my/session.ts:21-40`.

**Registration & credential issuance**

- Public self-registration mints the credential through the same swappable `AuthProvider.signUp`, org-scoped access granted second and separately — `app/api/partners/route.ts:54-98` (route itself out of primary scope; cited for the auth call), interface at `lib/admin/auth-provider.ts:41-51`.
- **One credential-issuance pattern, reused three times, never invented per caller**: an unguessable 32-byte password nobody is told, `AuthProvider.createUser` (confirmed, no confirmation email), a 14-day single-use SHA-256-hashed link mailed to the real owner — used by a studio issuing a couple's sign-in and by the platform creating a studio or adding an operator — `lib/auth/credential-links.ts:39-109`, `lib/admin/platform-accounts.ts:22-63`.
- A temporary password a studio can read aloud across a table: two Hindi-spellable words plus four digits, over 60 bits, flagged `mustChangePassword` so it survives exactly one sign-in — `lib/auth/credential-links.ts:29-42`.
- Credential links are single-use and expiring, hashed at rest like a handover token (`lib/schema.ts:389-391` cites the parallel explicitly), redeemed through one endpoint regardless of who issued them — `lib/auth/credential-links.ts:44-81`, `app/api/auth/set-password/route.ts:29-59`.
- Forgot-password answers one sentence for every address, known or not; the rate limiters silently stop **sending** rather than refuse the request, so the HTTP response can never become an enumeration oracle — `app/api/auth/forgot/route.ts:29-56`.
- Self-service password change: the old password is required unless `mustChangePassword` is set, verified via `signIn` against a throwaway `NextResponse` so a wrong guess sets no cookie anywhere — `app/api/auth/change-password/route.ts:29-59`.
- A third bearer-token pattern, same shape again: a wedding handover claim (`transfers.token_hash`, SHA-256, one live transfer per catalogue enforced by a partial unique index) — `supabase/migrations/0005_transfers.sql:11-39`.

**Lockouts & captcha**

- In-process fixed-window limiter (`Map<string, {count, resetAt}>`), opportunistic eviction past 5000 keys, explicitly documented in its own header as per-instance and therefore approximate across more than one Vercel instance — `lib/http/rate-limit.ts:1-41`.
- Sign-in: 5 attempts per address / 10 per IP per 15 minutes, **both** buckets must allow; a captcha challenge is owed after 3 prior failures on either, when a driver is configured; success resets both — `app/api/admin/session/route.ts:33-69,119-120`.
- Passcode gate: 5 attempts per device per catalogue, 30 per catalogue across every device, 15-minute lockout, challenge after 3 device failures — `app/api/passcode/route.ts:21-58`.
- Forgot-password: 3 per address / 5 per IP per hour, both must allow before anything is even looked up — `app/api/auth/forgot/route.ts:25-27,34-37`.
- Set-password (redeem a link): 10 per IP per hour — `app/api/auth/set-password/route.ts:26-34`. Change-password (self-service): 10 per IP per 15 minutes — `app/api/auth/change-password/route.ts:34-37`.
- Playback-token minting: 60 per IP per catalogue per 60s — `app/api/playback/token/route.ts:29`.
- Captcha is a three-driver seam (`none`/`fake`/`turnstile`) behind one `verifyCaptcha`, a **second** layer over the limiters rather than a replacement — a Turnstile network failure counts as a refusal, never a silent pass — `lib/captcha/verify.ts:16-61`, `lib/captcha/config.ts:5-22`.
- Every response that will need a challenge next time says so in its own body (`challenge: true`), so a client shows the widget *before* the next failed attempt rather than after it — `lib/http/errors.ts:33-46`, `app/api/admin/session/route.ts:113-116`.

**Guest access & the passcode gate**

- Single chokepoint for every guest request: `resolveAccess`/`requireServableCatalogue` — a lapsed subscription is checked **before** publish state (so it always shows a renewal screen, never anything that reads as "gone"), the `includedUntil` date is checked independently of `subStatus` and compared as a date string, draft is a `draft` verdict rather than a 404, a future `premiereAt` gates behind a countdown *before* the passcode is even checked, and the passcode is the last gate — `lib/catalogue-access.ts:30-88`.
- Passcode grants are signed, stateless tokens exactly like the session cookie, carrying the catalogue id and the `passcodeVersion` in force when the code was accepted; changing the code bumps the version and every existing grant — anyone's, anywhere — stops matching. Nothing to enumerate, nothing to revoke individually — `lib/auth.ts:81-114`.
- A passcode change or removal always bumps `passcodeVersion`, from either side that may hold the code: the studio's settings screen and the couple's own account — `app/api/admin/catalogues/[id]/route.ts:112-127`, `app/api/my/catalogues/[id]/route.ts:57-62`.
- Passcode verification is a constant-time compare against a stored scrypt hash; a missing catalogue and a wrong code answer identically ("That passcode did not work") — `app/api/passcode/route.ts:60-68`.

**Video & photo delivery — what is signed, what is public**

- Film playback and posters: Bunny "directory" token auth — `token = base64url(sha256(key + "/" + providerId + "/" + expires))` signs the **whole rendition tree** under one guid rather than a single file, specifically because HLS immediately fetches child playlists and segments that a file-scoped token would 403 — `lib/video/bunny.ts:96-148`.
- Upload tickets are themselves pre-signed for Bunny's TUS endpoint (`sha256(libraryId + apiKey + expiry + videoId)`), so the account API key never reaches the browser — `lib/video/bunny.ts:62-93`.
- A playback token is bound to catalogue **and** title (`scope`), enforced by checking the catalogue actually owns the title before minting, so a leaked token for one film cannot fetch another — `lib/video/provider.ts:80-88`, `app/api/playback/token/route.ts:31-48`.
- Bunny's transcode webhook is verified with HMAC-SHA256 over the **raw** body, keyed by the library's read-only key, `timingSafeEqual` compare, fails closed (a title just never leaves `processing` until the nightly reconcile job) — `lib/video/bunny.ts:264-296`.
- `pnpm preflight` asserts the video pull zone actually **enforces** the token (not merely that a key is set), that IP pinning is off (Indian mobile IPs rotate mid-playback) and that `BlockNoneReferrer` is off (native HLS sends no referrer) — `scripts/preflight.ts:209-281`.
- Photographs have no equivalent: `getPhotoUrl` returns a bare public URL on the pull zone — no token, no expiry, no signature — `lib/photos/bunny.ts:34`. Confirmed live against production 13 September and re-confirmed against this code on 16 September. This is N-83, detailed in §7.

**Downloads**

- One manifest of signed links rather than a server-assembled zip — a 40GB archive built inside a serverless function does not work — `lib/downloads.ts:57-115`.
- Downloads survive a lapsed subscription and an archived catalogue, deliberately a **different** rule from guest viewing: "nothing is ever deleted" has to remain true after a plan lapses — `lib/downloads.ts:29-37,46-51`.
- Today the download gate is *exactly* the passcode gate (`resolveDownloadAccess`, not `resolveAccess`, but the same `verifyPasscodeGrant` call): anyone who can view the page can pull every original file via 6-hour signed links — `lib/downloads.ts:38-55`. Sandeep's own rule (D-43) says this should require the client's sign-in; it does not yet. This is N-85, detailed in §7.

**Authorization chokepoints**

- `requireOperator()` is the only path that turns an authenticated user into a scoped session; it enforces org suspension at the same choke point, refusing reads as well as writes — `lib/admin/session.ts:53-66`.
- `requireOwnedCatalogue`/`getEditableCatalogue`/`requireEditableCatalogue` are, by the file's own comment, the only two authorization shapes in the product: strictly owned (`org_id` from the session; another org's row 404s, never 403s, so its existence is never confirmed), or owned-**or**-in-an-open-support-window — `lib/admin/session.ts:68-120`; the support-window query (`origin_org_id = orgId AND org_id != orgId AND support_access_until > now()`) confirmed at `lib/db/supabase-repository.ts:1326-1336`.
- A platform admin cannot be produced from an operator, in either direction: two disjoint lookups (`operators` vs `platform_admins`), no flag, no conversion path — `lib/admin/platform.ts:9-33`, restated in the schema's own comment (`lib/schema.ts:404-412`) and the migration's header (`supabase/migrations/0004_partners.sql:8-11,27-34`).
- Every platform write route answers `NOT_FOUND`, never `FORBIDDEN` — probing the endpoint teaches an operator nothing the page would not — `lib/admin/platform.ts:36-44`.
- Every platform write is audited **after** it succeeds (never before, never on a failed attempt), denormalising the actor's email and the org's slug so the row still reads once either is deleted — `lib/admin/platform.ts:46-74`, table at `supabase/migrations/0010_platform_writes.sql:15-31`.
- There is no middleware- or layout-level session gate: `middleware.ts` only rewrites tenant paths and never inspects the session cookie (`middleware.ts:21-122`), and `app/admin/layout.tsx` renders unconditionally. Every admin page and API route is individually responsible for calling `requireOperator`/`getOperatorSession`, e.g. `app/admin/page.tsx:15-34`. Noted as a rough edge in §7.

**Row Level Security (defence in depth behind a service-role repository)**

- RLS is enabled on every table the anon key could otherwise reach; **the anon role has zero policies anywhere, deliberately** — the anon key is `NEXT_PUBLIC_` and printed into every page, and every guest path already goes through a Next route using the service-role key server-side — `supabase/migrations/0002_row_level_security.sql:29-39,85-109`.
- The `authenticated` role gets exactly one shape of policy, `org_id = current_org_id()` (a `security definer` SQL function resolving `auth.uid()` through `operators`, `stable` so the planner can cache it), applied directly to `orgs`, `operators`, `catalogues`, and by join to `titles`/`albums`/`photos`/`usage_rollup`/`play_events` — `0002_row_level_security.sql:41-83`.
- `platform_admins`, `platform_audit`, `credential_links` and `transfers` are RLS-enabled with **no policy for any role** — reachable only by the service-role key — `0004_partners.sql:42-44`, `0010_platform_writes.sql:35`, `0017_credentials.sql:29-31`, `0005_transfers.sql:43-46`.
- A real integration test asserts this against a live Supabase project rather than trusting the migration file: the anon key reads nothing and writes nothing — `tests/integration/drivers.test.ts:289-321` ("enforces RLS: the anon key can read nothing at all"), `:323-331` ("…anon cannot write, only read").
- The service-role key used by every repository call **bypasses RLS by design** — RLS is the backstop for a stolen or misused anon key, not the mechanism that authorizes an ordinary request. Stated in both migrations' own header comments — `0002_row_level_security.sql:1-7`, `0001_initial_schema.sql:1-7`. A consequence worth naming: RLS's own `op_catalogues` predicate (`org_id = current_org_id()`) would **refuse** the studio's legitimate support-window read, since during a support window `org_id` is the couple's, not the studio's — the support-window rule exists solely in `session.ts`, not in SQL, which is fine only because the app never queries as `authenticated`.

**Headers & bundle hygiene**

- Six headers on every response via `next.config.ts`: `X-Robots-Tag: noindex, nofollow, noarchive, noimageindex` (the whole product is unindexable, not only the admin), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` disabling camera/microphone/geolocation/FLoC, and HSTS with `preload` — `next.config.ts:11-37`.
- **No `Content-Security-Policy` anywhere in the repository** — confirmed by a repo-wide text search, not only by its absence from the header list above. Named explicitly as a gap in N-86, §7.
- Secrets never reach the browser bundle by construction, not by a bundle-scanning script: `lib/env.ts` (the sole `process.env` reader) and every external-service driver — `auth-local.ts`, `auth-supabase.ts`, `video/bunny.ts`, `photos/bunny.ts`, `captcha/verify.ts`, `catalogue-access.ts`, `downloads.ts`, `lib/auth/credential-links.ts`, `lib/admin/{session,platform,platform-accounts}.ts` among them — import the `server-only` package, which throws a build error if pulled into a client bundle — `lib/env.ts:1-13`.
- `pnpm check:bundle` (`scripts/check-bundle.ts`) is a same-named-sounding but unrelated check: it gzips the guest browse route against a 150KB budget (doc 05 §6), not a secrets scan. There is no dedicated automated test that a secret leaked into a client chunk — the guard is entirely the `server-only` import convention. Noted in §7.
- `process.env` is readable only from `lib/env.ts` anywhere else in the app, enforced by eslint's `no-restricted-properties`, with a narrow override list (`lib/env.ts`, `lib/log.ts`, `*.config.ts`, `*.config.mjs`, `scripts/**`, `e2e/**`, `tests/**`) — `.eslintrc.json:16-29`.
- `no-restricted-syntax` refuses `dangerouslySetInnerHTML` anywhere in the tree — tenant and guest strings (a studio's "Presented by", a couple's rewritten letter) render as text nodes only, closing the obvious stored-XSS surface at lint time — `.eslintrc.json:9-15`.
- `@typescript-eslint/no-explicit-any` is `error`, enforced together with `tsc --strict` — `.eslintrc.json:4`.
- `appNameSchema`/`FLIX_SUFFIX` block a `-flix` suffix in any shipped app name at the Zod layer, enforced at every write path that accepts one — not a control against an attacker, but the same "enforced rather than remembered" discipline CLAUDE.md asks for — `lib/schema.ts:107-124`.
- Vercel cron endpoints (`reconcile`, `usage`, `lifecycle`, `notify`, `warnings`, `synthetic`) are gated by a bearer-token compare against `CRON_SECRET` (falling back to `SESSION_SECRET`), rejected outright in production when the header is missing or wrong — e.g. `app/api/cron/reconcile/route.ts:26-35`. Unlike the session/passcode token check, this compare is a plain `!==` string comparison rather than `timingSafeEqual` — a minor timing side-channel against a 16+ character secret over the network, not flagged in `docs/NEXT.md` and low practical severity, noted in §7 as an observation from this reading rather than a documented item.

## 4. Workflows

### W1 · Sign in — both doors, both drivers, the platform-admin fallback

| # | Step | Where | Data written | Failure modes (what the user sees) |
|---|---|---|---|---|
| 1 | Open `/login` (`/admin/login` 307s here); pick a door — a **tab, not a credential** | `app/login/page.tsx:11-33`, `components/auth/LoginForm.tsx:10-22,140-163` | — | The door only changes copy; `POST` always goes to the same route regardless of tab (`LoginForm.tsx:15-18,45-53`). |
| 2 | Type email + password, submit | `LoginForm.tsx:40-70` | — | Submit disabled while a challenge is owed and no token is held yet (`:118`). |
| 3 | `POST /api/admin/session` — challenge owed if ≥3 prior failures on either bucket and a captcha driver is configured | `app/api/admin/session/route.ts:44-58` | — | "Please complete the check below and try again" (401, `challenge:true`) if the token is missing or wrong. |
| 4 | Consume both rate-limit buckets (5/address, 10/IP, 15 min) | `:60-69` | — | "Too many attempts. Try again in N minutes." (429). |
| 5 | `AuthProvider.signIn` against a throwaway carrier response | `:74-75`, `auth-local.ts:30-46` or `auth-supabase.ts:55-63` | Cookies only, on the carrier | Wrong password / unknown email → identical outcome either way (`null`). |
| 6 | Look up the `operators` row for the authenticated user | `:80` | — | An authenticated Supabase user with **no** operator row is a real, non-error state (signed up, never granted an org) — falls through to step 7. |
| 7 | If no operator row, try `platform_admins` | `:94-109` | — | Found → reset both buckets, copy the driver's cookies onto the real response, `landing: '/admin/platform'`. Not found → step 8. |
| 8 | Neither found → generic refusal, and tell the client whether the *next* attempt will be challenged | `:111-117` | — | "Those details did not work" (401) — identical whether the address doesn't exist or the password is wrong. |
| 9 | Success (operator path): reset both buckets, look up the org to decide landing, copy every cookie the driver set | `:119-132` | Cookies only | `mustChangePassword` → `/login/change-password`; else `/my` (couple) or `/admin` (partner) — `landingFor`, `:38-41`. |
| 10 | Sign out — `DELETE /api/admin/session` | `:136-140` | Clears the driver's cookie(s) — `auth-local.ts:71-73`, `auth-supabase.ts:127-129` | Always 204. |

### W2 · Register a studio — the credential and lockout slice

(The business flow — org, operator, registration credit — is mapped in full in `map-studio.md` W1. This entry covers only the auth-security mechanics.)

1. Rate limit: 3 registrations per IP per hour, in-process — `app/api/partners/route.ts:37-38,56-59` via `lib/http/rate-limit.ts:28-41`.
2. Captcha shown on **every** registration (not only after failures) when a driver is configured — `lib/captcha/config.ts:21-26`.
3. `AUTH_DRIVER=local` combined with `DATA_DRIVER=supabase` is refused *before* a credential is created — the FK from `operators.id` to `auth.users.id` would otherwise break — `app/api/partners/route.ts:79-84`.
4. Credential creation is entirely inside `AuthProvider.signUp`: local mints an id and stores nothing until the caller writes the `operators` row; Supabase sends its own confirmation email through the project's SMTP, entirely outside this app's own notification queue — `auth-local.ts:53-57`, `auth-supabase.ts:72-93`.
5. A rate-limited/outage-shaped Supabase failure (429, or "rate limit" in the message) is deliberately distinguished from "address already used" and surfaces as a 429 rather than a silent "try another email" — `auth-supabase.ts:83-88`.
6. Compensation on partial failure: if the `operators` insert fails after the org is created, the org is deleted; the stranded Supabase auth user is harmless (no operator row, no access).

### W3 · Forgot password → set a new one

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | `POST /api/auth/forgot { email }` | `app/api/auth/forgot/route.ts:29-56` | — | — | Always `{ ok:true, "If that address has an account…" }` — one sentence regardless of outcome. |
| 2 | Two buckets consumed (3/address, 5/IP per hour) — **both** must allow, or nothing downstream even runs | `:34-37` | — | — | Over the limit → logged, nothing sent, same response as success (`:47-49`) — a script learns nothing either way. |
| 3 | If under the limit and the address exists: issue a link | `lib/auth/credential-links.ts:74-109` | `credential_links` row (`purpose='reset'`, 1h TTL, `token_hash`) | Queued `credential` template, recipient's own org locale | A queue failure is logged, never surfaced to the requester (`forgot/route.ts:40-43`) — response is unchanged. |
| 4 | Person opens `/set-password/<token>`, submits a new password (≥12 chars) → `POST /api/auth/set-password` | `app/api/auth/set-password/route.ts:29-59` | — | — | 10/IP/hour (`:26-34`). Missing, expired **and already-used** tokens all answer identically: "This link is no longer valid. Ask for a new one." (`:37-44`). |
| 5 | Link spent *before* the password is written | `:48-49` | `credential_links.used_at` | — | A crash between the two steps leaves a person who must ask again — never a link usable twice. |
| 6 | Password replaced through the driver; **no session is minted** | `:49,55-58` | `auth.users` (Supabase) or `operators.password_hash` (local); `operators.must_change_password` cleared (`auth-local.ts:64-69`, `auth-supabase.ts:120-125`) | — | Signing in afterwards is a deliberate, separate step, on whichever door is theirs (`door` in the response, `:56`). |

### W4 · Change your own password (signed in)

1. `getOperatorSession` — **not** `requireOperator` — deliberately: a suspended account may still change its own password, and this route writes nothing a suspension protects — `app/api/auth/change-password/route.ts:26-32`.
2. 10 attempts per IP per 15 minutes — `:34-37`.
3. Old password required unless `mustChangePassword` is set; verified via `signIn` against a throwaway response so a wrong guess sets no cookie anywhere — `:43-53`. Failure: `VALIDATION_FAILED`, field `current`, "That is not your current password."
4. `AuthProvider.setPassword` clears `operators.must_change_password` on both drivers — `:55`, `auth-local.ts:64-69`, `auth-supabase.ts:120-125`.

### W5 · Platform-issued accounts (one credential pattern, three callers)

1. Platform creates a studio (`createStudio`) or adds an operator to an existing org (`addOperator`), from `/admin/platform/orgs` and `/admin/platform/operators` (routes out of primary scope; cited for the credential call only) — `lib/admin/platform-accounts.ts:66-123`.
2. `createOperatorFor` mints a password nobody is told (32 random bytes, base64url), calls `AuthProvider.createUser` (confirmed on creation, no confirmation email sent), then queues a `set-password` credential link **and also returns the plaintext URL** so a console with no mailer configured can still hand it over — `platform-accounts.ts:22-63`. Same shape as a studio issuing a couple's sign-in.
3. Compensation on failure: an org created for a brand-new studio is deleted if the operator write then fails — `:88-96`.
4. Failure modes: an address already in use → `VALIDATION_FAILED`, field `email`, "That address already has an account" (`:35-39`); an address the auth driver itself refuses → same code, "That address cannot be used" (`:42-46`).

### W6 · A guest enters a passcode

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | `POST /api/passcode { catalogue, passcode }` | `app/api/passcode/route.ts:37-80` | — | — |
| 2 | Challenge owed if ≥3 prior *device* failures and a captcha driver is on | `:44-50` | — | `PASSCODE_REQUIRED`, "Please complete the check and try again", `challenge:true`. |
| 3 | Two buckets: 5/device/15min, 30/catalogue/15min across every device — **both** must allow | `:52-58` | — | `RATE_LIMITED` (429). |
| 4 | Look up the catalogue by slug; verify the passcode with a constant-time scrypt compare | `:60-63` | — | "That passcode did not work" — identical whether the catalogue exists or not. |
| 5 | Reset the **device** bucket only on success — the per-catalogue bucket is shared across everyone and is not reset by one person's success | `:70` | — | — |
| 6 | Set the grant cookie — `passcodeCookieName(slug)`, HMAC-signed, carries `catalogue.id` + the current `passcodeVersion`, 30-day TTL | `:72-77`, `lib/auth.ts:81-99` | Cookie only, no database row | — |

### W7 · A guest's request is authorised (the `catalogue-access` chokepoint)

1. Every guest page, and the playback-token and download endpoints, call `resolveAccess`/`requireServableCatalogue` — `lib/catalogue-access.ts:30-88`.
2. Order is deliberate: a lapsed subscription is checked **before** publish state, so it always shows a renewal screen rather than anything reading as "your wedding is gone" (`:38-40`); `includedUntil` is checked independently as a date string, so the catalogue serves through the whole of its last day in every timezone a guest might be in (`:46-48`); a draft catalogue answers `draft`, never a bare 404 (`:50`); a future `premiereAt` gates behind a countdown, checked *before* the passcode — anyone with the link may see the countdown, the code is for the films (`:52-54`); the passcode is the last gate (`:56-61`).
3. Route callers translate the verdict into the doc-07 error vocabulary — `requireServableCatalogue`, `:72-88`: missing/draft → `CATALOGUE_NOT_FOUND`; locked → `PASSCODE_REQUIRED`; lapsed → `SUBSCRIPTION_INACTIVE`; premiere → `CATALOGUE_NOT_FOUND` again ("not yet, and not a secret" — no distinct code so a script cannot distinguish "not premiered" from "does not exist").

### W8 · Minting a playback token (the signed half of what a guest gets)

1. `POST /api/playback/token { catalogue, titleSlug, profileId? }` — `app/api/playback/token/route.ts:25-65`.
2. Rate limit: 60 per IP per catalogue per 60 seconds — `:29`.
3. `requireServableCatalogue` — the full W7 verdict chain, run again for every single film request — `:31`.
4. Title must exist, be `published`, and be `ready` with a `providerId` — `:34-41`. Failure: an unpublished title reads as missing (`CATALOGUE_NOT_FOUND` — a guest cannot distinguish "does not exist" from "not shown yet"); a not-ready one answers `TITLE_NOT_READY`.
5. `getPlaybackToken` signs the Bunny directory URL, scoped to `{catalogueId, titleId}` and checked against that pairing before minting — `:43-48`, `lib/video/bunny.ts:96-148`. TTL from `PLAYBACK_TOKEN_TTL_S` (default 4h).
6. Resume position looked up by `profileId` when supplied, never required — `:50-54`.

### W9 · Downloading everything — and the gap in it

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | `/c/<slug>/download` (server-rendered, no client JS by design — the page a couple reaches when something has already gone wrong) or `GET /api/download?catalogue=<slug>` | `app/c/[slug]/download/page.tsx:1-114`, `app/api/download/route.ts:20-42` | — | — |
| 2 | `resolveDownloadAccess` — **not** `resolveAccess`: never returns `lapsed` (downloads survive lapsing on purpose); checks only "was this ever published" and, if `privacy='passcode'`, the very same grant cookie W6 sets | `lib/downloads.ts:38-55` | — | No `publishedAt` → `missing` (page 404s; API answers `NOT_FOUND`). Locked → page 404s; API answers `FORBIDDEN`, "Enter the passcode first." |
| 3 | `buildManifest` signs a 6-hour URL per film and lists every photograph's **already-public** URL as-is | `lib/downloads.ts:71-114` | — | A single film's signing failure is dropped into `unavailable`, never fails the whole manifest — `:82-93`. |
| 4 | Guest clicks a plain `<a download>` per item | page markup | — | — |

**No sign-in is checked anywhere in this chain.** The same passcode cookie a viewer holds to watch is sufficient to pull every original file, at full resolution, for as long as the 30-day grant lives. This is N-85 (§7); the current test suite documents today's behaviour (a passcode holder downloads freely) rather than the intended one — `tests/unit/downloads.test.ts:53-90` has no case for "refuses a guest with only the passcode, no account."

### W10 · Changing or removing a guest passcode (and who it signs out)

1. Studio path: Settings → `PATCH /api/admin/catalogues/:id { privacy, passcode }` — `app/api/admin/catalogues/[id]/route.ts:88-127`. Client/couple path: `PATCH /api/my/catalogues/:id { passcode }` — `app/api/my/catalogues/[id]/route.ts:39-62`.
2. Either path rewrites `passcode_hash` (or clears it, switching to unlisted) and bumps `passcode_version` — but not identically: the studio route bumps only when the hash actually changes or privacy flips to `unlisted` (`catalogues/[id]/route.ts:125-127`), while the couple's route bumps **unconditionally** whenever `passcode` is present in the body at all, including re-submitting the same code (`my/catalogues/[id]/route.ts:57-62`). A small asymmetry between the two callers; neither is tested against the other.
3. Effect: every existing grant cookie — anyone's, anywhere, including the person who just changed it on their other device — stops matching `verifyPasscodeGrant` on its next request, because the version it carries no longer equals the row's — `lib/auth.ts:101-114`. No enumeration, no explicit per-holder revoke list; the whole cohort is signed out by one integer.
4. The guest page's cache is revalidated so the new code is enforced immediately, not after the next ISR window.

### W11 · An operator's request is authorised (the admin chokepoint, mirroring W7)

1. `requireOperator()` — authenticate, then look up the `operators` row (never trust anything else the caller sent); org suspension is refused at the same point — `lib/admin/session.ts:53-66`.
2. `requireOwnedCatalogue(id)` — the catalogue must belong to `session.orgId`; an unowned one 404s, never 403s, so another org's row is never confirmed to exist — `:69-78`.
3. `requireEditableCatalogue(id)` — owned, **or** originated by this org with an open support window; the window is a timestamp only the couple's own account can extend, seven or fourteen days at a time (`app/api/my/catalogues/[id]/route.ts:16,26-27`). Every write reached through this path is still scoped by `catalogue.orgId` — the **owner's**, never `session.orgId` — stated explicitly in the function's own comment — `session.ts:80-120`.
4. No route in the codebase reaches its catalogue with an id or org taken from the request body — every admin route goes through one of these three functions or is, by CLAUDE.md's own framing, "visibly unscoped." There is no automated test enforcing that claim the way `tests/unit/registry.test.ts` enforces the module-type rule — noted in §7.

### W12 · Platform admin session and audit trail

1. Platform admin signs in through the same `/login` door and the same `POST /api/admin/session` as everyone else — W1, steps 7-9.
2. Every `/admin/platform/**` page calls `getPlatformAdmin()` and answers `notFound()` on `null` — an operator poking at the surface learns nothing that probing the page would not — `lib/admin/platform.ts:22-34` (comment), pattern at `app/admin/page.tsx:20-23`.
3. Every `/api/admin/platform/**` write route calls `requirePlatformAdmin()`, same `NOT_FOUND` answer — `platform.ts:36-44`.
4. After the write succeeds — never before, never on a failed attempt — `recordPlatformAction` writes one `platform_audit` row: actor id + email (denormalised so it survives the admin's account being deleted), action, org id + slug (denormalised, `on delete set null` so it survives the org being deleted), a free-form `detail` object — `platform.ts:46-74`, table `supabase/migrations/0010_platform_writes.sql:15-31`.
5. `platform_audit` and `platform_admins` are readable only through the service-role key — RLS with no policy for any role — so even a compromised platform-admin browser session cannot read the audit trail directly through Supabase's client SDK.
6. Test coverage of the isolation this rests on: `tests/unit/platform-admin.test.ts` (an admin has no org, an operator cannot become one); `tests/unit/platform-writes.test.ts` describes "N-27 — the audit trail" (records who did what, survives the org it describes being deleted, scopes to one org) and "N-27 — a suspended studio at the session boundary" (keeps a session so the console can explain itself, refuses every route through `requireOperator`).

## 5. Data model touched

| Table.column | Written by (auth-security scope) | Migration |
|---|---|---|
| `orgs.id, name, slug, branding, created_at` | Registration, platform `createStudio` | `0001_initial_schema.sql:12-18` |
| `orgs.kind` (`partner`/`couple`), check constraint | Registration (`partner`); studio issuing a couple account (`couple`) | `0004_partners.sql:14-25` |
| `orgs.status` (`active`/`suspended`) | Platform only; read by `requireOperator`/`requireCouple` | `0010_platform_writes.sql:11-13` |
| `operators.id (FK auth.users), org_id, email, name, role, password_hash, created_at` | Registration, credential-link redemption, platform account creation | `0001_initial_schema.sql:20-30` |
| `operators.must_change_password` | Temporary-password issuance (W5, and a studio issuing a couple's sign-in); cleared by W3/W4/W5's `setPassword` | `0017_credentials.sql:27` |
| `platform_admins.id (FK auth.users), email, name, created_at` | Provisioned out-of-band (`pnpm platform:admin`, per `package.json`); never by application code | `0004_partners.sql:35-40` |
| `platform_audit.id, actor_id, actor_email, action, org_id, org_slug, detail, created_at` | W12 · `recordPlatformAction`, after every platform write | `0010_platform_writes.sql:15-31` |
| `credential_links.id, operator_id, token_hash, purpose, expires_at, used_at, created_at` | W3 (`reset`), W5 and a studio's couple-issuance (`set-password`) | `0017_credentials.sql:10-23` |
| `transfers.id, catalogue_id, from_org_id, to_email, token_hash, expires_at, claimed_at, claimed_org_id` | Handover (out of primary scope; the token-hashing pattern is the auth-relevant part) | `0005_transfers.sql:11-34` |
| `catalogues.status, privacy, passcode_hash` | W-create (studio), W10 (settings) | `0001_initial_schema.sql:59-63` |
| `catalogues.sub_status, included_until` | Billing lifecycle (out of scope); read by `resolveAccess`/`resolveDownloadAccess` | `0001_initial_schema.sql:65-67` |
| `catalogues.origin_org_id` | Set at creation, read by the support-window query | `0004_partners.sql:50` |
| `catalogues.couple_org_id, support_access_until, passcode_version` | Couple-account linking, W11 support window, W10 passcode rotation | `0018_couple_accounts.sql:13-15` |
| `current_org_id()` SQL function (`security definer`, `stable`) | Used by every `authenticated`-role RLS policy | `0002_row_level_security.sql:42-50` |
| `auth.users` (Supabase-managed) | `AuthProvider.signUp`/`createUser`/`setPassword` across every driver call in this file | Supabase-managed, not this repo's migrations |

RLS is enabled on every table above with **no** anon policy anywhere (§3, "Row Level Security"); every write in this subsystem goes through the service-role repository and is scoped by `org_id` (or by identity, for `platform_admins`) in application code, not by the database role making the call.

## 6. Configuration

All read exclusively in `lib/env.ts` (enforced by eslint's `no-restricted-properties`, `.eslintrc.json:16-23`).

| Variable | Effect on this subsystem |
|---|---|
| `AUTH_DRIVER` (`local` \| `supabase`, default `local`) | Which `AuthProvider` implementation is instantiated (`lib/admin/auth.ts:11-15`). `local` needs no external service and is what CI/E2E run on; `supabase` is what production runs, and needs a real Supabase Auth password to exist for every operator before it is flipped (`lib/env.ts:147-160`). |
| `SESSION_SECRET` (min 32 chars) | HMAC key for the session cookie and the passcode grant token (`lib/auth.ts:26`). Guarded in production: must not start with `dev-only` (`lib/env.ts:296-303`). Also the fallback signing key for cron bearer auth when `CRON_SECRET` is unset. |
| `CRON_SECRET` (min 16 chars, optional) | Bearer secret Vercel is configured to send on scheduled invocations; unset means Vercel sends *no* header at all, so a forgotten variable shows up as jobs that silently never run rather than as a 401 (`lib/env.ts:73-78`, `app/api/cron/reconcile/route.ts:29-35`). |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`/`SECRET_KEY` | Required when `DATA_DRIVER=supabase` (`lib/env.ts:196-213`). The publishable key is what the signed-in client uses and is subject to RLS; the secret key is used only for `createUser`/`setPassword`, never bound to request cookies — `lib/admin/auth-supabase.ts:14-21,100-104`. |
| `CAPTCHA_DRIVER` (`none` \| `fake` \| `turnstile`, default `none`), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Whether the challenge widget exists at all. **Production runs `none` as of this reading** (`docs/NEXT.md:104`, cited from N-86) — the rate limiters and lockouts are, until this changes, the *only* thing standing between a script and a four-digit passcode or a password guess. `turnstile` requires both keys or the app refuses to boot (`lib/env.ts:255-265`). |
| `DATA_DRIVER` (`memory` \| `file` \| `supabase`) | Which `Repository` implementation backs every read/write in this file; production must be `supabase` or the app refuses to boot outside `ALLOW_EPHEMERAL_DATA=1` (`lib/env.ts:317-323`). RLS is meaningful only on the `supabase` driver. |
| `VIDEO_DRIVER` (`fake` \| `bunny`) + `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY`, `BUNNY_WEBHOOK_SECRET` | Whether playback/poster URLs are actually signed and whether the transcode webhook is verified (`lib/video/bunny.ts`). |
| `PHOTO_DRIVER` (`bunny` \| `fake`) + `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_PASSWORD`, `BUNNY_STORAGE_REGION`, `BUNNY_PHOTO_CDN_HOSTNAME` | Photograph storage/serving. `BUNNY_PHOTO_CDN_HOSTNAME` is the pull zone that currently serves every photo **unsigned** regardless of these values — N-83. |
| `PLAYBACK_TOKEN_TTL_S` (default 4h) | Lifetime of every signed video URL minted by W8. |
| `DEV_OPERATOR_EMAIL`, `DEV_OPERATOR_PASSWORD` | Seeded operator on the memory/file drivers only; production is guarded against the committed default value (`lib/env.ts:304-316`) and against booting on a non-Supabase driver at all. |
| `ROOT_DOMAIN` | Composes every credential-link, set-password and claim URL (`lib/auth/credential-links.ts:67`, via `rootUrl`). |
| `NODE_ENV`, `NEXT_PHASE` | Gate the production-only guards above; `NEXT_PHASE` exists specifically so `next build` (which runs with `NODE_ENV=production` and no real secrets) does not trip them — `lib/env.ts:19-25,294-296`. |

## 7. Gaps and rough edges

**Documented in `docs/NEXT.md`, all still true against the code read for this map**

1. **N-83 · Photographs are public once the URL is known — security.** The photo pull zone has no token authentication; any photo URL, copied out of a passcode-protected wedding, returns 200 to anyone, forever. The page's passcode gate does not extend to the asset itself. Confirmed unsigned again in this reading, `lib/photos/bunny.ts:34`, against `getPlaybackToken`'s signed equivalent for video at `lib/video/bunny.ts:96-148`. What softens it: keys are `c/<catalogue uuid>/<photo uuid>-<width>.<ext>` — nothing guessable, no filename leak — so the exposure is a URL that leaked, not one that can be found by guessing. The documented fix (turn on the pull zone's token auth, sign at render) is not built; `pnpm preflight`'s photo check (`scripts/preflight.ts:294-356`) verifies the storage write/read round-trip but does **not** check token enforcement the way it does for the video zone (`:241-251`) — the same three checks would need adding there too. One open decision blocks part of the fix: whether *unlisted* (no-passcode) catalogues' photographs should be signed too, or stay plain for share previews and WhatsApp's own image fetch (`docs/NEXT.md`, "Decisions Sandeep owns").
2. **N-85 · A passcode views; an account should download — D-43.** `resolveDownloadAccess` today grants the full manifest — originals, 6-hour signed links, everything — to anyone holding the guest passcode cookie, confirmed at `lib/downloads.ts:38-55` and exercised (as today's intended behaviour) by `tests/unit/downloads.test.ts:53-58`. Sandeep's own rule (D-43) is that the passcode is view-only and downloading needs the client's own sign-in — a guest with the code watches, the couple/studio who own the wedding download. The pieces to build this already exist (`getOperatorSession`, `couple_org_id`, `origin_org_id`), and the change is scoped to the verdict function plus the guest page's download link becoming a sign-in prompt for anyone else.
3. **N-86 · Lockouts that do not hold across instances, and no CSP — security.** `lib/http/rate-limit.ts` is explicit in its own comment that it is process memory (`:1-12`); on more than one warm Vercel instance every bucket in §3/§4 above is *N* times looser than its stated number, and a lockout on one instance is invisible to the others. With `CAPTCHA_DRIVER=none` in production (confirmed current in `docs/NEXT.md:104`), the approximate rate limiter is the *only* thing standing between a script and any of: a password guess, a four-digit passcode, a credential-link brute force. Fix as documented: turn Turnstile on (an operator step — two keys and one env var), and move `consume()` behind a durable store (a `rate_limits` table, or Upstash) without changing any call site. The same ticket also names the missing `Content-Security-Policy` — confirmed absent from `next.config.ts:11-37` and from a repo-wide search — as a one-line addition once the allowed hosts (hls.js, Bunny) are enumerated.
4. **N-84 · A film's address is the upload's filename — not access, but a leak of the wrong sort.** `titles.slug` is set once, from the uploaded filename, at `app/api/admin/uploads/route.ts:90,131`; the PATCH route that renames a title (`app/api/admin/titles/[id]/route.ts`) never touches `slug` — confirmed by grep, no `slug` assignment in that file. A film the operator renamed "Sangeet" is still served at `/watch/whatsapp-video-2026-08-12-at-02-07-21` — not an authorization gap (the film behind it is still fully gated by W7/W8), but original-filename metadata (a phone model, a date, sometimes a guest's own naming) travels into every link forwarded from that catalogue.

**Observed in this reading, not separately named in `docs/NEXT.md`**

5. **No automated test enforces the one rule CLAUDE.md calls out as "where the risk actually is."** `tests/unit/registry.test.ts` mechanically enforces that no file outside `modules/` names a module type; there is no equivalent test asserting that every route under `app/api/admin/**` calls `requireOperator`/`requireOwnedCatalogue`/`requireEditableCatalogue`, or that every route under `app/api/admin/platform/**` calls `requirePlatformAdmin`. The discipline is real and consistently followed everywhere this reading looked, but it is a convention, not a check — a future route that forgets the call would be caught by code review, not by `pnpm verify`.
6. **RLS does not model the product's two non-trivial authorization rules.** The `authenticated`-role policy on `catalogues` (`org_id = current_org_id()`) would *refuse* a studio's legitimate support-window read (during the window `org_id` is the couple's org, not the studio's) and has no concept of a platform admin at all. This is fine only because every application query runs as the service role, which bypasses RLS entirely — so RLS is a backstop against a leaked/misused anon or authenticated key, not a mirror of the app's real rules. Worth naming because a future feature built by a developer reading only the SQL would design the wrong thing.
7. **`pnpm check:bundle` is not a secrets check, despite the name being easy to mistake for one.** It gzips the guest browse route against a 150KB budget (`scripts/check-bundle.ts:1-15`). The actual secrets-never-in-the-bundle guarantee rests entirely on the `server-only` import convention (§3) with no automated test that verifies the convention was followed on every file that should carry it.
8. **The cron bearer-secret compare is not constant-time.** Every `app/api/cron/*` route compares `Authorization` against the expected bearer string with plain `!==` (e.g. `app/api/cron/reconcile/route.ts:32-33`), unlike the session-token and passcode-grant signature checks, which both go through `decodeToken`'s `timingSafeEqual` (`lib/auth.ts:39-41`). A network-remote timing attack against a 16+ character secret is not a practical near-term risk, but it is an inconsistency with the rest of the codebase's own stated standard.
9. **Two callers bump `passcodeVersion` under different conditions.** The studio's settings route bumps only on an actual hash change or a switch to unlisted (`app/api/admin/catalogues/[id]/route.ts:125-127`); the couple's route bumps unconditionally whenever a `passcode` field is present at all, including a no-op resubmission of the same code (`app/api/my/catalogues/[id]/route.ts:57-62`). Neither is wrong on its own, and the difference is minor (worst case: a couple's identical resubmission signs out their own other devices unnecessarily), but it is an asymmetry between the two implementations of the same rule with no shared helper and no test comparing them.
10. **Registration's captcha and rate limit are the studio-door version of N-86's exposure**: with `CAPTCHA_DRIVER=none`, `app/api/partners/route.ts`'s 3-per-IP-per-hour limit (cited from `map-studio.md` W1) is subject to the same per-instance approximation as every other bucket in `lib/http/rate-limit.ts`.

**One small doc-vs-code numerical mismatch**

11. N-86's own text says "the other five headers are there, this one [CSP] is not" (`docs/NEXT.md:117-118`). The code has **six** entries in `next.config.ts`'s `securityHeaders` array (`:11-18`): `X-Robots-Tag`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. The code's own comment labels the whole array "Security headers applied to every response," `X-Robots-Tag` included, so there is no obvious fifth-vs-sixth split the doc's count could be drawing on. Immaterial to the substance of N-86 (CSP is genuinely absent either way), but the code is what actually ships, and it ships six headers, not five.

## 8. Evidence index

- `lib/admin/session.ts:1-121` — `getOperatorSession`, `requireOperator`, `requireOwnedCatalogue`, `getEditableCatalogue`/`requireEditableCatalogue`, the support-window rule.
- `lib/admin/auth.ts:1-23` — the one switch on `AuthProvider`, `globalThis`-cached.
- `lib/admin/auth-provider.ts:1-67` — the interface; identity only, never authorization.
- `lib/admin/auth-local.ts:1-74` — signed cookie over a scrypt hash the app stores.
- `lib/admin/auth-supabase.ts:1-130` — Supabase Auth; publishable key for the signed-in client, service-role key only for `createUser`/`setPassword`.
- `lib/admin/platform.ts:1-75` — `getPlatformAdmin`, `requirePlatformAdmin`, `recordPlatformAction`.
- `lib/admin/platform-accounts.ts:1-124` — `createStudio`, `addOperator`, the shared `createOperatorFor`.
- `lib/my/session.ts:1-57` — the couple/client session, built entirely on the operator primitives.
- `lib/auth.ts:1-115` — signed session/passcode tokens, cookie options, `createPasscodeGrant`/`verifyPasscodeGrant`.
- `lib/crypto.ts:1-33` — scrypt hashing, not `server-only` by design.
- `lib/auth/credential-links.ts:1-109` — the one credential-link implementation, reused by three callers.
- `lib/captcha/config.ts:1-22`, `lib/captcha/verify.ts:1-61` — the three-driver captcha seam.
- `lib/http/rate-limit.ts:1-71` — the in-process limiter, its own documented per-instance caveat.
- `lib/http/handler.ts:1-53`, `lib/http/errors.ts:1-70` — the error vocabulary; 500s never leak detail.
- `lib/catalogue-access.ts:1-88` — `resolveAccess`, `requireServableCatalogue`; the single guest chokepoint.
- `lib/downloads.ts:1-115` — `resolveDownloadAccess`, `buildManifest`; the download gate and N-85.
- `lib/env.ts:1-342` — the sole `process.env` reader; every production guard.
- `lib/video/provider.ts:1-152`, `lib/video/bunny.ts:62-148,264-296` — the signed half (playback tokens, upload tickets, webhook HMAC).
- `lib/photos/bunny.ts:34` — the unsigned half (N-83).
- `next.config.ts:1-40` — the six headers present; no CSP.
- `.eslintrc.json:1-32` — `no-restricted-properties`, `no-restricted-syntax`, `no-explicit-any`.
- `middleware.ts:1-123` — tenant routing only; no session check at this layer.
- `app/admin/page.tsx:15-34` — the per-page pattern every admin page repeats instead of a shared gate.
- `app/api/admin/session/route.ts:1-141` — sign in/out, both buckets, both drivers, the platform-admin fallback.
- `app/api/auth/forgot/route.ts:1-57`, `app/api/auth/set-password/route.ts:1-61`, `app/api/auth/change-password/route.ts:1-61`.
- `app/api/passcode/route.ts:1-81` — the guest passcode gate.
- `app/api/playback/token/route.ts:1-66` — signed video token minting.
- `app/api/download/route.ts:1-43`, `app/c/[slug]/download/page.tsx:1-114` — the download gate's two entry points.
- `app/api/admin/catalogues/[id]/route.ts:88-133`, `app/api/my/catalogues/[id]/route.ts:1-80` — the two passcode-rotation callers.
- `app/api/cron/reconcile/route.ts:1-40` (representative of six cron routes) — bearer-secret auth, non-constant-time.
- `components/auth/LoginForm.tsx:1-164`, `components/auth/Challenge.tsx:1-50` — the shared door, the challenge widget.
- `supabase/migrations/0001_initial_schema.sql:1-73` — `orgs`, `operators`, `catalogues` (status/privacy/passcode_hash/sub_status).
- `supabase/migrations/0002_row_level_security.sql:1-109` — every RLS policy in the product; zero anon policies.
- `supabase/migrations/0004_partners.sql:1-57` — `orgs.kind`, `platform_admins`, `origin_org_id`.
- `supabase/migrations/0005_transfers.sql:1-47` — the handover token, hashed like a password.
- `supabase/migrations/0010_platform_writes.sql:1-35` — `orgs.status`, `platform_audit`.
- `supabase/migrations/0017_credentials.sql:1-31` — `credential_links`, `operators.must_change_password`.
- `supabase/migrations/0018_couple_accounts.sql` — `couple_org_id`, `support_access_until`, `passcode_version` (all three added together).
- `lib/schema.ts:100-124,195-223,326-419,503-601` — `appNameSchema`/`FLIX_SUFFIX`, `orgSchema`/`platformAuditSchema`, `transferSchema`/`operatorSchema`/`credentialLinkSchema`/`platformAdminSchema`, `catalogueSchema`.
- `lib/db/supabase-repository.ts:1326-1336` — the support-window query, in SQL terms.
- `scripts/preflight.ts:1-409` — live checks against Supabase, Bunny video (including token enforcement) and Bunny photo storage (round-trip only, no token check).
- `scripts/check-bundle.ts:1-103` — the JS-size budget check, not a secrets check.
- `tests/integration/drivers.test.ts:289-333` — RLS asserted against a live Supabase project.
- `tests/unit/platform-admin.test.ts`, `tests/unit/platform-writes.test.ts`, `tests/unit/platform-console.test.ts`, `tests/unit/auth-provider.test.ts`, `tests/unit/captcha.test.ts`, `tests/unit/downloads.test.ts`, `tests/unit/env.test.ts` — unit coverage cited throughout §3-§4.
- `e2e/auth.spec.ts` — sign-in door, forgot-password's one sentence, the lockout-then-challenge sequence, a spent/unknown credential link.
- `docs/NEXT.md:73-144,250-256` — N-83 through N-86 in Sandeep's own words, and the three decisions still open.
