# Subsystem map — `guest` (the wedding page)

Mapped 16 September 2026 against the code on `main` (HEAD `96fb305`, clean tree). Where a document
and the code disagree, the code is what is described and the disagreement is listed in §7. Line
numbers refer to the files as read on this date.

---

## 1. Summary

The guest subsystem is everything a wedding's actual audience touches: the studio-branded,
red-on-black streaming page a couple's family and friends open from a WhatsApp link, with no
account and no app to install. One route tree (`app/c/[slug]/**`) serves every wedding, mirrored
onto a studio's or couple's own domain by `app/d/[host]/[[...rest]]/page.tsx`, which resolves the
host to a catalogue and renders the identical page components — nothing about the guest tree knows
which host it is on. A wedding's look and sections are read entirely from that catalogue's
`branding` and `modules` — a billboard, poster rows, a letter, a photo gallery — rendered by a
module registry (`modules/registry.ts`) that no route ever switches on. `lib/catalogue-access.ts`
is the single gate every guest page and most guest APIs go through: draft is never a 404 ("not yet
available" instead), a lapsed plan is a renewal screen with the download link on it, a premiere is
a countdown anyone with the link may watch, and a passcode gates content but never the countdown.
A guest may pick a household label ("Bride's side" / "Groom's side" / "Friends" / "Family") so the
page remembers where they stopped watching, but nothing else about them is collected — no account,
no email, no name; two client-held tokens (a signed passcode-grant cookie and a profile id in
`localStorage`) are the entirety of guest "identity". Playback is short-lived signed HLS tokens
minted per catalogue-and-title, resumable, and instrumented against a 1.5-second start budget;
everything a couple was given — films and photographs — can always be downloaded as a manifest of
direct links, lapsed or not, because "nothing is ever deleted" is a promise this code keeps even
after a studio has stopped billing for it.

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Guest** (unauthenticated, no account, ever) | No session of any kind. Identified only by client-held tokens: a `mehfilbox_pc_<slug>` signed passcode-grant cookie (`lib/auth.ts:81-99`), a `mehfilbox.profile.<slug>` id in `localStorage` (`components/streaming/CatalogueProvider.tsx:57,90-91`), and a `mehfilbox.guest` UUID for likes (`components/streaming/LikeButton.tsx:8,17-24`) | Whatever `resolveAccess` says the catalogue currently shows (`lib/catalogue-access.ts:30-64`) |
| **A guest who picks a profile label** | `POST /api/profiles` writes a `profiles` row keyed to one of four fixed labels, never free text (`app/api/profiles/route.ts:17-21,23-40`; `PROFILE_LABELS`, `lib/schema.ts:75-77`) | Server-remembered resume positions and progress bars, scoped to that label on that device |
| **A guest who skips the gate** | `profileId` stored as the literal string `'skipped'` (`CatalogueProvider.tsx:99`; `ProfileGate.tsx:46,59-63`) | Everything except server-remembered resume — `Continue Watching` never appears for them (`modules/continue-watching/index.ts` has no fallback path) |
| **The couple, viewing their own wedding** | No special role on this surface — the same `resolveAccess` verdict as any other visitor. Their sign-in to *manage* the wedding is a different subsystem (`studio`) that happens to render through this same component tree in its customizer preview (CLAUDE.md deviation 1) | Nothing extra here |
| **A crawler / link-unfurler** (WhatsApp, iMessage, Slack) | Fetches `GET /api/og?catalogue=<slug>` (`app/api/og/route.tsx:20-42`). Every guest page declares `robots: { index: false, follow: false }` (`app/c/[slug]/page.tsx:50`; `watch/[titleSlug]/page.tsx:23`) | An image, a title and a description — never the page itself in a search index |
| **A script probing for a catalogue slug or a passcode** | Met by per-device and per-catalogue rate limits, and after three failures a captcha challenge if a driver is configured (`app/api/passcode/route.ts:27-58`; `CHALLENGE_AFTER`, `lib/captcha/config.ts:17`) | A generic, identical refusal whether the catalogue exists or not (`passcode/route.ts:61-68`) |
| **A studio operator, opening the public link to check it** | Reaches the guest surface exactly as a guest does — no elevated verdict, no bypass of drafts or passcodes (only the admin's own preview/customizer, out of this scope, can see an unpublished page) | Same as Guest |

## 3. Capabilities

Addressing (tenant path, `/c/` alias, custom domain)

- Host-and-path → route rewrite, decided once at the edge and stamped onto the request so pages never re-derive it — `middleware.ts:21-122`.
- **Path mode** (`TENANCY_MODE=path`, the default and what production runs): `<root>/<studio>/<wedding>[/…]` is rewritten onto `/c/<wedding>[/…]`, marked with the studio segment (`x-mehfilbox-tenant`, `x-mehfilbox-catalogue` headers) — `middleware.ts:34,50-57`; `lib/tenant.ts:152-160` (`parseTenantPath`).
- **Subdomain mode** (retired as a product, kept for the Playwright harness): `<wedding>.<root>` resolves via `resolveTenant` into `marketing` / `admin` / `catalogue` / `custom-domain` / `unknown` — `lib/tenant.ts:23-111`; a `?__catalogue=` query param or cookie lets bare `localhost:3000` reach a catalogue in dev/CI with no wildcard DNS, gated to non-production — `middleware.ts:63-76`.
- **Custom domain** (doc 16 §1): any host that is not the root, `www`, or a loopback is a candidate; middleware cannot query the database, so it rewrites blind to `/d/<host>[/…]` and stamps `x-mehfilbox-host` — `middleware.ts:41-48`; `lib/tenant.ts:74-81` (`isCustomHost`). `app/d/[host]/[[...rest]]/page.tsx:34-53` resolves the host against the `domains` table (must be `status='active'`) to a catalogue slug, then renders the **same** `app/c/[slug]/**` page components directly (no second guest tree) — `app/d/[host]/[[...rest]]/page.tsx:66-90`.
- One function decides every printed URL, subdomain or path — `catalogueUrl`, `cataloguePath`, `adminUrl`, `rootUrl` (`lib/tenant.ts:168-215`), consumed through `lib/address.ts`'s `publicUrlOf`/`basePathOf`/`addressFor` (`lib/address.ts:31-77`).
- Canonical-address enforcement: a request that lands on a stale form of the address (a legacy bare `/c/<wedding>` link, a wrong studio segment, or the mehfilbox path once a custom domain is active) is redirected to the one address the product prints — `requireCanonicalAddress`, `lib/address.ts:85-98`; a live custom domain issues a **permanent** redirect (`:93`), a wrong tenant segment a normal one (`:97`), and the deep-link suffix and query string (`?title=`, `?t=`) ride along — `app/c/[slug]/page.tsx:96-100`; `watch/[titleSlug]/page.tsx:44-48`.
- Reserved path roots (`c`, `d`, `claim`, `my`, `login`, …) protect every top-level route the app owns from ever colliding with a studio's slug — `lib/tenant.ts:120-139`.

Access control (the five verdicts)

- One function decides what any guest request may see: `resolveAccess(slug)` → `ok | missing | draft | locked | lapsed | premiere` — `lib/catalogue-access.ts:16-64`.
- Lapsed is checked **before** publish state and before the passcode, so a couple whose plan ended always lands on the renewal screen, never on anything that reads as "your wedding is gone" — `catalogue-access.ts:36-40`.
- The expiry date is authoritative independent of the stored status flag — compared as a plain date string so a catalogue serves the whole of its last day in any guest's timezone — `catalogue-access.ts:42-48`.
- A premiere date in the future outranks the passcode: anyone with the link sees the countdown, because the code is for the films, not the page's existence — `catalogue-access.ts:51-54`.
- The API variant of the same decision, expressed as doc-07 error codes (`requireServableCatalogue`) — `catalogue-access.ts:71-88`; draft and missing are deliberately the *same* code (`CATALOGUE_NOT_FOUND`) so an API caller cannot distinguish "no such wedding" from "not published yet".
- A separate, narrower gate for downloads (`resolveDownloadAccess`) deliberately skips the lapsed/draft checks — a plan ending must never take away what was already handed over — but still enforces the passcode — `lib/downloads.ts:29-55`.
- The read that decides access is cached (content, never permission): `unstable_cache` keyed on slug with a generation tag so a stale shape from before a migration cannot be served as if current — `lib/catalogue-cache.ts:23-73`. Every write path a guest could notice calls `revalidateCatalogue` — `catalogue-cache.ts:75-85`.
- Guests never reach Postgres directly: RLS grants nothing to `anon` on any guest-relevant table, and the app always reads/writes with the service-role key server-side — `supabase/migrations/0002_row_level_security.sql:85-109`.

The profile gate and resume

- Full-screen gate on first visit, rendered client-only so it never appears in the server HTML for a returning guest — `components/streaming/ProfileGate.tsx:26-131`; four fixed labels, never a personal name — `ProfileGate.tsx:94-116`; `PROFILE_LABELS`, `lib/schema.ts:75-77`.
- Choosing a tile calls `POST /api/profiles`, which is entitlement-gated (`requireServableCatalogue`) and rate-limited 20/min per IP — `app/api/profiles/route.ts:23-40`; a failed request lets the guest through anyway rather than blocking on a convenience — `ProfileGate.tsx:60-63`.
- The choice (or the skip) is remembered in `localStorage` per catalogue slug, read once after mount so it never flashes — `CatalogueProvider.tsx:57,88-102`.
- Resume positions hydrate two ways: server-rendered on first paint when a `?profile=` query already names one (deep link from a shared URL) — `app/c/[slug]/page.tsx:107-113` — and fetched client-side once a stored profile id is known — `CatalogueProvider.tsx:104-117`; `GET /api/progress?profileId=`.
- `<html lang>` is corrected on the client to the catalogue's own locale rather than the cookie the root layout used, because the layout has no catalogue in scope — `CatalogueShell.tsx:62-75`.

Browse and modules

- The whole guest tree is one client component (`CatalogueShell` → `CatalogueProvider` → `ModuleRenderer`) — a deliberate, argued deviation from the spec's server-component sketch so the customizer's live preview can mount the identical tree (CLAUDE.md "Deliberate deviations" §1; `CatalogueShell.tsx:36-46`).
- `ModuleRenderer` walks `catalogue.modules` in order and renders each from the registry with **no switch on module type anywhere** — `components/streaming/ModuleRenderer.tsx:24-70`; the registry is the one file that imports every module — `modules/registry.ts:20-33`.
- An unknown module type or a config that fails its own Zod schema is skipped and logged, never a crash on a live page — `resolveInstances`, `modules/registry.ts:61-87`.
- Sections accumulate which titles they've already shown (`consumedTitleIds`) so an auto-filling row never repeats the row above it, driven entirely by each module's own `consumes` — `modules/contract.ts:60-67`; `curated-row`'s single selection rule shared by render and by `consumes` — `modules/curated-row/select.ts:10-29`.
- Eight module types ship: `billboard` (hero, singleton, trailer with a 1.5s no-motion delay and three network/motion refusals) — `modules/billboard/Guest.tsx:28-53`; `curated_row` (manual or self-filling row); `photo_row` / `photo_grid` (album-scoped, open into the lightbox); `letter` (paragraph-reveal prose, the one section a couple can rewrite post-handover, D-37) — `modules/letter/index.ts:44-56`; `continue_watching` (Phase 1, singleton, reads resume state already in context rather than fetching its own) — `modules/continue-watching/Guest.tsx:22-61`; `timeline` and `checklist` (Phase 1) — `modules/timeline/index.ts`, `modules/checklist/index.ts`; `randomiser` (Phase 1, picks one suggestion client-side, remembers nothing).
- Guests always see the **published** module order — the browse page calls `effectiveModules(catalogue, false)`, so draft edits never leak — `app/c/[slug]/page.tsx:125`; `lib/db/repository.ts:401-404`.
- Deterministic generated poster/hero art keyed off the title's slug, themed per catalogue palette, for the roughly half of weddings with no photography ready — `lib/poster.ts` (`posterDataUri`, `paletteFor`, `motifFor`).
- Empty is not rendered: a row, letter, checklist, gallery or randomiser with nothing to show returns `null` rather than a heading over a blank strip (every module's own early return, e.g. `PosterRow.tsx:93`, `letter/Guest.tsx:20`).

Player and token flow

- The player chunk is code-split onto its own route with SSR off, so it never inflates the 150KB browse-page budget — `components/streaming/WatchScreen.tsx:14-17`.
- `POST /api/playback/token` does exactly three things — authorise, mint, look up resume — targeting p99 <120ms — `app/api/playback/token/route.ts:19-65`; the token is bound to catalogue **and** title so a leaked token cannot unlock the rest of the library — `provider.ts:80-88`; `bunny.ts:96-134` (directory-signed, not file-signed, so child playlists and segments inherit the same signature).
- Client attach logic picks native HLS only on iPhone Safari (the one browser genuinely without Media Source Extensions) and hls.js everywhere else, keyed off MSE support rather than the unreliable `canPlayType('maybe')` — `components/streaming/useHlsPlayback.ts:70-89`.
- A 401/403 mid-playback triggers a silent token refresh that reattaches the same position rather than restarting — `useHlsPlayback.ts:149-166`.
- Resume: the token response carries `resumeAtS`; a `?t=` deep link overrides it — `Player.tsx:65-76`; a visible "Resuming from…" notice offers "Start over" — `Player.tsx:251-270`.
- Progress heartbeat every 10s while playing, plus on pause and on unload via `sendBeacon`, measuring seconds actually watched rather than wall-clock time — `components/streaming/useProgressHeartbeat.ts:23-96`; server-side a view only counts once the guest crosses 30 watched seconds, and only once — `app/api/progress/route.ts:69-75`.
- Quality-of-experience beacons for the metric doc 05 §6 calls the one the product lives or dies on: press-play→first-frame, and a rebuffer ratio — `components/streaming/useQoe.ts:32-146`; `POST /api/qoe` logs them with an `overBudget` flag against `PLAYBACK_START_MS`/`REBUFFER_RATIO` — `app/api/qoe/route.ts:39-89`; `lib/budgets.ts:19-23`.
- Full keyboard map (space/k play, arrows seek/±10s, f fullscreen, m mute, Escape back), every control ≥44px and labelled — `components/streaming/Player.tsx:178-216,377-396`.
- Sibling navigation and prefetch in the title modal: opening a title warms its playback token *and* the HLS manifest so the first segment is often already cached by the time Play is pressed — `components/streaming/TitleModal.tsx:44-63`.
- A title's poster is a stable, never-expiring app URL (`/api/poster/<titleId>?file=…`) that mints a fresh signed CDN redirect per request, so a cached page or an OG image never bakes in a URL that later 403s — `app/api/poster/[titleId]/route.ts:10-71`.

Photographs and the lightbox

- Responsive `srcset` (2048/1024/480) built from the stored master URL, with a graceful empty string for photographs uploaded before renditions existed — `lib/photos/srcset.ts:21-28`.
- Two module shapes: `photo_row` (scrolling) and `photo_grid` (masonry, first 12 eager) — `modules/photo-grid/Guest.tsx:10-77`.
- Full-screen `Lightbox`: swipe on touch, ←/→ and Esc on keyboard, focus-trapped, pinch-zoom left to the OS — `components/streaming/Lightbox.tsx:26-153`.
- A photograph has its own shareable address (`?photo=<id>` on the current page, not a route of its own) that reopens the lightbox directly on load and tracks swiping with `replaceState` so history isn't polluted — `components/streaming/usePhotoDeepLink.ts:21-65`; shared by both photo modules so a link behaves identically regardless of which section it came from.

Likes

- A heart with a count on both films and photographs, counted across every guest and shown to all of them — `components/streaming/LikeButton.tsx:49-150`; keyed on a device-minted `localStorage` UUID rather than a profile, because the profile gate is routinely skipped — `LikeButton.tsx:17-24`; `POST/GET /api/likes` — `app/api/likes/route.ts:31-59`.
- Optimistic UI: the heart fills and the count moves before the network responds, and rolls back only on a genuine failure — `LikeButton.tsx:92-123`.
- `likes` is a plain `(catalogue, guest_key, subject_type, subject_id)` primary key with no foreign key on `subject_id` by design (a title or a photo, one column, two tables) — `supabase/migrations/0008_likes.sql`.

Share (WhatsApp and copy link)

- One component, three shapes: the full pill in the title modal, `compact` in the lightbox, `nav` (icon, popover) in the top bar — `components/streaming/ShareButton.tsx:18-128`.
- `navigator.share` first — on a phone this is the actual WhatsApp/Instagram/SMS sheet — falling back to a `wa.me/?text=` prefilled link plus copy-to-clipboard — `ShareButton.tsx:48-58,78-93`.
- Three things are shareable, each with its own URL and text: the whole wedding from the top bar (`shareUrl`/`shareText` props, carries the studio's referral via `?ref=` on the platform-credit link) — `components/chrome/TopNav.tsx:74-82`; `CatalogueShell.tsx:107-110,135`; one film from the title modal (`/watch/<slug>`) — `TitleModal.tsx:86-87,164`; one photograph from the lightbox (the deep-link URL above) — `Lightbox.tsx:78`.

Locale

- One dictionary, English mandatory, Hindi an optional overlay that silently falls back — never a raw key, never blank text — `lib/i18n.ts:1-7,378-384`.
- What a guest sees **before** touching the toggle is the catalogue's own default (the studio's language, copied at creation), not a hardcoded English — `guestLocale()`, `lib/guest-locale.ts:22-25`; the toggle writes a cookie and reloads — `TopNav.tsx:110-114`.
- `resolveLocalised` applies the identical silent-fallback rule to operator-authored content (couple names, synopses, module text) as `translate` applies to the product's own strings — `lib/i18n.ts:395-404`.

Downloads

- Everything a couple was ever given, as a manifest of direct signed/CDN links — never a server-built zip — `lib/downloads.ts:9-20,71-115`; survives expiry, grace and archive by design, checked against `publishedAt` rather than current `status` — `downloads.ts:42-47`.
- Server-rendered with no client JavaScript at all, deliberately, because a couple reaching this page is often already dealing with something having gone wrong — `app/c/[slug]/download/page.tsx:11-21`.
- One film failing to yield a link does not empty the list — it is counted and disclosed ("N could not be reached right now") rather than erroring the whole page — `downloads.ts:82-93`; `download/page.tsx:104-110`.
- The link is reachable from the renewal screen, the site footer of every page, and directly — never gated behind a working plan — `app/c/[slug]/renew/page.tsx:60-65`; `components/chrome/SiteFooter.tsx:38-42`.

Error and edge states (what a guest sees)

- Unknown/wrong slug or an unpublished wedding → a themed, localised "not quite ready" / "nothing published yet" shell, HTTP 200, never a 404 — `app/c/[slug]/page.tsx:73-78,141-153`.
- Locked (passcode) → `/locked`, shake-on-wrong-code, generic rejection message, 5 attempts then a 15-minute lockout, a captcha widget after 3 — `components/streaming/PasscodeGate.tsx:17-121`; `app/api/passcode/route.ts:27-58`.
- Lapsed → `/renew`, listing the films by name, an email-us link and the download link, never deletion language — `app/c/[slug]/renew/page.tsx:13-70`.
- Before the premiere → `/premiere`, a live countdown ticking client-side from a server-handed instant, flipping to a Play button at zero without a reload — `components/streaming/PremiereScreen.tsx:36-101`.
- A genuinely nonexistent path (no tenant match at all) → the generic, English-only, unthemed Next `not-found.tsx` — `app/not-found.tsx:1-15` (see §7 for the inconsistency this creates).
- Playback failure states are distinguished for the guest: "still processing" vs. "not available right now" vs. "connection dropped, retrying…", each with its own copy and a retry affordance where one makes sense — `useHlsPlayback.ts:46-52,168-175`; `Player.tsx:238-249`.
- Every API error follows one shape and one rule: a 500 never leaks the real message, only "Something went wrong" — `lib/http/errors.ts:54-70`; `lib/http/handler.ts:10-35`.

## 4. Workflows

### W1 · Arrive at a catalogue (addressing)

| # | Step | Where | Data written | Failure modes (what a guest sees) |
|---|---|---|---|---|
| 1 | Guest opens a link: `<root>/<studio>/<wedding>` (path mode, production), `<wedding>.<root>` (subdomain mode, non-production), or a custom domain | `middleware.ts:21-122` | Response headers only (`x-mehfilbox-tenant`, `x-mehfilbox-catalogue`, `x-mehfilbox-host`) | A path with no reserved-root clash and no two-segment match falls through unrewritten to Next's own router → the generic `not-found.tsx` (see §7 item 5) |
| 2 | Path mode: a custom host is rewritten blind to `/d/<host>[/…]`; otherwise `parseTenantPath` rewrites `/<studio>/<wedding>[/…]` to `/c/<wedding>[/…]` | `middleware.ts:34,41-57`; `lib/tenant.ts:74-81,152-160` | — | — |
| 3 | The page (`app/c/[slug]/page.tsx` or a sibling, or `app/d/…` re-resolving the host) calls `resolveAccess(slug)` | `lib/catalogue-access.ts:30-64` | — | See W2 |
| 4 | On an accepted verdict, `requireCanonicalAddress` checks the request arrived on the address the product actually prints | `lib/address.ts:85-98` | — | A live custom domain → permanent redirect there (`:93`); a legacy `/c/` link or wrong studio segment → ordinary redirect to the canonical path, `?title=`/`?t=` preserved (`:94-97`) — silent, by design, never an error page |
| 5 | On a custom domain, `/d/[host]/[[...rest]]/page.tsx` re-resolves the host against `domains` and renders the identical `/c/<slug>` page components | `app/d/[host]/[[...rest]]/page.tsx:34-90` | — | `domains.status != 'active'`, or a studio-domain wedding whose `served_at` doesn't match the host → `notFound()` (`:40,51,69`) |

### W2 · The access verdict

`resolveAccess` (`lib/catalogue-access.ts:30-64`) is a strict cascade, checked in this order — every guest route and API re-derives the same answer rather than trusting a cached one:

1. Cached lookup by slug; nothing found → **missing** (`:33-34`).
2. `subStatus` not in `included`/`active`/`grace` → **lapsed** (`:38-40`) — checked before publish state.
3. `includedUntil` date has passed (string-compared) → **lapsed**, overriding a stale `subStatus` (`:42-48`).
4. `status !== 'published'` → **draft** (`:50`).
5. `premiereAt` set and still in the future → **premiere** (`:51-54`).
6. `privacy === 'passcode'` and no valid, version-matched grant cookie → **locked** (`:56-61`).
7. Otherwise → **ok** (`:63`).

How each surface answers the same verdict:

| Verdict | Browse page (`app/c/[slug]/page.tsx`) | Watch page | API (`requireServableCatalogue`) | Downloads (`resolveDownloadAccess`, separate rule) |
|---|---|---|---|---|
| missing | Localised "nothing here yet" shell, HTTP 200 (`:74-78,141-153`) | `notFound()` (real 404) | `CATALOGUE_NOT_FOUND` (404) | `missing` → `notFound()` |
| draft | Same shell, "not published yet" copy | `notFound()` | `CATALOGUE_NOT_FOUND` (same code as missing) | `missing` (no `publishedAt` yet) |
| locked | Redirect to `/locked` | Redirect to `/locked` | `PASSCODE_REQUIRED` (401) | `locked` if `publishedAt` is set and the code is unmet |
| lapsed | Redirect to `/renew` | Redirect to `/renew` | `SUBSCRIPTION_INACTIVE` (402) | **not checked** — a lapsed plan still downloads (`downloads.ts:29-37`) |
| premiere | Redirect to `/premiere` | Redirect to `/premiere` | `CATALOGUE_NOT_FOUND` (deliberately, "not yet, not a secret") | not checked (downloads exist only once published, and premiere implies published) |
| ok | Renders the wedding | Renders the player | Proceeds | `ok` |

Failure modes a guest can hit are exactly the destination pages/messages in §3 "Error and edge states"; there is no state this cascade produces that is not one of the six named verdicts.

### W3 · Unlock with a passcode

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | Redirected to `/locked` (from browse or a deep watch link) or opened directly | `app/c/[slug]/locked/page.tsx:13-49` | — | `verdict.kind==='ok'` (already unlocked) or `'premiere'` → bounced onward instead of shown the form (`:23-24`) |
| 2 | Types the code, submits | `components/streaming/PasscodeGate.tsx:41-74` | — | Empty/short values simply disable Submit |
| 3 | `POST /api/passcode` — device bucket (5/15 min) **and** catalogue-wide bucket (30/15 min) both consumed | `app/api/passcode/route.ts:27-29,52-58` | — | Either exhausted → 429 "Too many attempts", with a retry-after; the catalogue-wide bucket exists so a guess spread across many devices still hits a wall (D-34) |
| 4 | ≥3 prior failures on this device and a captcha driver configured → token required | `passcode/route.ts:44-50`; `CHALLENGE_AFTER=3`, `lib/captcha/config.ts:17` | — | Missing/failed token → "Please complete the check" |
| 5 | Compare against `passcodeHash` (scrypt) | `passcode/route.ts:60-68` | — | Wrong code, *or* an unknown catalogue slug, both → the same generic "That passcode did not work" — existence is never confirmable from this endpoint |
| 6 | Correct → device bucket reset, a signed grant cookie issued (30-day TTL, carries `catalogueId` + `passcodeVersion`) | `passcode/route.ts:70-77`; `lib/auth.ts:81-99` | Cookie only — nothing server-side records who unlocked what | — |
| 7 | Client redirects to the catalogue's own base path and refreshes | `PasscodeGate.tsx:56-61` | — | — |

Note: the passcode POST does not itself check `status`/`subStatus` before verifying the code (only `resolveAccess`'s later ordering keeps a lapsed or draft catalogue from actually showing content once "unlocked" — see §7).

### W4 · Wait for the premiere

1. `resolveAccess` returns `premiere` for a published wedding whose `premiereAt` is still ahead — anyone with the link, code or no code — `catalogue-access.ts:51-54`.
2. `/premiere` renders a countdown computed from the server-sent instant, ticking client-side in one-second steps; days/hours/minutes/seconds, localised labels, `aria-label` carries the same numbers for a screen reader — `app/c/[slug]/premiere/page.tsx:17-53`; `components/streaming/PremiereScreen.tsx:24-101`. The clock reconciles a couple's zone and wall time without a date library, correcting across a DST boundary in two passes — `lib/time.ts:39-70`.
3. At zero, the countdown is replaced by a "Watch now" link to the catalogue's own base path — no reload required — `PremiereScreen.tsx:66-75`.
4. A guest who arrives after the moment has passed, or on a wedding with no premiere set at all, is redirected straight back to browse rather than shown a stale countdown — `premiere/page.tsx:22-24`.

Data written: none. Failure/edge: a guest reaching `/premiere` for a catalogue that is actually `draft` or `lapsed` is bounced to the browse page, which then applies the normal draft/lapsed redirect (`premiere/page.tsx:24`); no email or notification is part of this file (the studio's own lifecycle notifications — `notify.expiry`/`notify.grace` — are a separate, billing-side concern, `lib/i18n.ts`'s `notify.*` keys).

### W5 · A lapsed wedding — the renewal screen

1. `resolveAccess` returns `lapsed` (checked before draft, before the passcode) — `catalogue-access.ts:36-48`.
2. `/renew` lists every published film by name (so the couple sees exactly what is still theirs), an `mailto:` link to `SUPPORT_EMAIL`, and — the most load-bearing link on the screen — the download page — `app/c/[slug]/renew/page.tsx:13-70`.
3. The wording is deliberately never "deleted" or "expired-and-gone": the plan lapsing is a billing state, not a threat to the content — `renew/page.tsx:13-19` (comment), matching the download subsystem's own reasoning (`lib/downloads.ts:9-20`).

Data written: none on this path. Failure modes: none distinct — a `missing` slug at this URL still 404s (`renew/page.tsx:23`).

### W6 · Browse: the profile gate, the billboard, and rows

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | First visit, no stored profile → full-screen gate mounts client-side after hydration (never in server HTML) | `components/streaming/ProfileGate.tsx:26-66` | — | A returning guest with a stored id (or `'skipped'`) never sees it again |
| 2 | Wordmark scales in over ~600ms, then four tiles fade in | `ProfileGate.tsx:38-44,74-93` | — | — |
| 3 | Tap a tile → `POST /api/profiles` | `app/api/profiles/route.ts:23-40` | `profiles` row: `id, catalogue_id, label, avatar_seed, created_at` | Request failure → treated as "skip", guest let through (`ProfileGate.tsx:60-63`); 20/min-per-IP limit exceeded → `RATE_LIMITED` |
| 4 | Or "Skip for now" | `ProfileGate.tsx:120-127,46` | — | — |
| 5 | Choice persisted client-side | `CatalogueProvider.tsx:93-102` (`localStorage` key `mehfilbox.profile.<slug>`) | — | Private-browsing/blocked storage → the gate reappears every visit (no server fallback) |
| 6 | Main content renders via `ModuleRenderer`, walking published `modules` in order | `components/streaming/CatalogueShell.tsx:112-126`; `modules/registry.ts:61-87` | — | Empty catalogue (no titles, no photos) → a plain empty-state message instead of any module (`CatalogueShell.tsx:113-115`) |
| 7 | Billboard renders the featured (or first) film; trailer fades in after 1.5s if motion/network allow | `modules/billboard/Guest.tsx:18-53` | — | No published titles at all → billboard renders nothing (`consumes`/`resolveFeatured` return null) |
| 8 | A poster clicked opens the title modal via `pushState` (`?title=`); Play from inside it navigates to `/watch/<slug>` | `CatalogueProvider.tsx:119-161` | — | Android/back closes the modal rather than leaving the site (`:126-139`) |

### W7 · Open a title and play it

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | Card tapped → title modal opens, URL gains `?title=<slug>` | `components/streaming/TitleModal.tsx:31-63,89-196` | — | — |
| 2 | Modal mount prefetches a playback token and warms the HLS manifest | `TitleModal.tsx:44-63` | — | A film not `status==='ready'` shows "This film is still being prepared" instead of Play (`:161`) |
| 3 | Guest presses Play → route to `/watch/<catalogueBase>/<titleSlug>[?t=]` | `CatalogueProvider.tsx:152-161`; `TitleModal.tsx:150-159` | — | — |
| 4 | Watch page re-checks `resolveAccess`, then `requireCanonicalAddress`, then loads the title by slug | `app/c/[slug]/watch/[titleSlug]/page.tsx:36-64` | — | Verdict not `ok` → redirected to `/locked`/`/renew`/`/premiere`; title missing or `!published` → `notFound()` (`:41,51`) |
| 5 | `<Player>` mounts (own route, SSR off), fetches `POST /api/playback/token` | `components/streaming/WatchScreen.tsx:14-46`; `app/api/playback/token/route.ts:25-65` | — | Title `status!=='ready'` or no `providerId` → `TITLE_NOT_READY` (409), shown as "still processing" (`useHlsPlayback.ts:50`); rate limit 60/min per IP+catalogue |
| 6 | Token mints a directory-signed Bunny URL scoped to catalogue+title | `lib/video/bunny.ts:96-134` | — | — |
| 7 | hls.js (or native HLS on iPhone Safari) attaches; ladder starts at 480p, capped to player size | `components/streaming/useHlsPlayback.ts:70-143` | — | A 401/403 mid-stream silently refreshes the token and reattaches at the same position (`:149-166`); a network error shows "connection dropped, retrying…" and restarts the loader (`:168-170`) |
| 8 | Resume position applied from the token's `resumeAtS`, or from a `?t=` deep link which wins | `Player.tsx:65-76` | — | — |
| 9 | Guest plays; controls auto-hide after 3s of inactivity unless a control has focus | `Player.tsx:124-143` | — | — |

### W8 · Resume, progress and playback telemetry

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | Every 10s while playing, on pause, and on tab-hide/unload (via `sendBeacon`) | `components/streaming/useProgressHeartbeat.ts:23-96` | `POST /api/progress` → `playback_progress` upsert: `position_s, duration_s, completed, updated_at` | Fire-and-forget — a failed heartbeat never interrupts playback |
| 2 | Watched-seconds delta (not wall clock; a seek is excluded) recorded alongside | `useProgressHeartbeat.ts:33-45`; `app/api/progress/route.ts:47-59` | `play_events` row (`catalogue_id, title_id, profile_id, seconds`) | A profile/title that doesn't belong to this catalogue is silently ignored (204, no error) — `progress/route.ts:44-45` |
| 3 | Crossing 30 watched seconds counts one view, once | `progress/route.ts:69-75` | `titles.view_count += 1` | — |
| 4 | Past 95% of duration, the title is marked complete | `progress/route.ts:47`; `COMPLETION_THRESHOLD=0.95` | `playback_progress.completed=true` | Removes it from `Continue Watching` on the next render (`modules/continue-watching/Guest.tsx:31`) |
| 5 | On open, `Continue Watching` reads the already-fetched progress map — no extra request | `modules/continue-watching/Guest.tsx:22-38` | — | Under `config.minSeconds` (default 120s) → not resumable yet |
| 6 | Press-play→first-frame and rebuffer ratio beacons | `components/streaming/useQoe.ts:32-146` | `POST /api/qoe` → structured **log lines only** (`qoe.playback_start`, `qoe.rebuffer`, `qoe.playback_error`) — no table row | Malformed beacon → 204, never a 4xx to a player mid-playback (`app/api/qoe/route.ts:41-47`) |

### W9 · Browse and share photographs

1. `photo_grid`/`photo_row` module filters `bundle.photos` by album, renders a masonry grid or a scrolling row — `modules/photo-grid/Guest.tsx:13-77`.
2. Tap opens `<Lightbox>` at that index; swipe (touch), arrow keys, and Esc all navigate/close — `components/streaming/Lightbox.tsx:26-153`; `useFocusTrap`, `components/streaming/useFocusTrap.ts:14-74`.
3. Opening sets `?photo=<id>` via `replaceState` (never `pushState`, so thirty swipes don't fill history) — `components/streaming/usePhotoDeepLink.ts:54-62`.
4. A link carrying `?photo=<id>` opens the lightbox directly on load, at the matching photo, if that section actually holds it — `usePhotoDeepLink.ts:45-51`.
5. From inside the lightbox: Share (WhatsApp / copy) and Like, identical controls to a film — `Lightbox.tsx:78-85`.

Data written: none by browsing itself; a like or a like-toggle is W10. Failure modes: a `?photo=` id not present in *this* page's photo sections stays closed rather than guessing (`usePhotoDeepLink.ts:49-51`) — a link shared from one wedding's gallery never opens something on another's.

### W10 · Like a film or a photograph

1. `<LikeButton>` mounts inside the title modal or the lightbox, fetches this guest's own state for just that one subject — `components/streaming/LikeButton.tsx:69-90`; `GET /api/likes?catalogue=&guestKey=`.
2. Tap flips the heart and count immediately (optimistic) — `LikeButton.tsx:92-99`.
3. `POST /api/likes` toggles the row — `app/api/likes/route.ts:31-44`; `toggleLike` upserts/deletes on `(catalogue_id, guest_key, subject_type, subject_id)` — `supabase/migrations/0008_likes.sql`.
4. Server's real count and liked-state replace the guess — `LikeButton.tsx:112-114`.
5. On failure, the optimistic change is rolled back exactly — `LikeButton.tsx:115-122`.

Data written: `likes` row inserted or deleted. No email. Failure modes: a request failure reverts the heart/count with no visible error (a guest just sees it "not have worked" on the next tap); **no rate limit exists on this endpoint** (see §7).

### W11 · Share the wedding, a film, or a photograph

1. Top bar's share control (whole wedding, carries the studio's `?ref=` referral on the "Made with Mehfilbox" link elsewhere on the page) — `components/chrome/TopNav.tsx:74-82`; `CatalogueShell.tsx:107-110,135`.
2. Title modal's share control (one film, `/watch/<slug>`) — `components/streaming/TitleModal.tsx:86-87,164`.
3. Lightbox's share control (one photograph, the `?photo=<id>` deep link) — `components/streaming/Lightbox.tsx:78`.
4. All three route through the same `<ShareButton>`: `navigator.share` (the actual OS share sheet, WhatsApp included) where available, else a `wa.me/?text=` prefilled link plus copy-to-clipboard in a popover — `components/streaming/ShareButton.tsx:26-127`.

Data written: none — sharing is entirely client-side composition of a URL and text; nothing is recorded server-side about who shared or to whom.

### W12 · Switch language

1. Toggle in the top bar; the active state is a filled pill, not colour alone (WCAG 1.4.1) — `components/chrome/TopNav.tsx:110-138`.
2. Click writes a `mehfilbox_locale` cookie (1-year) and does a full page reload — `TopNav.tsx:112-113`.
3. On the next request, `guestLocale()` prefers the cookie over the catalogue's own default — `lib/guest-locale.ts:22-25`.
4. Every string (product chrome and operator-authored content alike) falls back silently from Hindi to English, never a raw key or blank text — `lib/i18n.ts:378-384,395-404`.

Data written: a cookie only. Failure modes: none — a missing Hindi string is invisible to the guest by design (falls back), which is also the property `tests/unit/i18n.test.ts` enforces (CLAUDE.md working rule).

### W13 · Download everything

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | Guest opens `/download` (from the renewal screen, the footer of any page, or directly) | `app/c/[slug]/download/page.tsx:22-114` | — | `resolveDownloadAccess` not `ok` (missing, never-published, or passcode unmet) → `notFound()` — deliberately does not explain a locked catalogue here, to avoid a second place to probe for a code (`:26-28` comment) |
| 2 | `resolveDownloadAccess` — checks `publishedAt` (not current `status`) and the passcode only | `lib/downloads.ts:38-55` | — | — |
| 3 | `buildManifest` asks the video provider for a signed download URL per film (original if the library still holds it, else the best rendition, labelled) | `downloads.ts:71-101`; `lib/video/bunny.ts:197-228` | — | One film's request failing is counted (`unavailable`) rather than failing the page (`downloads.ts:82-93`) |
| 4 | Photographs are listed as direct CDN links — already files, nothing to sign | `downloads.ts:103-112` | — | — |
| 5 | Page renders server-side, no client JS, links work in any browser or download manager | `download/page.tsx:11-21,53-102` | — | `manifest.unavailable > 0` → disclosed in plain text, never hidden (`:104-110`) |

Data written: none — this is a read-only manifest. No email is part of this route; **no rate limit exists on it** (see §7), and each request can trigger one provider network call per film.

### W14 · The WhatsApp link preview (OG image)

1. Every guest page's `generateMetadata` points `og:image`/`twitter:image` at `/api/og?catalogue=<slug>&v=<publishedAt|createdAt>` — `app/c/[slug]/page.tsx:27-60`; `lib/address.ts:52-55` (`ogImageUrlOf`).
2. The route re-runs `resolveAccess` itself (so a draft or deleted wedding never renders a card) and paints a themed gradient card server-side with `next/og` — `app/api/og/route.tsx:20-102`.
3. Response is cached **immutably** for a year; the `v=` query (the publish timestamp) is the cache-buster, because WhatsApp itself caches previews for days — `og/route.tsx:94-101`; `lib/address.ts:44` comment.
4. Size/shape are asserted in tests against `OG_MAX_BYTES`/`OG_SIZE` (`lib/budgets.ts:9-11`).

Data written: none. Failure modes: unknown/missing catalogue → plain 404 text response, no image (`og/route.tsx:24-27`) — WhatsApp shows a broken-image preview rather than a grey Mehfilbox box.

### W15 · A module remembers a guest's own state (checklist)

1. Ticking an item paints instantly and is written to `localStorage` first — works even for a guest who skipped the profile gate — `modules/checklist/Guest.tsx:64-77`.
2. If a profile id exists, the same tick is posted, fire-and-forget, to `POST /api/module-state` — `checklist/Guest.tsx:78-84`; `app/api/module-state/route.ts:20-37`.
3. On load, device state renders first; server state is merged in only where the device has nothing to say for a given item — `checklist/Guest.tsx:44-58`.

Data written: `module_state` row (`profile_id, module_id, state jsonb, updated_at`). No email. Failure modes: none surfaced to the guest — both the write and the read are swallowed on failure (`checklist/Guest.tsx:75-77`). See §7 for this endpoint's missing access check.

## 5. Data model touched

| Table.column | Read/written by (guest scope) | Migration |
|---|---|---|
| `catalogues.slug, tenant_slug, served_at, status, privacy, passcode_hash, passcode_version, included_until, sub_status, premiere_at, timezone, modules, branding, locale, couple_name, app_name, wedding_date, synopsis, occasion, featured_title_id` | Read-only here — every write to a catalogue is the `studio` subsystem's | `0001_initial_schema.sql:35-73`; `tenant_slug` `0016_tenant_path.sql`; `served_at` `0023_domains.sql:26-28`; `timezone`/`premiere_at` `0024_premiere.sql`; `locale` `0013_locale.sql`; `passcode_version`/`couple_org_id`/`support_access_until` `0018_couple_accounts.sql` |
| `titles.*` (read: `name, synopsis, category, credits, poster_url, thumbnails_url, trailer_url, captions, status, provider_id, duration_s, slug, published, live_at, sort_order`); `titles.view_count` (written) | `getCachedBundle` reads published+live titles (`lib/catalogue-cache.ts:56-73`); `view_count` incremented by `app/api/progress/route.ts:73` | `0001_initial_schema.sql:78-119`; `live_at` `0012_content_waits_for_publish.sql:10`; `watch_seconds`/usage figures `0015_usage_watch_seconds.sql` |
| `albums.*`, `photos.*` (read: `url, lqip, caption, width, height, sort_order, live_at`) | `getCachedBundle` reads live photographs only (`liveOnly: true`) — `catalogue-cache.ts:63-65` | `0001_initial_schema.sql:125-145`; `live_at` `0012_content_waits_for_publish.sql:11` |
| `profiles.id, catalogue_id, label, avatar_seed, created_at` | Written by `POST /api/profiles` — `app/api/profiles/route.ts:30-36` | `0001_initial_schema.sql:150-158` |
| `playback_progress.profile_id, title_id, position_s, duration_s, completed, updated_at` | Written by `POST /api/progress` (upsert); read by `GET /api/progress` and the watch/browse pages' resume hydration | `0001_initial_schema.sql:160-168` |
| `play_events.catalogue_id, title_id, profile_id, seconds, at` | Written by `POST /api/progress` when `deltaS > 0` — `progress/route.ts:61-67` | `0001_initial_schema.sql:179-188` |
| `module_state.profile_id, module_id, state, updated_at` | Written/read by `POST`/`GET /api/module-state` — used today by the `checklist` module | `0001_initial_schema.sql:170-176` |
| `likes.catalogue_id, guest_key, subject_type, subject_id, created_at` | Written/read by `POST`/`GET /api/likes` | `0008_likes.sql` |
| `domains.host, status, catalogue_id, org_id, served_at (on catalogues)` | Read-only by `app/d/[host]/[[...rest]]/page.tsx:39-51` to resolve a custom-domain request to a catalogue | `0023_domains.sql` |
| `usage_rollup.watch_seconds, delivered_gb` | Derived from guest watch time but written by the studio-side usage job, not by anything in this scope | `0001_initial_schema.sql:190-196`; `watch_seconds` `0015_usage_watch_seconds.sql` |

RLS denies `anon` everything on every one of these tables; every guest read/write goes through a Next route using the service-role key — `supabase/migrations/0002_row_level_security.sql:85-109`.

## 6. Configuration

All read through `lib/env.ts` (the only permitted `process.env` reader, enforced by eslint per CLAUDE.md).

| Variable | Effect on the guest surface |
|---|---|
| `TENANCY_MODE` (`path` \| `subdomain`, default `path`) | Which addressing scheme middleware runs — `lib/env.ts:43`; `middleware.ts:34-58` vs. `:60-121`. |
| `ROOT_DOMAIN` (default `lvh.me:3000`) | The domain every printed URL, OG image, and canonical redirect is built from — `lib/env.ts:35`; `lib/tenant.ts`. |
| `ALLOW_EPHEMERAL_DATA` | Enables the `?__catalogue=`/cookie override that lets bare `localhost` reach a catalogue with no wildcard DNS, outside `NODE_ENV=production` — `lib/env.ts:32`; `middleware.ts:73-76`. |
| `DATA_DRIVER` (`memory` \| `file` \| `supabase`) | Which `Repository` implementation serves every guest read/write — `lib/env.ts:48`; `lib/db/index.ts:19-35`. |
| `VIDEO_DRIVER` (`fake` \| `bunny`) + `BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY`, `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY` | Whether playback tokens, posters and downloads are real signed Bunny URLs or the local fake — `lib/env.ts:64-68`. |
| `PHOTO_DRIVER` (`bunny` \| `fake`) | Where photograph renditions are actually served from. |
| `CAPTCHA_DRIVER` (`none` \| `fake` \| `turnstile`) + `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Whether the passcode gate shows a challenge after 3 failures — `lib/env.ts:170-172`; production runs `none` (per `docs/NEXT.md`), so this defence is currently off in the live environment. |
| `PLAYBACK_TOKEN_TTL_S` (default 4h) | How long a minted playback URL stays valid before a silent refresh is needed — `lib/env.ts:177`. |
| `DOMAIN_DRIVER` (`none` \| `fake` \| `vercel`) | Whether a custom domain can ever reach `status='active'`, which gates all of `/d/[host]`. |
| `SUPPORT_EMAIL` | The `mailto:` link on the renewal screen — `app/c/[slug]/renew/page.tsx:50`. |
| `SESSION_SECRET` | Signs both the operator session cookie and the guest passcode-grant cookie (`lib/auth.ts:26-31`) — shared secret across both surfaces. |
| `NODE_ENV` | Governs cookie `secure` flag (`lib/auth.ts:73`) and whether the dev-only catalogue override is reachable. |

## 7. Gaps and rough edges

1. **Two guest-facing endpoints bypass `lib/catalogue-access.ts` entirely**, contradicting the codebase's own stated invariant ("the only place a guest request is authorised… change it once, not per route", `catalogue-access.ts:9-14`):
   - `GET /api/module-state` and `POST /api/module-state` never call `requireServableCatalogue` (or any access check) at all — the POST body schema does not even carry a `catalogue` field, only `profileId`/`moduleId`/`state` (`app/api/module-state/route.ts:14-48`). A checklist's ticks can be read or written for a profile that belongs to a now-draft, lapsed, or passcode-locked catalogue.
   - `GET /api/progress` (the resume-position list, called by every page once a profile id is known) has no access check either — only its sibling `POST` calls `requireServableCatalogue` (`app/api/progress/route.ts:35` vs. `:82-88`). Resume positions for a profile remain readable after the catalogue that owns it is locked or lapses.
   - Practical impact is limited (`profileId` is a server-minted random UUID, not guessable), but both are a real inconsistency in a codebase whose CLAUDE.md explicitly calls this file out as the one place this logic should live.
2. **No rate limiting at all** on three guest-writable/costly endpoints — every sibling guest API (`passcode`, `profiles`, `progress` POST, `playback/token`, `module-state`, `qoe`) calls `lib/http/rate-limit.ts`'s `consume`/`enforce`; these do not:
   - `POST/GET /api/likes` (`app/api/likes/route.ts`) — unlimited like-toggling.
   - `GET /api/download` (`app/api/download/route.ts`) — unlimited manifest builds, each of which makes one network call per film to the video provider.
   - `GET /api/og` (`app/api/og/route.tsx`) — mitigated somewhat by a year-long immutable cache, but the first request per `v=` is uncapped.
3. **The passcode POST doesn't check catalogue lifecycle state before verifying the code** (`app/api/passcode/route.ts:60-68` looks up the catalogue directly, not through `resolveAccess`) — a draft or lapsed catalogue's code can be "correctly" entered and a grant cookie issued, even though the guest is then still routed to the draft/renewal screen by `resolveAccess`'s own ordering on the next page load. Harmless today only because of that ordering; a second, independent check would be more honest.
4. **Player-side captions and speed never shipped, though both the spec and the data path promise them — a doc/code disagreement, not just an unfinished feature.** `docs/spec/08-component-spec.md:138` specifies the player's controls as "speed, captions, PiP, fullscreen. All keyboard-mapped (`space`, `←/→`, `f`, `m`, `c`)" — `c` for captions is a named keyboard shortcut — and `docs/spec/07-api-contracts.md:44,138` defines a `captions` array with example VTT URLs as part of the playback contract. The code carries the data all the way to the browser (`titles.captions` — `lib/schema.ts:424,444` — returned by the playback token, `app/api/playback/token/route.ts:62`, typed in `useHlsPlayback.ts:12`) but `<Player>` never renders a `<track>` element, never reads `ticket.captions`, has no speed control, and has no `c` key in its keyboard map (`components/streaming/Player.tsx:178-216`, full file). The translation keys `player.captions`, `player.quality`, `player.speed`, `player.auto` (and, separately, `footer.renew`) exist in both English and Hindi (`lib/i18n.ts:54-57,240-243`) but are rendered nowhere — dead UI copy for a control the spec calls required and the code never built.
5. **`app/[catalogue]` is an empty, untracked directory** (`ls -la` shows it has existed since 8 Aug with zero files inside, and `git ls-files` returns nothing for it) — a leftover from an earlier routing approach superseded by `app/c/[slug]`. It is inert (no `page.tsx`, Next ignores it) but worth deleting rather than leaving as a false trail for the next reader.
6. **Inconsistent "not found" experience depending on link shape.** A wrong *second* path segment (unknown wedding under a real studio, or a bad subdomain label) reaches `resolveAccess` and gets the themed, localised "not yet available" shell (`app/c/[slug]/page.tsx:141-153`). A wrong *first* segment, a single-segment path, or a valid two-segment link with an extra unmatched sub-path (e.g. `/studio/wedding/nonsense`) never reaches that component at all — `parseTenantPath` either doesn't match or rewrites into a route Next has no page for, and the request falls through to the generic, English-only, unthemed `app/not-found.tsx:1-15`. Two different "this isn't a real link" experiences exist side by side.
7. **QoE telemetry has no sink beyond structured logs.** `POST /api/qoe` computes an `overBudget` boolean against `PLAYBACK_START_MS`/`REBUFFER_RATIO` and logs it (`app/api/qoe/route.ts:54-85`) — but nothing in the guest, studio, or scripts scope reads those logs back into a p75 figure, a dashboard, or an alert. Doc 05 §6's own framing ("a target nobody measures is a wish") is half-solved: the measurement now exists, but it is not yet *read*.
8. **The `module-state` route's own comment is stale.** It says "Phase 0 ships no interactive module, but the endpoint exists so the first one is additive" (`app/api/module-state/route.ts:10-13`) — but `checklist` (Phase 1, `modules/checklist/index.ts:14`) has shipped and does use it (`modules/checklist/Guest.tsx:44-58,78-84`). Not a functional bug, just a comment nobody updated once the "first one" arrived.
9. **Only one interactive, per-profile module exists (`checklist`).** `timeline` and `randomiser` (also Phase 1) render from config alone and remember nothing between visits, despite `module_state` existing precisely for this. Not a defect — just unused capacity.
10. **Rate limits and lockouts are per-process memory** (`lib/http/rate-limit.ts:3-12`), same caveat as the studio subsystem: on more than one Vercel instance the passcode brute-force protection (5 device / 30 catalogue per 15 min) is approximate rather than exact, and production currently runs `CAPTCHA_DRIVER=none` (per `docs/NEXT.md`), so the captcha backstop for a distributed guess is off entirely — the per-catalogue bucket is the only defence actually active in production.
11. **Likes and progress can be attributed to nothing in particular.** A `guestKey`/`profileId` is just a client-held random string; there is no way for a studio or the platform to distinguish one enthusiastic guest liking a photo forty times from forty different guests each liking it once, beyond the one-per-key constraint on `likes` itself (which does hold) — worth knowing if "most-liked photo" numbers are ever shown to a couple as social proof.

## 8. Evidence index

- `middleware.ts:1-122` — host/path → route rewrite, all three tenancy shapes.
- `lib/tenant.ts:23-215` — `resolveTenant`, `parseTenantPath`, `isCustomHost`, `catalogueUrl`/`cataloguePath`/`adminUrl`/`rootUrl`, `RESERVED_PATH_ROOTS`.
- `lib/address.ts:1-99` — `addressOf`/`basePathOf`/`publicUrlOf`/`ogImageUrlOf`/`addressFor`/`requireCanonicalAddress`.
- `lib/catalogue-access.ts:1-89` — `resolveAccess`, `loadBundle`, `requireServableCatalogue`.
- `lib/catalogue-cache.ts:1-86` — `catalogueTag`, `CACHE_GENERATION`, `getCachedCatalogueBySlug`, `getCachedBundle`, `revalidateCatalogue`.
- `lib/downloads.ts:1-116` — `resolveDownloadAccess`, `buildManifest`.
- `app/c/[slug]/page.tsx:1-154` — browse page, metadata, verdict switch, `NotAvailable`.
- `app/c/[slug]/locked/page.tsx:1-49`; `renew/page.tsx:1-70`; `premiere/page.tsx:1-53`; `download/page.tsx:1-114`; `watch/[titleSlug]/page.tsx:1-83`.
- `app/d/[host]/[[...rest]]/page.tsx:1-91` — custom-domain host resolution and component reuse.
- `app/not-found.tsx:1-15` — the generic catch-all 404.
- `app/api/passcode/route.ts:1-81`; `app/api/profiles/route.ts:1-41`; `app/api/progress/route.ts:1-89`; `app/api/playback/token/route.ts:1-66`; `app/api/download/route.ts:1-43`; `app/api/og/route.tsx:1-104`; `app/api/likes/route.ts:1-60`; `app/api/module-state/route.ts:1-49`; `app/api/qoe/route.ts:1-90`; `app/api/poster/[titleId]/route.ts:1-72`.
- `lib/auth.ts:1-114` — signed tokens, passcode-grant cookie.
- `lib/time.ts:1-94` — timezone conversion, `formatInZone`.
- `lib/i18n.ts:1-424` — dictionary, `translate`, `createTranslator`, `resolveLocalised`, `parseLocale(OrNull)`.
- `lib/guest-locale.ts:1-25` — `guestLocale`.
- `lib/http/errors.ts:1-70`; `lib/http/handler.ts:1-53`; `lib/http/rate-limit.ts:1-71` — shared API plumbing.
- `lib/video/provider.ts:1-152`; `lib/video/bunny.ts:80-228` — `VideoProvider` interface, directory-signed tokens, download URLs.
- `lib/poster.ts` — generated art, `eyebrowFor`, `paletteFor`.
- `lib/photos/srcset.ts:1-29` — responsive photograph `srcset`.
- `lib/schema.ts:9-667` — every guest-relevant Zod schema (`Catalogue`, `Title`, `Photo`, `Album`, `Profile`, `PlaybackProgress`, `LikeSubject`, `ModuleInstance`, `ModuleState`, categories, occasions).
- `components/streaming/CatalogueShell.tsx:1-158`; `CatalogueProvider.tsx:1-198`; `ModuleRenderer.tsx:1-71`; `ProfileGate.tsx:1-132`; `PasscodeGate.tsx:1-122`; `PremiereScreen.tsx:1-102`; `WatchScreen.tsx:1-47`; `Player.tsx:1-397`; `useHlsPlayback.ts:1-200`; `useProgressHeartbeat.ts:1-98`; `useQoe.ts:1-147`; `TitleModal.tsx:1-222`; `PosterRow.tsx:1-181`; `PosterCard.tsx:1-197`; `Lightbox.tsx:1-154`; `usePhotoDeepLink.ts:1-66`; `useFocusTrap.ts:1-75`; `ShareButton.tsx:1-129`; `LikeButton.tsx:1-151`.
- `components/chrome/TopNav.tsx:1-140`; `SiteFooter.tsx:1-60`; `ThemeStyle.tsx:1-31`.
- `modules/registry.ts:1-118`; `modules/contract.ts:1-127`; per-module `index.ts`/`Guest.tsx` under `modules/{billboard,curated-row,photo-row,photo-grid,letter,continue-watching,timeline,checklist,randomiser}/`.
- `themes/resolve.ts:1-37` — `resolveTheme`, cached per-tenant theme lookup (supporting infra, out of literal scope but load-bearing for every guest page's rendering).
- `supabase/migrations/0001_initial_schema.sql`, `0002_row_level_security.sql:85-109`, `0008_likes.sql`, `0012_content_waits_for_publish.sql`, `0013_locale.sql`, `0015_usage_watch_seconds.sql`, `0016_tenant_path.sql`, `0018_couple_accounts.sql`, `0023_domains.sql`, `0024_premiere.sql`, `0025_occasions.sql`.
- `lib/env.ts` — every configuration variable cited in §6.
- `docs/spec/08-component-spec.md:138`; `docs/spec/07-api-contracts.md:44,138` — the spec's captions/speed promise, cited against the code in §7 item 4.
- Tests confirming behaviour: `e2e/guest.spec.ts`, `e2e/gates.spec.ts`, `e2e/premiere.spec.ts`, `e2e/playback.spec.ts`, `e2e/locale.spec.ts`, `e2e/path-mode.spec.ts`; `tests/unit/tenant.test.ts`, `downloads.test.ts`, `premiere.test.ts`, `progress.test.ts`, `poster.test.ts`, `i18n.test.ts`.
