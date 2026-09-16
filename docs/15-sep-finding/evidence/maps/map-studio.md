# Subsystem map — `studio` (partner onboarding and console)

Mapped 15 September 2026 against the code on `main` (HEAD `96fb305`). Where a document and the
code disagree, the code is what is described and the disagreement is listed in §7. Line numbers
refer to the files as read on this date.

---

## 1. Summary

The studio subsystem is everything a wedding studio, planner or photographer ("partner", org
`kind = 'partner'`) touches: public self-registration at `/admin/register`, the sign-in door, the
console at `/admin` (list of catalogues, the "Delivered" list of handed-over weddings, credit
balance), the five-step wizard at `/admin/new` that creates a wedding catalogue with the couple in
the room, the per-catalogue screens under `/admin/c/<id>` (overview with checklist, films,
photographs, customizer, settings), the studio-level screens under `/admin/studio` (default look,
credits, own domain, house styles), and the API routes under `/api/admin/**` that these screens
call. It is where a studio spends its "thirty minutes per wedding": create → upload → title →
customize → publish (gated on a credit) → send to the couple → hand over. Every write is scoped by
the operator's `org_id` from the session (`lib/admin/session.ts`), never from the request; after a
handover the studio keeps a read-only Delivered row and can only edit again inside a support
window the couple opens.

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Prospective studio** (unauthenticated) | `POST /api/partners` | `/admin/register` only; three attempts per IP per hour (`app/api/partners/route.ts:37-38`). |
| **Studio operator** (`operators.role = 'admin'`, org `kind = 'partner'`) | `requireOperator()` → `OperatorSession` (`lib/admin/session.ts:53-66`) | Everything under `/admin` and `/api/admin/**` except `/admin/platform/**`. |
| **Studio operator, `role = 'uploader'`** | Same session; the role is stored but **never read** anywhere in the studio scope (`grep uploader` finds only the platform's `OperatorControls.tsx`). | Identical to admin in practice. |
| **Suspended studio** (`orgs.status = 'suspended'`) | Session still minted; `requireOperator` throws `FORBIDDEN` (`lib/admin/session.ts:62-64`); `/admin` renders the suspended screen (`app/admin/page.tsx:36-50`). | Reads and writes both refused; can still change own password (`app/api/auth/change-password/route.ts` comment). |
| **Originating studio inside a support window** | `getEditableCatalogue` → `via: 'support'` (`lib/admin/session.ts:100-112`) | Films, photographs, sections, branding, publish on a handed-over wedding; not settings, delivery, handover or delete. |
| **Couple account** (org `kind = 'couple'`) | Same `operators` row shape; console redirects them to `/my` (`app/admin/page.tsx:66`) but they may run the wizard in couple shape (`app/admin/new/page.tsx:46`) and the customizer. | Out of scope here except where the studio creates or hands over to them. |
| **Platform admin** | No `operators` row; refused by `getOperatorSession` (`lib/admin/session.ts:24-28`); bounced to `/admin/platform` (`app/admin/page.tsx:23`). | Grants credits, creates studios, adds operators, attaches domains — the other half of several studio flows. |
| **Guest** | Not an actor here; what the studio's work produces. `lib/catalogue-access.ts` decides what they see (draft → "not yet available", premiere → countdown, passcode → gate, lapsed → renewal). |

## 3. Capabilities

Registration and sign-in

- Public self-registration with business name, contact name, email, password (≥12 chars), and a language radio (en/hi) — `components/admin/RegisterForm.tsx:16-153`, `app/api/partners/route.ts:54-145`, schema `lib/schema.ts:353-366`.
- Captcha seam on registration (`none` | `fake` | `turnstile`), shown on every registration when a driver is configured — `components/auth/Challenge.tsx`, `lib/captcha/verify.ts:16-61`, `app/api/partners/route.ts:65-69`.
- Per-IP registration rate limit, 3 per hour, in-process memory — `app/api/partners/route.ts:37-38,56-59`, `lib/http/rate-limit.ts:28-41`.
- Credential creation through the auth seam; Supabase Auth sends the confirmation email (Supabase's own mailer, not the app's queue) — `lib/admin/auth-supabase.ts:72-93`; local driver mints an id and stores a scrypt hash — `lib/admin/auth-local.ts:53-57`.
- Org slug derived from business name with `-2…-12` then random suffix, reserved words skipped — `app/api/partners/route.ts:41-52`.
- Org + operator creation with explicit compensation (org deleted if operator insert fails) — `app/api/partners/route.ts:98-130`.
- One registration credit, 24-month expiry, `grantedBy: 'registration'` — `lib/admin/credits.ts:14-53`.
- Refusal to register on `AUTH_DRIVER=local` + `DATA_DRIVER=supabase` (FK on `auth.users`) — `app/api/partners/route.ts:79-84`.
- Sign-in through the shared `/login` door (`/admin/login` redirects) with per-address (5) and per-IP (10) 15-minute buckets, challenge after 3 failures, landing decided by org kind — `app/api/admin/session/route.ts:33-133`, `app/admin/login/page.tsx`.
- Forgot password → hashed single-use credential link, one neutral answer — `app/api/auth/forgot/route.ts`, `lib/auth/credential-links.ts:49-109`.
- Change own password (old one required unless `mustChangePassword`) — `app/api/auth/change-password/route.ts`, `app/login/change-password/page.tsx`.
- Sign out — `components/admin/UserMenu.tsx:54-59`, `app/api/admin/session/route.ts:136-140`.

Console

- Catalogue list with search, filter (all/live/draft/attention), sort, per-card counts and an attention chip — `app/admin/page.tsx`, `components/admin/CatalogueBoard.tsx`, `lib/admin/catalogue-health.ts:36-103`.
- Credit balance line ("N credits to publish with") — `app/admin/page.tsx:100-104`.
- Delivered list: every catalogue the studio originated but no longer owns, with term end and whether a support window is open — `components/admin/DeliveredList.tsx`, `repository.listOriginatedCatalogues`.
- Suspended-account screen — `app/admin/page.tsx:36-50`.
- Forced password change before the console opens — `app/admin/page.tsx:34`.
- Chrome: left rail (Catalogues, Your studio), one "New catalogue" in the top bar, per-catalogue tabs (Overview, Films, Photographs, Customizer, Settings), account menu — `components/admin/AdminChrome.tsx`, `AdminNav.tsx`, `UserMenu.tsx`.

Creating a wedding (five-step wizard)

- Step 1: couple name, date, city, occasion (7 values), address slug auto-suggested from names + wedding year, live availability check with a one-click free alternative, app name with `-flix` refusal — `components/admin/CreateWizard.tsx:287-445`, `app/api/admin/slug-check/route.ts`, `lib/format.ts:61-91`, `lib/schema.ts:112-125`.
- Step 2: pick a house style (default preselected) **or** a theme (built-in seven + platform-authored) and a layout (`keepsake`, `films-only`, `anniversary`, `blank`) — `CreateWizard.tsx:447-595`, `lib/admin/templates.ts:22-67`, `themes/registry.ts:29-122`.
- Step 3: privacy (unlisted / guest code typed or generated), language, time zone, optional premiere date+time in the couple's zone, the couple's email + name + how their first password reaches them — `CreateWizard.tsx:597-740`.
- Creation: `POST /api/admin/catalogues` copies org branding → style branding → body branding, inherits locale, freezes `tenantSlug`, stamps `servedAt` if the studio has an active domain, hashes the code, seeds `draftModules` from the template, sets `includedUntil` = now + 12 months — `app/api/admin/catalogues/route.ts:75-159`.
- Local-storage draft of step-1 fields, cleared on creation — `CreateWizard.tsx:140-162,228`.
- Steps 4 and 5 run against the created catalogue: upload manager and inline title editor, polling every 4 s — `CreateWizard.tsx:742-807,883-918`.
- Couple shape of the same wizard for org `kind = 'couple'` (occasion first, no styles, no sign-in card) — `app/admin/new/page.tsx:28-46`, `CreateWizard.tsx:78-83`.

Uploading and titling

- Resumable TUS upload direct to Bunny; parallelism 2; retry schedule; resume on `online`; `beforeunload` guard; row exists from the first byte — `components/admin/UploadManager.tsx`, `app/api/admin/uploads/route.ts`.
- Pre-flight refusals: container/extension, 20 GB per-file cap, storage quota against real stored bytes — `app/api/admin/uploads/route.ts:38-80`, `lib/video/provider.ts:128-151`, `lib/entitlements.ts:105-116`.
- Title draft name from filename, per-catalogue unique slug — `lib/format.ts:94-108`, `app/api/admin/uploads/route.ts:129-136`.
- Inline title editing on blur: English and Hindi name, English synopsis, category (11), "Visible to guests" (only when `ready`), poster frame choice, reorder, remove, retry a failed transcode; save status line — `components/admin/TitleList.tsx`, `app/api/admin/titles/[id]/route.ts`, `titles/reorder/route.ts`, `titles/[id]/retry/route.ts`.
- Status progression via signed Bunny webhook and nightly reconcile — `app/api/webhooks/bunny/route.ts`, `app/api/cron/reconcile/route.ts`.

Photographs

- Browser-side resize to 2048/1024/480 renditions + LQIP, multipart POST proxied through the app, one default album per catalogue, storage-quota check, caption on blur, delete — `components/admin/PhotoManager.tsx`, `app/api/admin/catalogues/[id]/photos/route.ts`, `app/api/admin/photos/[id]/route.ts`.

Customizing

- Section list: drag (pointer + keyboard), arrow buttons, hide/show, remove, add from the module registry, undo/redo (20 deep), inspector per section with localised heading + module editor — `components/admin/CustomizerShell.tsx`, `SectionInspector.tsx`.
- Live preview of the real guest components, mobile/desktop toggle, click-to-select, in-place heading editing, drag-to-reorder in the preview — `components/admin/PreviewPane.tsx`.
- Autosave to `draft_modules` (800 ms debounce) with unknown-type / invalid-config refusal — `CustomizerShell.tsx:152-172`, `app/api/admin/catalogues/[id]/modules/route.ts`.
- Branding panel: theme cards, headline typeface, accent with contrast gate, "Presented by", logo URL, "Made with Mehfilbox" toggle; autosaves to `draft_branding` (700 ms) and drives the preview live — `components/admin/ThemePicker.tsx`, `AccentField.tsx`, `TypefaceField.tsx`, `ThemeCards.tsx`.
- Advisories (non-blocking suggestions) from module `advise` hooks and catalogue-level rules — `CustomizerShell.tsx:724-766`.
- "Guests are seeing exactly this / still seeing the last published version / N films and photographs will go live" state line — `CustomizerShell.tsx:429-479`.

Publishing

- Publish: flush draft modules and branding, then `POST …/publish` promotes `draft_modules → modules`, `draft_branding → branding`, sets status/`publishedAt`, carries pending titles/photos live, revalidates the guest cache — `CustomizerShell.tsx:240-315`, `app/api/admin/catalogues/[id]/publish/route.ts:18-80`.
- Credit gate: first publish consumes one credit (soonest-to-expire); none → `CREDIT_REQUIRED` (402) → `CreditPanel` with "Ask for a credit" — `publish/route.ts:32-41`, `components/admin/CreditPanel.tsx`, `app/api/admin/credits/request/route.ts`.
- Unpublish (guests see "not yet available") — `publish/route.ts:83-91`, `components/admin/CatalogueSettings.tsx:61-66`.

Overview and delivery

- Overview: attention chip, storage used vs plan with hours-of-film hint and 80% warning, films/ready/shown counts, failed-film box, "What guests watched" analytics, public link with copy, setup checklist — `app/admin/c/[id]/page.tsx`, `lib/admin/setup-checklist.ts`, `components/admin/CatalogueAnalytics.tsx`, `PublicLink.tsx`, `SetupChecklist.tsx`.
- Send it to the couple: email through the notification queue (template `delivery`, in the catalogue's language) and a `wa.me` link that opens the studio's own WhatsApp with the same text; published catalogues only — `components/admin/SendToCouple.tsx`, `app/api/admin/catalogues/[id]/deliver/route.ts`.
- Issue the couple's sign-in: creates a `kind = 'couple'` org + operator (or links an existing couple account), emails a set-password link or shows a temporary password once — `components/admin/CoupleAccountPanel.tsx`, `app/api/admin/catalogues/[id]/couple/route.ts`.
- Hand over: direct (linked account; ownership moves now; couple emailed) or a single-use 14-day claim link the studio forwards; cancel an outstanding link — `components/admin/HandoverPanel.tsx`, `app/api/admin/catalogues/[id]/transfer/route.ts`.
- Save this wedding's published look as a house style — `components/admin/SaveAsStyle.tsx`, `app/api/admin/presets/route.ts:42-46`.

Settings

- Language, privacy (unlisted / passcode; new code bumps `passcodeVersion` and signs out holders), time zone, premiere, read-only "Serving until", unpublish, delete with slug confirmation (assets removed from Bunny first) — `components/admin/CatalogueSettings.tsx`, `app/api/admin/catalogues/[id]/route.ts:88-187`.
- Per-wedding custom domain (couple's own root domain) — `app/admin/c/[id]/settings/page.tsx:40-49`, `components/admin/DomainPanel.tsx`.

Studio-level

- Default look (theme, typeface, accent, presented-by, logo URL, platform credit) saved live to `orgs.branding`; inherited by new weddings only — `app/admin/studio/page.tsx`, `components/admin/StudioBranding.tsx`, `app/api/admin/studio/route.ts`.
- Credits balance and price copy — `app/admin/studio/page.tsx:49-59`, `app/api/admin/credits/route.ts`.
- Studio custom domain serving every wedding under `/<wedding>` — `app/admin/studio/page.tsx:61-68`, `app/api/admin/domains/**`, `lib/domains/*`.
- House styles: list with frozen counts, new, edit, rename, make default, duplicate, delete; frozen once a published wedding was made from it — `app/admin/studio/styles/page.tsx`, `styles/[id]/page.tsx`, `components/admin/HouseStyleEditor.tsx`, `HouseStyleActions.tsx`, `app/api/admin/presets/**`, `lib/admin/presets.ts`.

## 4. Workflows

### W1 · Register a studio

| # | Step | Where | Data written | Email | Failure modes (what the user sees) |
|---|---|---|---|---|---|
| 1 | Open the form | `app/admin/register/page.tsx` → `RegisterForm` with `challengeConfig()` | — | — | Page is `noindex`; reachable by anyone. |
| 2 | Fill business name, your name, email, password, language radio; tick the challenge if a driver is configured | `RegisterForm.tsx:93-138` | — | — | Submit disabled until a captcha token exists when `driver !== 'none'` (`:142`). |
| 3 | `POST /api/partners` — rate limit | `app/api/partners/route.ts:56-59` | — | — | 4th attempt in an hour from one IP → 429 "Too many attempts" (per Vercel instance, see §7). |
| 4 | Validate body | `readJson(partnerRegistrationSchema)` (`lib/schema.ts:353-366`) | — | — | 400 with per-field messages (e.g. "Use at least 12 characters"). |
| 5 | Captcha verify | `:67-69` | — | — | "Please complete the check below" (400, `challenge: true`); a Turnstile network failure counts as refusal. |
| 6 | Driver sanity | `:79-84` | — | — | `AUTH_DRIVER=local` on Supabase data → 500 "Something went wrong" (message is replaced by `errorResponse`, `lib/http/errors.ts:63`, so the operator never sees the DEPLOYMENT hint). |
| 7 | Create credential | `auth.signUp` (`auth-supabase.ts:72-93`) | `auth.users` (Supabase) | **Supabase's confirmation email**, via the project's SMTP (Resend per DEPLOYMENT §12) | Existing address → null → 400 "That did not work. Try a different email address." (deliberately the same as any refusal). Supabase 429 / "rate limit" → 429 "Sign-ups are temporarily unavailable." **Any other Supabase error (e.g. "Error sending confirmation email" when the Resend key is bad) also reads as "try a different email"** — recorded live on 11 Sept (`docs/NEXT.md:496-507`). |
| 8 | Create org | `orgSchema.parse` + `createOrg` (`:98-108`) | `orgs.id, name, slug, kind='partner', status='active', locale, branding={presentedBy}, created_at` | — | Slug collision handled by `availableSlug`; a DB failure here → 500. |
| 9 | Create operator | `createOperator` (`:110-130`) | `operators.id (= auth user id), org_id, email, name, role='admin', must_change_password=false, password_hash ('' under Supabase)` | — | On failure the org is deleted (`deleteOrg`) and the error rethrown → 500; the Supabase auth user is stranded (harmless: no operator row). |
| 10 | Grant the trial credit | `grantRegistrationCredit` (`lib/admin/credits.ts:43-53`) | `credits` row: `plan_id='deliver', granted_by='registration', reason='Your first wedding is on us.', purchased_at, expires_at = +24 months` | — | — |
| 11 | Done screen | `RegisterForm.tsx:60-77` → "Go to sign in" (`/login?door=studio`) | — | — | No session is issued; the copy says a confirmation link may be on its way. If Supabase "Confirm email" is on, sign-in fails until the link is clicked, with the generic "Those details did not work". |

### W2 · Sign in, forgot, change password

1. `/admin/login` → 307 to `/login?door=studio` (`app/admin/login/page.tsx`). The door is a tab; landing is decided by `orgs.kind` (`app/api/admin/session/route.ts:38-41,123-131`).
2. `POST /api/admin/session`: challenge check if ≥3 prior failures and a captcha driver is on (`:52-58`); consume address bucket (5/15 min) and IP bucket (10/15 min) (`:60-69`) → 429 "Too many attempts. Try again in N minutes."; `auth.signIn` then `getOperator(user.id)` — wrong password or no operator row both → 401 "Those details did not work" (`:111-117`). Success resets both buckets and sets the driver's cookies. Writes: nothing (Supabase cookies only).
3. `mustChangePassword` → landing `/login/change-password`; `/admin` also redirects there (`app/admin/page.tsx:34`). `POST /api/auth/change-password` (10 per IP per 15 min) → `auth.setPassword` → `operators.must_change_password=false` (`auth-supabase.ts:120-125`).
4. Forgot: `POST /api/auth/forgot` (5/IP, 3/address per hour, silently not sending when over) → `credential_links` row (`purpose='reset'`, 1 h) + queued `credential` email (`lib/auth/credential-links.ts:89-109`). Always "If that address has an account, a link … is on its way."
5. Sign out: `DELETE /api/admin/session` → `router.replace('/login')` (`UserMenu.tsx:54-59`).

### W3 · Create a wedding (the wizard)

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Open `/admin/new` | `app/admin/new/page.tsx` — loads org, its presets, all themes | — | — | No session → `/admin/login`. |
| 2 | Step 1 "The couple": name, wedding date, city, occasion; address slug suggested as `<names>-<year>` (`lib/format.ts:61-72`); debounced `GET /api/admin/slug-check` (`CreateWizard.tsx:171-186`); app name with `-flix` check | `CreateWizard.tsx:287-445` | localStorage `mehfilbox.wizard.draft` (step-1 fields only, `:156-162`) | — | "Continue" disabled until name, date, slug present, no `-flix`, slug not refused. Slug refusal reasons: "Slug must be at least 3 characters", "Use lowercase letters, numbers and single hyphens", "That address is reserved", "That address is already taken" + "Use <suggestion>" button (`slug-check/route.ts:16-45`). |
| 3 | Step 2 "The look": house style card (default preselected; choosing one sets locale/theme/template/privacy, `:123-131`) or "Choose myself" → ThemeCards (enabled themes + current) + 4 layout cards | `:447-595` | — | — | — |
| 4 | Step 3 "Guests & the couple": privacy radio, optional typed code, language, time zone select, premiere date/time, couple email/name and delivery (`link`/`temporary`) | `:597-740` | — | — | "Create and start uploading". |
| 5 | `POST /api/admin/catalogues` | `app/api/admin/catalogues/route.ts:75-159` | `catalogues`: `id, org_id, origin_org_id=org, slug, tenant_slug=org.slug, couple_name, app_name, wedding_date, city, synopsis, occasion, branding (org ⊕ preset ⊕ body), locale, template, preset_id, status='draft', privacy, passcode_hash, passcode_version=1, timezone, premiere_at, served_at (if studio domain active), included_until=+12 months, sub_status='included', created_at`; then `draft_modules` seeded from the template | — | 400 field errors (`weddingDate` "Use YYYY-MM-DD", `slug`, `appName.en`, `timezone` "Unknown time zone", `passcode` <4 chars); 404 "House style not found" for another studio's preset; slug uniqueness is **not re-checked here** — a race with another studio surfaces as a 500 from the unique index. Errors show under step 2/3 as `errors._` or per field (`:217-224`). |
| 6 | Generated guest code returned once (`generated && passcode`) and shown on step 4 (`:766-776`) | `route.ts:94-98,158` | — | — | Not stored in plain text anywhere; Settings can only set a new one. |
| 7 | If a couple email was typed: `POST /api/admin/catalogues/:id/couple` | `CreateWizard.tsx:235-252` → W11 | see W11 | see W11 | Failure is reported on step 4 ("The couple's sign-in could not be made: …") and does not block; the overview offers the form again. |
| 8 | `router.refresh()`, step 4 "Upload" with `UploadManager` | `:263-267,742-784` | see W4 | — | — |
| 9 | Step 5 "Titles": polls `GET /api/admin/catalogues/:id` every 4 s, renders `TitleList` | `:786-807,883-918` | see W5 | — | "No films yet. Go back a step…" when empty. |
| 10 | "Finish and customise" → `/admin/c/<id>/customizer` | `:803` | — | — | Steps 4–5 cannot go back past creation (`Stepper` comment `:812-816`). |

### W4 · Upload films

1. Drop or choose files (`UploadManager.tsx:227-256`). Rejected before a byte moves: unsupported container ("Not a supported video file"), > 20 GB ("Larger than the per-file limit").
2. `POST /api/admin/uploads` (`uploads/route.ts:32-127`): `requireEditableCatalogue`; container check again → 400 "That file type is not supported"; per-file cap → 413 `UPLOAD_LIMIT`; storage check against `catalogueStorageBytes` + declared size vs `resolveLimits` (default 20 GB, `lib/entitlements.ts:29-31`) → 400 "This catalogue holds N GB and M GB is already used. Add storage, or remove a film first." Writes `titles` row: `status='uploading', name.en from filename, slug (unique per catalogue), category='highlights', provider_id, size_bytes (declared), sort_order, live_at=null, published=false`.
3. Browser uploads via tus to `tusEndpoint` with short-lived headers; resumes from the provider's acked offset; `interrupted` state with "Waiting for the network · N%" and auto-resume on `online`; pause/resume/cancel buttons (`UploadManager.tsx:93-226,313-353`).
4. Bunny webhook (`app/api/webhooks/bunny/route.ts`) or nightly reconcile (`cron/reconcile/route.ts`, 02:00 IST-ish per `vercel.json`) moves the row to `processing`/`ready`/`failed`, fills `duration_s, poster_candidates, poster_url, thumbnails_url, size_bytes (provider), error_message`. Failed → "N films failed to process" on the overview and a Retry button in Films.
5. Failure modes: ticket refused → item state `error` with the server message; tus 4xx (not 409/423) → not retried; laptop asleep beyond retry schedule → waits for `online`.

### W5 · Title films

1. `/admin/c/<id>/titles` (`app/admin/c/[id]/titles/page.tsx`) renders `UploadManager` + `TitleList`.
2. Edits on blur → `PATCH /api/admin/titles/:id` (`titles/[id]/route.ts:38-63`): `name`, `synopsis`, `category`, `credits` (no UI), `posterUrl`/`posterSource`, `published`, `sortOrder`. Writes `titles.*`; `published=true` sets `published_at`; choosing a poster pins `poster_source='custom'`.
3. "Visible to guests" is disabled until `status='ready'`; the server also refuses: 409 `TITLE_NOT_READY` "This film is still processing, so it cannot be published yet."
4. Reorder → `POST /api/admin/titles/reorder` (`titles.sort_order` in one transaction). Remove → `DELETE` (Bunny asset first, best effort, then row). Retry → `POST …/retry` re-polls the provider; "This film was never uploaded. Upload it again." when no `provider_id`.
5. `SaveState` above the list: "Saving…", "Saved", "Not saved — your change is still here, and will retry on the next edit" (`SaveState.tsx`). Remove/reorder/retry do **not** report failure (fire-and-forget, `TitleList.tsx:62-92`).
6. A ticked film is not live until the next catalogue Publish (`titles.live_at`, N-57).

### W6 · Photographs

1. `/admin/c/<id>/photos` → `PhotoManager`. Files filtered to `image/*`; each decoded once, cut to 2048/1024/480 JPEGs + a 16-px LQIP (`PhotoManager.tsx:42-120`).
2. `POST /api/admin/catalogues/:id/photos` multipart (`photos/route.ts:82-203`): accepted MIME set; master > 4 MB → 400 (message says "larger than 25MB" — wrong number, see §7); default album `defaultAlbumId(id)` created on first upload (`albums` row "Photographs / तस्वीरें"); storage check → 413 `UPLOAD_LIMIT` "This catalogue holds … Add storage, or remove something first."; three `provider.put`s; `photos` row (`album_id, url, lqip, width, height, size_bytes (all renditions), sort_order, live_at=null`).
3. Vercel's ~4.5 MB body limit fires before the route: the client turns a 413/`PAYLOAD_TOO_LARGE` into "That photograph is too large to send. Try one under 4MB." (`PhotoManager.tsx:172-186`).
4. Caption on blur → `PATCH /api/admin/photos/:id` (`photos.caption`), reported via `SaveState`. Remove → `DELETE` (row first, then **only the master file**, see §7).
5. A photograph is not live until Publish (`photos.live_at`).

### W7 · Customize

1. `/admin/c/<id>/customizer` (`app/admin/c/[id]/customizer/page.tsx`): `getEditableCatalogue` (owner or support window); modules = `draft_modules ?? modules`, or seeded from the template against real titles/albums when both are empty (`:33-39`, `lib/admin/templates.ts:74-130`); `countPendingContent` for the "will go live" line.
2. Section list actions all go through `commit` (undo/redo stack of 20) and autosave `PUT /api/admin/catalogues/:id/modules` after 800 ms (`CustomizerShell.tsx:110-172`). Writes `catalogues.draft_modules`. Refusals: 400 "Some sections are not valid" with `modules.<i>.type` / `.config` fields → `SaveState` "Not saved…".
3. Inspector: heading (en/hi) + the module's own `Editor` (`SectionInspector.tsx`). Add menu lists phase-0 modules, singletons once (`CustomizerShell.tsx:651-696`).
4. Preview: real guest tree in an iframe-less shell, mobile by default, click to select, type a heading in place, drag to reorder (`PreviewPane.tsx`).
5. Branding panel (`ThemePicker.tsx`): theme → typeface → accent (contrast verdict against the theme surface, warning text, never blocking) → presented-by → logo URL → "Made with Mehfilbox". Autosaves `PATCH /api/admin/catalogues/:id { draftBranding }` after 700 ms (`catalogues.draft_branding`); the live `branding` field is not accepted by the route (`catalogues/[id]/route.ts:31-39`). Preview updates on every keystroke.
6. Support-window operators: the PATCH accepts only `draftBranding`/`featuredTitleId` through `requireEditableCatalogue`; anything else falls to `requireOwnedCatalogue` → 404 (`:99-103`).

### W8 · Publish (credit gate) and unpublish

| # | Step | Where | Data written | Email | Failure modes |
|---|---|---|---|---|---|
| 1 | Click Publish / Publish changes | `CustomizerShell.tsx:240-315` | — | — | Button disabled when published and nothing pending. |
| 2 | Flush: `PUT …/modules` and `PATCH … { draftBranding }` | `:246-269` | `draft_modules`, `draft_branding` | — | Either refused → "Your changes could not be saved, so nothing was published." |
| 3 | `POST /api/admin/catalogues/:id/publish` — credit check when `published_at IS NULL` | `publish/route.ts:32-41` | `credits.consumed_by_catalogue_id, consumed_at` (soonest-to-expire unconsumed unexpired credit of `catalogue.orgId`) | — | None available → 402 `CREDIT_REQUIRED` "Publishing this wedding needs a credit…" → `CreditPanel` (price copy ₹1,999 / five for ₹7,999; "Ask for a credit"). |
| 4 | Promote | `:43-63` | `catalogues.modules ← draft_modules, branding ← draft_branding, draft_modules=null, draft_branding=null, status='published', published_at (first time)` | — | — |
| 5 | Content goes live | `publishCatalogueContent` (`:67-70`) | `titles.live_at` for `published=true & ready`, withdrawn for unticked; `photos.live_at` | — | — |
| 6 | Revalidate guest cache; console says "Guests are seeing exactly this." | `:74-78`, `CustomizerShell.tsx:300-311` | — | — | Suspended studio → 403 shown as the publish error. Draft in `via: 'support'` can publish (route uses `requireEditableCatalogue`). |
| 7 | Ask for a credit: `POST /api/admin/credits/request` | `credits/request/route.ts` | `notifications` row (template `credit-request`, to `SUPPORT_EMAIL`, dedupe `credit-request:<org>:<day>`) | To **us**, once per studio per day | "Asked. We add credits the same working day…" or "Already asked today…"; a platform admin then grants from `/admin/platform/orgs/<id>`. |
| 8 | Unpublish: Settings → "Take offline" → `DELETE …/publish` | `CatalogueSettings.tsx:61-66`, `publish/route.ts:83-91` | `status='draft'` (`published_at` kept, so republish is free) | — | Guests see "not yet available" (`lib/catalogue-access.ts:50`). |

### W9 · Settings

1. `/admin/c/<id>/settings` — **owner only** (`getCatalogue(id, session.orgId)`, `settings/page.tsx:16`); support-window studios get 404.
2. Save → `PATCH /api/admin/catalogues/:id` with `privacy`, `passcode` (only when typed; `null` when switching to unlisted), `locale`, `timezone`, `premiereAt` (`CatalogueSettings.tsx:22-48`). Writes `catalogues.privacy, passcode_hash, passcode_version (+1 on any code change), locale, timezone, premiere_at`; revalidates the guest cache. Status line "Saved" / server message.
3. "Serving until" is read-only (`included_until`; the platform extends it, D-39). Wizard hint promises the address can be changed later but Settings has no slug field (see §7).
4. Delete: type the slug → `DELETE /api/admin/catalogues/:id` (`catalogues/[id]/route.ts:148-187`): Bunny assets and all photo renditions removed best-effort, then `deleteCatalogue` (cascade). "Could not delete" on failure; no undo.
5. Their own address (couple's root domain) — see W15.

### W10 · Deliver (send it to the couple)

1. Overview, published catalogues owned by a partner (`app/admin/c/[id]/page.tsx:207-215`): `SendToCouple` prefilled with the linked couple's email or the outstanding transfer's.
2. "Email it" → `POST /api/admin/catalogues/:id/deliver` (`deliver/route.ts:27-59`): refuses drafts (400 "Publish the wedding before sending it to the couple"); `enqueue` template `delivery` in the catalogue's language with `coupleName, studioName (branding.presentedBy ?? 'your studio'), url (publicUrlOf — custom domain if active), date`. Writes `notifications` (`status='queued'`). Not de-duplicated by design.
3. Drain: `/api/cron/notify` driven by GitHub Actions every 15 minutes (`.github/workflows/notify-drain.yml:22`); Resend sends email only. UI: "Queued — it goes out within fifteen minutes".
4. "Open in WhatsApp" is a `wa.me/?text=` link with the same rendered text — nothing is sent or recorded (`SendToCouple.tsx:85-97`).
5. The message text is shown under "What it says" (`render('delivery', …).text`, `page.tsx:83-89`).

### W11 · Issue the couple's sign-in

1. From wizard step 3 or the overview's `CoupleAccountPanel` → `POST /api/admin/catalogues/:id/couple` (`couple/route.ts:40-134`); owner + `kind='partner'` only (403 "Only a studio can issue a couple's sign-in").
2. Existing operator with that email: couple org → link (`catalogues.couple_org_id`), reply `existing: true` ("already had an account; this wedding is in it"); studio org → 400 "That address belongs to a studio account / Use the couple's own address".
3. New: `auth.createUser(email, password)` (Supabase admin API, `email_confirm: true`, no confirmation mail; `auth-supabase.ts:106-118`) — refused → 400 "That address cannot be used / Try a different address". Then `orgs` (`kind='couple'`, `locale = catalogue.locale`, slug from name), `operators` (`must_change_password = delivery==='temporary'`), `catalogues.couple_org_id`.
4. `delivery='link'`: `sendCredentialLink(operator, 'set-password')` → `credential_links` (14 days) + queued `credential` email; a queue failure is logged, not surfaced. `delivery='temporary'`: two-word-plus-digits password returned once (`credential-links.ts:39-42`); shown with Copy; nothing stored in plain text.
5. Compensation: org deleted if the operator insert fails; the auth user is stranded.

### W12 · Hand over, support window, Delivered

1. `HandoverPanel` on the overview (partner owner only). With a linked account and no outstanding link: "Hand over now" (confirm dialog) → `POST …/transfer { direct: true }` (`transfer/route.ts:101-154`): snapshots `branding.presentedBy = studio.name` if empty, `transferCatalogue` (`catalogues.org_id ← couple org`, `origin_org_id` unchanged), `support_access_until = null`, revalidate, queue `handover` email to every operator of the couple org (link to `/my`). Console redirects to `/admin`; the wedding reappears under Delivered. Errors: "Create the couple's sign-in first, or send them a link" / "The linked account is no longer there".
2. Without a linked account: email → `POST …/transfer { email }` → `transfers` row (`token_hash` SHA-256, `expires_at` +14 days, `to_email`); the plaintext claim URL (`<root>/claim/<token>`) is returned **once** and shown with Copy; **no email is sent** (`transfer/route.ts:20-32`, `HandoverPanel.tsx:237-244`). A second link while one is live → 400 "A handover is already waiting to be accepted. Cancel it first…". Cancel → `DELETE …/transfer` (`cancelTransfer`), 404 "No handover is waiting" if none.
3. After handover the studio's session no longer owns the row; `getEditableCatalogue` falls back to `getCatalogueForSupport` when `support_access_until` is in the future (`session.ts:100-112`). The Delivered card shows "Access open until …" and "Open the customizer", else "Access closed — the couple can open a window from their account" (`DeliveredList.tsx:26-70`). Inside the window the overview shows the amber "On the couple's invitation" banner and hides delivery/handover/style/couple panels (`page.tsx:75-77,107-116`).

### W13 · House styles

1. List `/admin/studio/styles` with per-style frozen count (`countPublishedCataloguesOnPreset`), swatch, one-line summary, actions.
2. Create: `/admin/studio/styles/new` (`HouseStyleEditor`, seeded from the studio's branding and locale) → `POST /api/admin/presets` (`presets/route.ts:34-66`): name, isDefault, templateId (must exist → "Unknown layout"), branding (theme must exist → "Unknown theme"), locale, passcodeOn. Writes `presets` row; `savePreset` clears the org's previous default when `is_default`.
3. Capture from a wedding: overview "Keep this look" (published only) → `POST /api/admin/presets { name, fromCatalogueId }` — copies `template, branding, locale, passcodeOn` from the **live** row (`lib/admin/presets.ts:41-59`).
4. Duplicate: `POST { name, duplicateOf }` → new row, opens the editor.
5. Edit `/admin/studio/styles/<id>` → `PATCH /api/admin/presets/:id`: if any of `templateId, branding, locale, passcodeOn` changes and a published catalogue references the style → 409 `FROZEN` "N published weddings were delivered in this style, so its look is fixed. Duplicate it and edit the copy instead." Rename and make-default always pass. Delete → 409 the same way. Another studio's style → 404 "House style not found".
6. Use: wizard step 2 preselects the default style; creation copies its values and records `catalogues.preset_id`.

### W14 · The studio's look (default branding)

1. `/admin/studio` → `StudioBranding` = `ThemePicker` with `target: { kind: 'studio' }`.
2. Every change autosaves `PATCH /api/admin/studio { branding }` (whole object, so an omitted field clears) → `orgs.branding` (`setOrgBranding`). Live at once; existing weddings untouched (`studio/route.ts:26-37`). Status "Changes save as you make them. Every new wedding starts from this." / "Saved" / "Not saved…".
3. Fields: theme, headline typeface (Archivo/Mukta/Inter or the theme's own), accent (5 presets + colour input, contrast verdict), presented-by, **logo URL** (no upload), "Made with Mehfilbox" toggle.

### W15 · Custom domains

1. Studio domain from `/admin/studio` (`catalogueId: null`); couple's root domain from a wedding's Settings (`catalogueId: <id>`, owner-checked). `POST /api/admin/domains` (`domains/route.ts:34-74`): `hostSchema` ("Enter a domain like films.example.com"); our own host → "That is our address. A custom domain is one you own."; host already in use → "That domain is already in use"; second domain for the same scope → "This studio/wedding already has a domain (host). Remove it first." Writes `domains` (`status='pending'`, `verification_token='mehfilbox-verify-<hex>'`).
2. Panel shows generated records with copy buttons: TXT `_mehfilbox.<host>`; subdomain → CNAME to `DOMAIN_CNAME_TARGET`; root → A `DOMAIN_A_RECORD` + `www` CNAME + the email/MX warnings; nameserver alternative; registrar hints (`lib/domains/instructions.ts`).
3. "Check DNS" → `POST /api/admin/domains/:id/check` (`lib/domains/index.ts:101-128`): resolves from the server (`node:dns`, 3 s); not verified → `status='pending'`, `last_checked_at`, `error` = the sentence ("No TXT record at … yet. DNS changes take from a few minutes to a day to show."); verified → `status='verified'`; with `DOMAIN_DRIVER=vercel` attaches at once → `active` and stamps `catalogues.served_at` for every catalogue it covers (studio: owned + originated with matching `tenant_slug`); provider refusal → `status='failed'` with the host's message. With `DOMAIN_DRIVER=none` the row waits at `verified` ("DNS is right. The domain is being attached on our side — you will get an email…") until a platform admin marks it attached. **No email is actually sent** on attachment (nothing enqueues one in `lib/domains/index.ts`).
4. Remove → `DELETE /api/admin/domains/:id`: clears `served_at` where it started with the host, detaches at the provider if active, deletes the row.
5. Once active every printed URL uses `served_at` (`lib/address.ts:41-44`) and the mehfilbox path 301s (`lib/address.ts:93`).

### W16 · Credits

- Balance on `/admin` and `/admin/studio`; rows via `GET /api/admin/credits` (`available, consumed, expired`).
- Consumed only by W8 step 3; granted by registration (W1) or the platform (`/api/admin/platform/orgs/:id/credits`, audit-logged).
- "Ask for a credit" (W8 step 7). No purchase path — Razorpay is N-20.

### W17 · Team and operators

- **There is no studio-side team management.** No page, component or route under `app/admin`, `app/api/admin/{catalogues,studio,presets,…}` or `components/admin` (excluding platform components) invites, lists or removes operators (`grep invite|teammate|uploader` finds only `OperatorControls.tsx`, a platform component). A second seat is added by a platform admin through `POST /api/admin/platform/operators` (`app/api/admin/platform/operators/route.ts:11-16`: "the second seat a studio asks for by email"), which emails a set-password link.
- `operators.role` (`admin` | `uploader`) is stored and displayed by the platform but **never enforced** — nothing in `lib/admin/session.ts` or any studio route reads `role`.

## 5. Data model touched

| Table.column | Written by (studio scope) | Migration |
|---|---|---|
| `orgs.id, name, slug, branding, created_at` | W1 registration (`createOrg`); W14 `setOrgBranding` | `0001_initial_schema.sql:12-18` |
| `orgs.kind` (`partner`/`couple`) | W1 (`partner`), W11 (`couple`) | `0004_partners.sql:17-22` |
| `orgs.status` (`active`/`suspended`) | Read only here (platform writes) | `0010_platform_writes.sql:11-13` |
| `orgs.locale` | W1 (the language radio); W11 copies the catalogue's | `0013_locale.sql:10` |
| `operators.id (FK auth.users), org_id, email, name, role, password_hash, created_at` | W1, W11 | `0001_initial_schema.sql:20-30` |
| `operators.must_change_password` | W11 (`temporary`), W2 change-password | `0017_credentials.sql:27` |
| `credential_links.*` | W2 forgot (`reset`), W11 (`set-password`) | `0017_credentials.sql:10-23` |
| `credits.*` | W1 grant; W8 consume (`consumed_by_catalogue_id, consumed_at`) | `0021_credits.sql` |
| `catalogues.id, org_id, slug, couple_name, app_name, wedding_date, city, synopsis, occasion, branding, featured_title_id, modules, draft_modules, template, status, privacy, passcode_hash, included_until, sub_status, sub_plan, sub_until, created_at, published_at` | W3 create; W7/W8/W9 | `0001_initial_schema.sql:35-73` |
| `catalogues.occasion` check (7 values) | W3 | `0025_occasions.sql` |
| `catalogues.origin_org_id` | W3 (`= org_id`, never changed) | `0004_partners.sql:50` |
| `catalogues.draft_branding` | W7 branding autosave; cleared by W8 | `0011_draft_branding.sql` |
| `catalogues.locale` | W3, W9 | `0013_locale.sql:12` |
| `catalogues.tenant_slug` | W3 (frozen to the org slug) | `0016_tenant_path.sql:10-27` |
| `catalogues.couple_org_id, support_access_until, passcode_version` | W11, W12, W9 | `0018_couple_accounts.sql:13-15` |
| `catalogues.preset_id` | W3 | `0020_presets.sql:28` |
| `catalogues.served_at` | W15 activate/deactivate; W3 when a studio domain is active | `0023_domains.sql:28` |
| `catalogues.timezone, premiere_at` | W3, W9 | `0024_premiere.sql:6-7` |
| `catalogues.custom_domain` | Set to `null` at creation; no longer accepted by PATCH | `0001_initial_schema.sql:39` (superseded by `served_at`) |
| `titles.*` incl. `size_bytes` (0007), `live_at` (0012) | W4, W5, webhook/reconcile, W8 | `0001_initial_schema.sql:78-119`, `0007_storage_only.sql:9`, `0012_content_waits_for_publish.sql:10` |
| `albums.*` | W6 (default album) | `0001_initial_schema.sql:125-132` |
| `photos.*` incl. `size_bytes`, `live_at` | W6, W8 | `0001_initial_schema.sql:134-145`, `0007`, `0012` |
| `presets.*` | W13 | `0020_presets.sql:9-22` |
| `domains.*` | W15 | `0023_domains.sql:7-20` |
| `transfers.*` | W12 link handover; cancel deletes | `0005_transfers.sql:11-41` |
| `notifications.*` incl. `dedupe_key` | W10 delivery, W11 credential, W12 handover, W8 credit-request | `0009_notifications.sql`, `0014_notification_dedupe.sql` |
| `entitlements.*` | Read only (storage quota); platform writes | `0006_entitlements.sql:32-53` |
| `themes.*` | Read only (`allThemes`) | `0019_themes.sql` |
| `auth.users` (Supabase) | W1 `signUp`, W11 `admin.createUser`, W2 `updateUserById` | Supabase-managed |

RLS is enabled on every table with no anon policy (`0002_row_level_security.sql`, and each later migration); all studio routes go through the service-role repository and scope by `org_id` in code.

## 6. Configuration

All read in `lib/env.ts` (the only `process.env` reader).

| Variable | Effect on this subsystem |
|---|---|
| `AUTH_DRIVER` (`local` \| `supabase`, default `local`) | Who verifies passwords and creates credentials. Registration on `supabase` data with `local` auth is refused (`partners/route.ts:79-84`). `supabase` sends the confirmation email through the Supabase project's SMTP. |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`/`SECRET_KEY` | Required for `DATA_DRIVER=supabase`; the service key is used by `createUser`/`setPassword`. |
| `CAPTCHA_DRIVER` (`none` \| `fake` \| `turnstile`), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Widget on every registration and after 3 sign-in failures. Production is `none` (`docs/NEXT.md:104`). |
| `DATA_DRIVER` (`memory` \| `file` \| `supabase`) | Repository behind every write; production must be `supabase`. |
| `VIDEO_DRIVER` (`fake` \| `bunny`) + `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY`, `BUNNY_WEBHOOK_SECRET` | Upload tickets, status polling, asset deletion, webhook verification. |
| `PHOTO_DRIVER` (`bunny` \| `fake`) + `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_PASSWORD`, `BUNNY_STORAGE_REGION`, `BUNNY_PHOTO_CDN_HOSTNAME` | Photograph storage. |
| `NOTIFY_DRIVER` (`fake` \| `resend`), `RESEND_API_KEY`, `NOTIFY_FROM` | Delivery, credential, handover and credit-request emails. `fake` is refused on the supabase driver. |
| `SUPPORT_EMAIL` | Recipient of credit requests; shown on the suspended screen. |
| `ROOT_DOMAIN`, `TENANCY_MODE` (`path` \| `subdomain`) | Every printed address, the wizard's address preview, claim and set-password links. |
| `DOMAIN_DRIVER` (`none` \| `fake` \| `vercel`), `DOMAIN_CNAME_TARGET`, `DOMAIN_A_RECORD`, `DOMAIN_NAMESERVERS`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | What the DNS instructions print; whether "Check DNS" can attach a verified domain by itself. |
| `RECONCILE_STALL_MINUTES` (default 120) | How long an `uploading`/`processing` title waits before reconcile asks Bunny. |
| `CRON_SECRET` / `SESSION_SECRET` | Bearer for the crons that finish uploads and drain the email queue. |
| `PLAYBACK_TOKEN_TTL_S` | Not studio-facing (guest playback). |
| `DEV_OPERATOR_EMAIL`, `DEV_OPERATOR_PASSWORD` | Seeded operator on memory/file drivers only. |
| Supabase dashboard (not env): SMTP settings, "Confirm email", Site URL | Whether the registration confirmation is delivered and where its link lands (`docs/DEPLOYMENT.md:410-435`). |
| GitHub Actions schedule (`.github/workflows/notify-drain.yml`) | The 15-minute email drain; schedules on a public repo pause after 60 days without commits. |

## 7. Gaps and rough edges

Missing or half-built

1. **No team management for a studio.** No invite, list, role change or removal of operators anywhere in the studio scope; a second seat is a platform-admin action by email (`app/api/admin/platform/operators/route.ts:11-16`). `operators.role = 'uploader'` exists in the schema and the platform form but is never enforced by any studio route or by `lib/admin/session.ts`.
2. **A studio cannot edit its own account.** `PATCH /api/admin/studio` accepts only `branding` (`app/api/admin/studio/route.ts:11`). Business name, slug (the `<studio>` segment of every new wedding's address), contact name, email and the org language chosen at registration cannot be changed by the studio. There is no profile screen; `UserMenu` offers sign-out only, although `app/login/change-password/page.tsx:11-13` says everyone "reaches it from the account menu" — no such link exists (`grep change-password components/admin` finds nothing).
3. **Wedding facts cannot be edited after creation.** `PATCH /api/admin/catalogues/:id` accepts `coupleName, city, synopsis, weddingDate, slug` (`catalogues/[id]/route.ts:25-30`) but no console surface sends them (`grep` across `components/admin` and `modules/*` finds none). The wizard warns "Changing it later breaks links already sent" about an address that cannot be changed later at all. A typo in the couple's name is permanent from the console.
4. **Logo is a URL field, not an upload** (`ThemePicker.tsx:243-256`, `HouseStyleEditor.tsx:227-237`). A studio must host its own logo somewhere public.
5. **Films: no editor for `credits`, `captions`, `trailerUrl`, Hindi synopsis** — all in `titleSchema` and accepted by PATCH (credits) but absent from `TitleList`. Title slug is set once from the upload filename and never re-derived (N-84).
6. **Photographs: single-photo delete removes only the master rendition** (`photos/[id]/route.ts:63` removes `photoKeyFromUrl(photo.url)`), while catalogue delete loops over every width (`catalogues/[id]/route.ts:168-174`). The `-1024` and `-480` files linger in the storage zone. Also the size refusal says "larger than 25MB" while `MAX_BYTES` is 4 MB (`photos/route.ts:32,98`). No album management beyond the one default album; no photo reordering.
7. **Wizard draft persistence is partial**: only step-1 fields are mirrored to localStorage (`CreateWizard.tsx:156-162`); occasion, style/theme/layout and every step-3 answer are lost on refresh before creation.
8. **Slug uniqueness is checked in the wizard but not re-validated at create**; a race surfaces as a bare 500 (`catalogues/route.ts:100-149` has no `slugAvailable` call; the PATCH route does, `:106-110`).
9. **Registration error path is lossy.** Every Supabase sign-up error except 429 becomes "That did not work. Try a different email address." (`partners/route.ts:88-96`), which is how a bad Resend key read as the studio's own fault on 11 Sept (`docs/NEXT.md:496-507`). The `INTERNAL` hint about `AUTH_DRIVER` (`:80-83`) is masked by `errorResponse` (`lib/http/errors.ts:63`).
10. **No approval, no email verification enforced by the app.** Whether a partner must confirm email is a Supabase dashboard setting; the app cannot tell (`partners/route.ts:138-139`). Decision on gating signup is open (`docs/NEXT.md:250-253`).
11. **Rate limits and lockouts are per Vercel instance** (`lib/http/rate-limit.ts:3-12`); with `CAPTCHA_DRIVER=none` in production the registration limit of 3/hour is approximate (N-86).
12. **Fire-and-forget actions with no failure reporting**: title remove/reorder/retry (`TitleList.tsx:62-92`), photo remove (`PhotoManager.tsx:240-244`), handover cancel (`HandoverPanel.tsx:96-105`), unpublish (`CatalogueSettings.tsx:61-66`).
13. **Delivery email depends on a GitHub Actions cron** that pauses after 60 days without commits (`.github/workflows/notify-drain.yml:14`); the UI promise "goes out within fifteen minutes" holds only while that workflow runs. WhatsApp is a compose link, not a send (N-36c).
14. **Domain "verified" copy promises an email that is never sent** ("you will get an email, and the address changes over", `DomainPanel.tsx:161-164`); `lib/domains/index.ts` enqueues nothing on activation. With `DOMAIN_DRIVER=none` the studio has no signal beyond re-opening the page.
15. **Couple's own catalogue publishes only via a credit the studio or platform adds** — but there is no studio-side action to grant a credit to a couple; only the platform can (`credits` writes are registration + platform).
16. **No plan or tier step in the wizard**; every catalogue gets `included_until = +12 months` and the 20 GB default (`catalogues/route.ts:65-83`, `lib/entitlements.ts:29-31`). "Add storage" is a sentence in the 80% warning, not an action (N-79).
17. **No renewal or extension the studio can perform**; "Serving until" is read-only (D-39) and the Delivered list is informational.
18. **Support-window asymmetry**: a studio inside a window can Publish (spends nothing, `published_at` already set) and change branding, but cannot see Settings; the overview banner explains this only in prose.
19. **Duplicate slug generators**: `app/api/partners/route.ts:41-52` reimplements `suggestOrgSlug` (`lib/format.ts:117-129`) whose comment claims it is "shared by partner registration". Harmless, but the comment is wrong.
20. **The `uploader` role and `custom_domain` column are dead** in this scope; `plans` is empty and nothing reads `entitlements.plan_id`.

Docs that the code does not match

21. `docs/spec/16-platform-v2.md:345` — wizard step 2 "with the real shell rendering the choice": the wizard shows `ThemeCards` swatches and a drawn `TemplateThumbnail` (`CreateWizard.tsx:536-583`), not the real guest shell; the real shell renders only in the customizer's `PreviewPane`.
22. `16-platform-v2.md:116-117` — the couple's sign-in "from the catalogue's settings": it is on the **overview** (`app/admin/c/[id]/page.tsx:217-221`), not Settings.
23. `16-platform-v2.md:158-159` — "the claim link is also emailed" when a couple account is linked: the link path never emails (`transfer/route.ts:20-32`); only the direct handover emails, and it sends the `handover` template to `/my`, not a claim link.
24. `16-platform-v2.md:378-390` (data model) lists `orgs.contact_email`, `orgs.timezone`, `catalogues.theme_id`, `catalogues.credit_id`, `presets.theme_id`, `presets.poster_palette`, `themes.created_by`. None exist: the theme rides in `branding.theme` (`lib/schema.ts:159`), the credit links the other way (`credits.consumed_by_catalogue_id`), and orgs have no contact email or timezone (`0013`, `0016`–`0025`).
25. `16-platform-v2.md:31` and `:301` — "a studio … with a team" / "add an operator" under the platform: correct that it is platform-only, but nothing in the spec says a studio itself cannot manage a team; §7 item 1 above is the actual state.
26. `docs/USAGE-GUIDE.md:41-99` — describes four wizard steps, `/admin/login` as the sign-in, `heirloomfilms.in` links, a numeric-suffix address ("kalyanam-2"), and Supabase "Reset password" as the way to reset — all pre-second-pass (N-88 acknowledges it). The address suffix is now `-2…-12` then a random 6-char suffix (`partners/route.ts:41-52`); reset is `/login/forgot`.
27. `docs/PRODUCT.md:96` — "Custom domain: Partial … Not served — N-68 builds …" is stale against §8 of the same file and `lib/address.ts`; the domain is served once active.
28. `docs/PRODUCT.md:94` — "Account handover … Partner loses access entirely": true at handover, but the support window (N-62) reopens it; the row predates D-37.
29. `components/admin/CreateWizard.tsx:46-53` doc-comment says "upload starts at step 3 and keeps running through step 4" and `StepTitles` says "the wizard creates the catalogue at step 2 and the films arrive during step 3" — both describe the old four-step wizard; creation is at the end of step 3 and upload is step 4 (`:191-268,742-784`).
30. `app/admin/studio/page.tsx:13-18` doc-comment ("Named multi-presets are worth building when a studio asks … and not before") predates house styles, which the same page links to.

## 8. Evidence index

Registration and auth
- `app/admin/register/page.tsx:5-12` — public page, `noindex`, passes `challengeConfig()`.
- `components/admin/RegisterForm.tsx:24-58` submit; `:60-77` done screen; `:93-103` fields; `:111-135` language radio; `:138-146` challenge + disabled submit.
- `app/api/partners/route.ts:37-38` limits; `:41-52` slug; `:56-59` rate limit; `:61` schema; `:67-69` captcha; `:79-84` driver refusal; `:88-96` signUp + generic refusal; `:98-108` org; `:110-130` operator + rollback; `:134` credit; `:140-143` 201, no session.
- `lib/schema.ts:80-106` reserved/slug; `:112-125` `-flix`; `:141-166` branding; `:196-206` org; `:233-270` preset, credit; `:283-316` domain; `:326-350` transfer, claim; `:353-366` registration; `:370-403` operator, credential link; `:504-602` catalogue.
- `lib/captcha/verify.ts:16-61`; `lib/captcha/config.ts:5-22`; `components/auth/Challenge.tsx:26-100`.
- `lib/admin/auth-supabase.ts:72-93` signUp; `:100-118` admin createUser; `:120-125` setPassword. `lib/admin/auth-local.ts:53-69`.
- `lib/admin/credits.ts:14-16` constants; `:18-40` makeCredits; `:43-53` registration grant.
- `lib/http/rate-limit.ts:3-12,28-41,68-71`; `lib/http/errors.ts:7-23,54-70`; `lib/http/handler.ts:10-53`.
- `app/api/admin/session/route.ts:33-35` limits; `:38-41` landing; `:52-58` challenge; `:60-69` buckets; `:74-117` sign-in and refusal; `:136-140` sign-out.
- `app/api/auth/forgot/route.ts:25-55`; `app/api/auth/change-password/route.ts:13-40`; `app/login/change-password/page.tsx:9-18`; `lib/auth/credential-links.ts:22-25,39-42,49-68,89-109`.
- `lib/admin/session.ts:17-38` session; `:53-66` requireOperator + suspension; `:69-78` owned; `:93-120` editable/support.
- `middleware.ts:34-58` path-mode rewrite; `app/admin/login/page.tsx:10-17`.

Console
- `app/admin/page.tsx:16-25` platform-admin bounce; `:34` forced password change; `:36-50` suspended screen; `:57-63` parallel loads; `:66` couple redirect; `:100-104` credit line; `:108-111` board + delivered.
- `components/admin/AdminChrome.tsx:57-75` rail; `:96-108` New catalogue + menu; `:129-137` tabs. `AdminNav.tsx:16-19`. `UserMenu.tsx:54-59,93-104`.
- `components/admin/CatalogueBoard.tsx:38-46` filters; `:64-81` sort; `:188-240` card; `:295-315` empty state.
- `lib/admin/catalogue-health.ts:36-103` attention ladder; `:112-130` proximity.
- `components/admin/DeliveredList.tsx:14-76`.

Wizard and creation
- `app/admin/new/page.tsx:13-47`.
- `components/admin/CreateWizard.tsx:22-28` steps; `:40` draft key; `:108-131` style selection; `:140-162` draft persistence; `:166-186` slug suggest + check; `:191-268` create + couple + refresh; `:287-445` step 1; `:447-595` step 2; `:597-740` step 3; `:742-784` step 4; `:786-807` step 5; `:817-853` stepper; `:883-918` StepTitles.
- `app/api/admin/slug-check/route.ts:11-46`; `lib/format.ts:33-42,61-72,88-91,94-108,117-129`.
- `app/api/admin/catalogues/route.ts:25-55` schema; `:65` twelve months; `:84-98` org/preset/domain/code; `:100-148` row; `:152-158` seed + return.
- `lib/admin/templates.ts:12-67` templates; `:74-130` seedModules. `lib/admin/presets.ts:10-20,23-31,41-59,66-68,71`.
- `themes/registry.ts:12,29-122,154-160`; `themes/resolve.ts:22-35`.

Upload, titles, photos
- `app/api/admin/uploads/route.ts:15-21,34-46,51-80,82-113,129-136`.
- `lib/video/provider.ts:128-151`; `lib/entitlements.ts:29-31,70-88,105-116,131-164`.
- `components/admin/UploadManager.tsx:35-43,73-91,93-194,200-226,227-256,304-311,384-400`.
- `app/api/webhooks/bunny/route.ts:17-81`; `app/api/cron/reconcile/route.ts:14-80`; `vercel.json` crons.
- `app/api/admin/titles/[id]/route.ts:19-28,31-36,38-63,65-79`; `titles/reorder/route.ts:9-22`; `titles/[id]/retry/route.ts:19-48`.
- `components/admin/TitleList.tsx:40-92,151-163,165-241,243-267,276-297`.
- `app/api/admin/catalogues/[id]/photos/route.ts:32,39-49,57-67,82-99,117-136,146-158,160-202`; `app/api/admin/photos/[id]/route.ts:24-44,46-68`.
- `components/admin/PhotoManager.tsx:42-46,56-94,102-120,136-208,216-238,240-244`.

Customizer and publish
- `app/admin/c/[id]/customizer/page.tsx:13-39,54-64`.
- `components/admin/CustomizerShell.tsx:35-36,72-107,110-150,152-172,198-238,240-315,325-331,334-338,340-427,429-522,524-541,546-648,651-696,700-722,724-766`.
- `components/admin/SectionInspector.tsx:19-94`; `PreviewPane.tsx:1-80`.
- `components/admin/ThemePicker.tsx:23-27,54-75,101-127,129-178,194-208,210-256,263-280,298-309`; `AccentField.tsx:8-14,25-95`; `TypefaceField.tsx:10-14,22-68`; `ThemeCards.tsx:14-70`.
- `app/api/admin/catalogues/[id]/modules/route.ts:14,23-58`.
- `app/api/admin/catalogues/[id]/publish/route.ts:18-80,83-91`; `components/admin/CreditPanel.tsx:12-71`; `app/api/admin/credits/request/route.ts:21-59`; `app/api/admin/credits/route.ts:9-19`.
- `components/admin/SaveState.tsx:20-41`.

Overview, delivery, couple, handover
- `app/admin/c/[id]/page.tsx:29-36,39-51,53-72,75-77,83-93,107-116,133-146,148-168,170-186,189-198,207-243,246-258,262`.
- `lib/admin/setup-checklist.ts:26-94`; `components/admin/SetupChecklist.tsx`; `CatalogueAnalytics.tsx:17-36`; `PublicLink.tsx:16-74`.
- `components/admin/SendToCouple.tsx:20-57,67-97,99-109`; `app/api/admin/catalogues/[id]/deliver/route.ts:14,27-59`.
- `lib/notify/send.ts:16-49,61-95`; `lib/notify/templates.ts:16-29`; `lib/i18n.ts:153-174`; `.github/workflows/notify-drain.yml:1-31`.
- `components/admin/CoupleAccountPanel.tsx:36-58,70-122,124-204`; `app/api/admin/catalogues/[id]/couple/route.ts:17-26,40-64,66-107,109-133`.
- `components/admin/HandoverPanel.tsx:40-64,70-94,96-105,155-229,237-244`; `app/api/admin/catalogues/[id]/transfer/route.ts:20-44,46-93,101-154,157-172`.
- `components/admin/SaveAsStyle.tsx:13-41,52-81`.

Settings, studio, styles, domains
- `app/admin/c/[id]/settings/page.tsx:12-21,38-49`; `components/admin/CatalogueSettings.tsx:22-48,50-66,78-171,173-220,227-236,238-253,255-286`.
- `app/api/admin/catalogues/[id]/route.ts:25-68,70-86,88-134,148-187,190-196`.
- `app/admin/studio/page.tsx:20-31,47,49-59,61-68,70-77`; `components/admin/StudioBranding.tsx:14-29`; `app/api/admin/studio/route.ts:11,26-37`.
- `app/admin/studio/styles/page.tsx:20-30,63-116`; `styles/[id]/page.tsx:12-55`; `components/admin/HouseStyleEditor.tsx:22-57,59-73,75-102,104-121,125-147,172-208,210-248,250-290`; `HouseStyleActions.tsx:7-120`.
- `app/api/admin/presets/route.ts:22-25,27-32,34-66`; `presets/[id]/route.ts:21-29,31-56,58-73`.
- `components/admin/DomainPanel.tsx:21-36,57-96,104-137,141-165,167-173,175-249,251-270,283-301`.
- `app/api/admin/domains/route.ts:21-24,26-32,34-74`; `domains/[id]/route.ts:12-25`; `domains/[id]/check/route.ts:18-29`.
- `lib/domains/index.ts:13-33,36-38,41-55,57-80,86-95,101-128`; `instructions.ts:39-62,64-118`; `provider.ts:13-17,19-31,34-65,69-78`; `verify.ts:42-50,61-99`.
- `lib/address.ts:41-44,85-98`; `lib/catalogue-access.ts:30-64`.

Data model and configuration
- `supabase/migrations/0001_initial_schema.sql:12-30,35-73,78-119,125-145`; `0004_partners.sql:17-22,35-40,50`; `0005_transfers.sql:11-41`; `0006_entitlements.sql:16-53`; `0007_storage_only.sql:9-10`; `0009_notifications.sql`; `0010_platform_writes.sql:11-13`; `0011_draft_branding.sql`; `0012_content_waits_for_publish.sql:10-11`; `0013_locale.sql:10-12`; `0014_notification_dedupe.sql:11-13`; `0016_tenant_path.sql:10-31`; `0017_credentials.sql:10-27`; `0018_couple_accounts.sql:13-17`; `0019_themes.sql`; `0020_presets.sql:9-29`; `0021_credits.sql:7-21`; `0023_domains.sql:7-29`; `0024_premiere.sql:6-7`; `0025_occasions.sql:3-4`.
- `lib/db/repository.ts:73-82,116-139,148-164,206,221-226,239,250-282,306,333,346-352`.
- `lib/env.ts:35-46,48-62,64-69,100-104,106-116,118-133,145,161-172,174-175,190-325`.

Docs consulted
- `docs/PRODUCT.md:70-104,262-291,299-319`; `docs/NEXT.md:20-45,64-256,496-507`; `docs/spec/16-platform-v2.md:23-40,44-99,102-146,150-171,232-249,275-289,293-310,338-351,355-365,378-392`; `docs/DEPLOYMENT.md:378-456`; `docs/USAGE-GUIDE.md:41-99`.

Tests that exercise this subsystem (for coverage, not evidence of behaviour)
- Unit: `tests/unit/partner-registration.test.ts`, `credits.test.ts`, `house-styles.test.ts`, `domains.test.ts`, `couple-accounts.test.ts`, `transfer.test.ts`, `templates.test.ts`, `setup-checklist.test.ts`, `catalogue-health.test.ts`, `studio-branding.test.ts`, `login-security.test.ts`, `captcha.test.ts`, `credential-links.test.ts`, `entitlements.test.ts`, `photos.test.ts`, `content-publishing.test.ts`, `premiere.test.ts`, `catalogue-delete.test.ts`.
- E2E: `e2e/admin.spec.ts`, `operator.spec.ts`, `upload.spec.ts`, `publish-state.spec.ts`, `credits.spec.ts`, `domains.spec.ts`, `auth.spec.ts`, `premiere.spec.ts`, `responsive.spec.ts` (every console spec except `responsive` skips on mobile: "the admin console is a desktop tool").
