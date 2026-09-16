# Mehfilbox — Master Project File

*Compiled 16 September 2026 from the nine subsystem maps in
`scratchpad/15-sep/map-*.md` (auth-security, client, commerce, guest, media-infra, notifications,
platform, studio, themes-customizer), `docs/PRODUCT.md`, `docs/NEXT.md` and
`docs/reference/00-decision-log.md`. The maps were read against `main` at `HEAD 96fb305`;
every claim below was then re-checked against **`HEAD 7730633`** ("Guests saw unpublished
photographs on the Supabase driver," 16 September 2026, 11:27), which landed between the two and
is the commit this document describes. Where that commit changed something a map recorded, the
change is marked in place — §9.6 is the one that matters.
Every capability below is marked **Built**, **Partial**, or **Planned**; file paths cite the code
the maps read. This document does not repeat the others in this folder — see
[`00-README.md`](./00-README.md) for how they fit together, [`02-codebase-assessment.md`](./02-codebase-assessment.md)
for the codebase's health, [`03-port-and-build-vs-buy.md`](./03-port-and-build-vs-buy.md) for
build-vs-buy, [`04-startup-india.md`](./04-startup-india.md) for the Startup India question,
[`05-market-and-differentiation.md`](./05-market-and-differentiation.md) for competitors, and
[`06-what-changes-next.md`](./06-what-changes-next.md) for what to do next.

## 1. What we are building

**Mehfilbox is a white-label, streaming-style delivery platform for wedding films and
photographs, sold to wedding studios and planners — not to couples.** A studio (a videography or
planning business) signs up, uploads a couple's films and photographs, arranges them on a
branded page with a drag-and-drop customizer, and publishes it. The couple's relatives open a
link on WhatsApp and watch on a Netflix-shaped page — poster rows, a billboard hero, a
title-detail modal — tuned for a phone on Indian 4G. Nothing about the streaming grammar is
disguised or watered down; only the name and the exact brand colour differ from the incumbents,
because the visual design itself is not what a lawyer can act on (D-1, `docs/reference/00-decision-log.md`).

This is a pivot, taken in August 2026, from an earlier wedding invite/RSVP idea: films are
already paid for and already exist, so upgrading their delivery is an easier sell than adding a
website nobody budgeted for, and it creates recurring revenue an invite site never could (D-8).
It is deliberately B2B: the studio is the customer and owns the relationship. A direct-to-couple,
freemium version was considered and dropped, because every feature it would sell (multi-event,
multilingual, a custom domain) is already free on India-focused site builders (D-2).

### The name

The product is **Mehfilbox**, decided 7 September 2026 — the third name, after Mehfil, then
Heirloom Films. **The domain and every piece of infrastructure still read `heirloomfilms.in`**:
the Vercel project, the Bunny zones, the sending address `hello@heirloomfilms.in`.
`mehfilbox.com` and `mehfilbox.in` are both registered and `.com` is canonical; `heirloomfilms.in`
keeps resolving and redirects, because it is already in guests' phones (D-23). Renaming the code
and infrastructure to match is a separate, not-yet-done job (`docs/NEXT.md` N-52) — deliberately:
a document that renames live infrastructure before the infrastructure is renamed describes a
system nobody can reach.

### The four actors

| Actor | Org `kind` in the database | Role |
|---|---|---|
| **Platform owner** (Sandeep; one seat today) | none — a separate `platform_admins` table | Runs Mehfilbox as a business: creates studios, grants credits, sets storage quotas, authors themes, watches system health. |
| **Studio** | `partner` | The customer. Onboards, uploads, customizes, publishes, delivers, hands over. |
| **Client / couple** | `couple` | The studio's customer. Receives ownership of their own wedding after handover; can also start a catalogue of their own. The account is moving, in its outward copy only, from "couple" to "client" (D-42) — "the couple" stays the word for the people in the wedding. |
| **Guest** | not an account at all | Two hundred relatives with a link. No sign-in, ever. |

Chapter 2 gives the full detail of what each can reach; Chapters 3–6 walk each one in full.

### The promise

*"Your wedding survives your studio."* Nothing is ever silently deleted — a lapsed plan moves to
a 90-day grace period and then archive, never automatic deletion (D-11). The couple always keeps
a copy: every film and photograph they were given can be downloaded as direct links at any time,
lapsed or not (`lib/downloads.ts:9-20`). Originals are stored and downloadable for the whole paid
term, not only a compressed preview (D-15) — the opposite of the "no compression" claim
international competitors lead with; the honest version is *originals always downloadable,
streaming tuned for 4G* (D-21). And if a studio itself disappears, the couple may pay Mehfilbox
directly to keep the wedding alive — the "escape hatch" (D-26).

### The money — what is sold, and what actually moves today

**Every rupee is billed to the studio, never to the couple, for the first twelve months after
delivery** (D-16, D-26). The published price ladder, decided in September 2026
(`docs/reference/00-decision-log.md` D-14, D-17, D-18, D-20):

| Item | Price | Term | Notes |
|---|---|---|---|
| Deliver | ₹1,999 (or 5 for ₹7,999) | 90 days, 100 GB | Replaces "Highlights," which could not hold a real wedding. |
| Keep | ₹6,000 (₹12,000 for 3 years) | 12 months, 100 GB | Offered as an upgrade from Deliver around day 60 — whether a studio actually offers it, and at what markup, is an open question (P-6). |
| Cinema | ₹12,000 (₹24,000 for 2 years) | 12 months, 200 GB, 4K | — |
| Renewal | ₹2,500 or ₹4,000 | — | Nothing self-service writes a renewal yet (Chapter 7). |
| Archive | ₹999–1,499/year | After 12 months free | Nothing in the code reduces a lapsed catalogue's storage yet (Chapters 7, 9). |
| Studio plan | ₹4,999/year | Includes 3 Deliver credits in year one | How a studio becomes a paying customer (D-18, D-30). |

**What is actually enforced in code today is much smaller than this list.** A catalogue's first
Publish costs one **credit** (`credits` table); credits are granted at registration (one, free)
or by a platform admin — there is no purchase flow at all
(`app/api/admin/catalogues/[id]/publish/route.ts:26-41`; Chapter 7). Storage is capped at a flat
**20 GB per organisation** by default (`lib/entitlements.ts:29-31`) — well below the 100–200 GB
the price list sells — unless a platform admin manually raises it. **Razorpay does not exist
anywhere in the code: zero lines, zero webhook, zero environment variable**
(`map-commerce.md` §7, confirmed against `lib/env.ts`). Every rupee that has moved so far moved
outside the product — bank transfer, cash, UPI — and is recorded only as a free-text reason on a
platform admin's audit row. Chapter 7 has the full picture; the gap between what is sold and what
is enforced is the single largest fact in this document.

---

## 2. Actors and roles

Everyone who touches Mehfilbox is one of four things, and the code keeps them structurally
separate rather than as one "user" table with a role flag.

### How identity works, once, for everyone who signs in

A **studio operator** and a **client/couple account** are the *same* database shape — an
`operators` row pointing at an `orgs` row — distinguished only by the org's `kind`
(`partner` or `couple`). One `/login` page shows a **Studio** and a **Couple** tab; the tab only
changes the wording shown, never which door a given address opens — where a signed-in person
actually lands is decided by their org's `kind`, read *after* authentication, never by which tab
they clicked (D-33; `app/api/admin/session/route.ts:38-41`). Forgot-password, credential links
and lockouts are identical on both doors (`lib/auth/credential-links.ts:44-109`).

A **platform admin** is deliberately *not* an extension of this — a separate `platform_admins`
table with no `org_id` column at all, and no code path anywhere that converts an operator into
one or back (`lib/admin/platform.ts:9-33`; `supabase/migrations/0004_partners.sql:35-44`). They
sign in through the same `/login` form; a second database lookup, added 12 September 2026
(N-76), is the only reason that sign-in reaches anywhere for them
(`app/api/admin/session/route.ts:82-109`).

A **guest** never has any of the above. Identity is two client-held tokens only: a signed
passcode-grant cookie proving *which catalogue's code they entered*, and a random id in
`localStorage` for "which profile tile did they pick" — neither is a login
(`lib/auth.ts:81-114`; `components/streaming/CatalogueProvider.tsx:57,90-91`).

### What each actor can reach

| Actor | Identified by | Reaches | Cannot reach |
|---|---|---|---|
| **Platform owner** | `platform_admins` row, `requirePlatformAdmin()` (`lib/admin/platform.ts:36-44`) | Every page under `/admin/platform/**`: create/suspend/quota/credit a studio, extend or take a catalogue offline, author themes, mark a domain attached, read health and the full audit trail. | Any studio or client console screen — an admin has no `org_id`, so there is nothing to scope into. Cannot impersonate a studio (deliberate, doc 15 §1). |
| **Studio** | `operators` row, org `kind='partner'`, `requireOperator()` (`lib/admin/session.ts:53-66`) | Everything under `/admin/**` except `/admin/platform/**`: create weddings, upload, customize, publish, deliver, hand over, manage house styles and its own domain. | `/admin/platform/**` (404, not 403 — probing confirms nothing); another studio's catalogues (404); a handed-over wedding, except inside a support window the couple opened. |
| **Client / couple** | Identical `operators` row, org `kind='couple'` | `/my` (their own light console) plus, for any catalogue they **own** (self-made or handed over), the *entire* studio console minus four panels (deliver, issue-a-sign-in, save-as-style, hand-over) — `app/admin/c/[id]/page.tsx:74-76,206-243`. | Another account's catalogues; issuing a *second* couple's sign-in (the one route in the whole admin API that checks `org.kind==='partner'`, `couple/route.ts:49-51`). |
| **Guest** | No account — a passcode-grant cookie and a `localStorage` profile id, or neither | Whatever `resolveAccess()` currently shows for one catalogue: browse, watch, download, like, share (`lib/catalogue-access.ts:30-64`). | Any other catalogue; anything requiring a sign-in; a draft or not-yet-published wedding (shown a neutral "not yet available," never a hint that one exists). |

### Suspension and the support window — the two states that cut across all of this

A **suspended** studio or client account (`orgs.status='suspended'`, set only by a platform
admin) keeps a valid session — sign-in still succeeds, so the console can explain *why* — but
`requireOperator()` refuses every read and write with `FORBIDDEN`
(`lib/admin/session.ts:62-64`). A suspended account may still change its own password
(`app/api/auth/change-password/route.ts:26-32`).

A **support window** is the one place a studio can touch a wedding it no longer owns: after
handover, the couple may open the originating studio's access back up for 7 or 14 days from
`/my`; inside that window the studio may fix films, photographs, sections and branding, and
publish — but not Settings, delivery or a second handover
(`lib/admin/session.ts:93-120`; `tests/unit/couple-accounts.test.ts:318-343`).

---

## 3. Platform owner — login and every capability

**Built.** One seat today — one email, one password, kept in a gitignored file, never printed to
a terminal (`map-platform.md` §1).

### 3.1 Provisioning — off the web app, on purpose

There is no "become the first admin" screen. `pnpm platform:admin <email> [name]` (`scripts/create-platform-admin.ts:23-130`)
creates the Supabase Auth account **and** the `platform_admins` row together, idempotently — an
existing account or row is left alone, so re-running is safe. The password is written only to
`.env.platform.local` (gitignored), never to the terminal.

### 3.2 Signing in

1. Open `/login`, either tab — the door only changes copy (`components/auth/LoginForm.tsx`).
2. `POST /api/admin/session` with the usual rate limiting (5/address, 10/IP per 15 minutes) and a
   captcha after 3 failures if a driver is configured (`app/api/admin/session/route.ts:33-58`).
3. The route first looks for an `operators` row (none — this identity has none by design), then
   — since N-76, 12 September 2026 — for a `platform_admins` row
   (`app/api/admin/session/route.ts:82-109`).
4. **Failure mode:** a wrong password or unknown email answers the identical generic "Those
   details did not work" every operator sees — a platform admin cannot be distinguished from a
   failed guess. **On the local/memory auth driver this door is structurally unreachable**
   (`lib/admin/auth-local.ts:23-38`), so it has never been exercised by CI or E2E, only in
   production (`map-platform.md` §7 item 1).

### 3.3 Dashboard

`GET /admin/platform` — five stat tiles (studios, couples, catalogues live/draft, credits
outstanding, a health summary) and the last 10 audit rows, all read fresh
(`app/admin/platform/page.tsx:18-95`). Read-only.

### 3.4 Studios — search, create, suspend, quota, credits, operators

| Capability | Route | What it writes | Failure modes |
|---|---|---|---|
| Search every studio | `/admin/platform/studios` | — | — |
| **Create a studio** (the phone-sale path) — name, contact, email, language, opening credits (0–50), a reason | `POST /api/admin/platform/orgs` | `orgs`, first `operators` row, a `credential_links` row (a set-password link is emailed), optional opening `credits` rows, one `platform_audit` row | Existing address → "That address already has an account"; on failure after the org is created, the org is deleted so nothing is stranded except a harmless orphaned auth user. |
| **Suspend / restore** — suspend requires a reason, restore does not (deliberate asymmetry) | `POST /api/admin/platform/orgs/:id/status` | `orgs.status`, `platform_audit` | A no-op if already in that state — the trail stays "a log of changes," not of clicks. |
| **Set or clear a storage quota** | `POST /api/admin/platform/orgs/:id/quota` | `entitlements` row upserted, or **deleted** (not zeroed) when clearing, so "default" always tracks the live default | Non-positive or absurd GB → 400. |
| **Grant credits** — additive only, a required reason | `POST /api/admin/platform/orgs/:id/credits` | `credits` rows, `platform_audit` | There is **no revoke or reduce** anywhere — a mistyped grant is permanent (`map-platform.md` §7 item 6). |
| **Add an operator / send a password link** | `POST /api/admin/platform/operators`, `.../password-link` | `operators`, `credential_links` | Address already used → error; org with zero operators shows a red "Nobody can sign in" state. |
| One studio's page | `/admin/platform/orgs/<id>` | — | Its catalogues (links only), operators, entitlement, credit balance, its own audit trail. |

### 3.5 Couples — read, plus the reused password-link write

`/admin/platform/couples` lists every client account with its operators and every catalogue
linked to or owned by it, tagged "theirs" vs. "being prepared." The only write on this page is
the same "send a password link" control Studios has. **There is no create-couple, suspend, or
credit-grant control here** even though a couple org can hold both — reaching those means
following the link to `/admin/platform/orgs/<id>` (`map-platform.md` §4 W9).

### 3.6 Catalogues — search, extend a term, take one offline

`/admin/platform/catalogues` lists every catalogue on the platform, sorted soonest-to-lapse
first. Two writes live on a catalogue's own page:

1. **Extend (or shorten) a term** — a date, a "+1 year" shortcut, a required reason. Writes
   `catalogues.included_until`, and, if the new date is in the future and the wedding was not
   already serving, `sub_status='active'` immediately rather than waiting for the next nightly
   ladder run (`app/api/admin/platform/catalogues/[id]/term/route.ts:38-44`). This is
   **deliberately not studio-editable** — a self-service renewal date would be a billing hole.
2. **Take offline / put back**, for abuse only, never for a billing dispute. Putting one back
   spends no credit and republishes the last-published content directly, without re-running the
   promotion logic a normal Publish runs (`app/api/admin/platform/catalogues/[id]/offline/route.ts:25-54`).

### 3.7 Themes — the only actor who can author one

`/admin/platform/themes`: start from any built-in, edit an existing custom one live against a
contrast gate, or withdraw/restore with one click. **Withdrawing repaints nothing** already on
that theme; **editing an existing theme's tokens repaints every wedding on it, live**, with only
a sentence of warning and no count of how many weddings that is
(`components/admin/ThemeStudio.tsx:253-258`; `map-themes-customizer.md` §7). Full detail in
Chapter 10.

### 3.8 Domains — the manual half of attachment

`/admin/platform/domains` lists every custom domain. With `DOMAIN_DRIVER=none` (what production
runs), "Mark `<host>` attached" is the *only* path from a DNS-verified domain to actually serving
— a studio's own "Check DNS" only gets a domain to `verified`
(`app/api/admin/platform/domains/[id]/attached/route.ts:23-25`). **No email is sent to the studio
either way when attachment completes** (`map-platform.md` §7 item 9). Full detail in Chapter 11.

### 3.9 Health — "would a guest notice," not "did it boot"

`/admin/platform/health`: ten services probed live with a 3-second budget and a 60-second cache —
database, Bunny Stream, Bunny Storage, the photo CDN, Resend, the notification queue, the
transcode pipeline, every scheduled job's last run, custom domains, and a synthetic guest walk
that actually tries to mint a playback token (`lib/health/probes.ts:69-254`). Purely read-only.
Full detail in Chapter 13.

### 3.10 Audit — where every other page's writes are read back

`/admin/platform/audit`: every platform write, newest first, up to 200 rows, free-text reason
pulled out. No search, filter, export, or pagination past 200 rows
(`app/admin/platform/audit/page.tsx`).

### 3.10a A platform write, in one shape, always

Every write above funnels through one guard (`requirePlatformAdmin`) and one recorder
(`recordPlatformAction`), which writes the `platform_audit` row **after** the write succeeds,
never before and never on a failure, denormalising the actor's email and the org's slug so the
row still reads once either is deleted (`lib/admin/platform.ts:46-74`). A non-admin probing any
of these routes gets `NOT_FOUND`, never `FORBIDDEN` — the surface is invisible before it is
refused.

### 3.11 What the platform owner still cannot do

No revenue, cost, or platform-wide storage figure anywhere on the dashboard — only counts and a
credit total (`map-platform.md` §7 item 3; ties to N-82, Chapter 7). No impersonation of a studio
for support, deliberately (doc 15 §1). No way to originate a bare **couple** account directly —
`createStudio` always writes `kind='partner'`, and in the whole codebase exactly two places write
a `kind='couple'` org: a studio issuing the couple's sign-in
(`app/api/admin/catalogues/[id]/couple/route.ts:84`) and a couple claiming a forwarded handover
link (`app/api/claim/route.ts:113`). **There is no self-registration of any kind** — see §5.1;
`map-platform.md` §7 item 12 says "or a couple registering themselves at `/my`," which is wrong,
and this document does not repeat it. Every control here (suspend, quota, credits, add-operator)
works on either kind once the org exists; none of them can make a couple org exist.
`plans`/`plan_id` is completely unused — storage quota (§3.4) is
the only entitlement lever this console actually has (`app/api/admin/platform/orgs/[id]/quota/route.ts:19-24`).

---

## 4. Studio — onboarding, every capability, and the wedding lifecycle

**Built**, essentially in full. This is the console a studio spends "thirty minutes per wedding"
in (`CLAUDE.md`): create → upload → title → customize → publish → send to the couple → hand over.

### 4.1 Registration

1. `/admin/register` — public, `noindex`, linked from the login form. Business name, contact
   name, email, password (≥12 characters), a language radio (English/Hindi)
   (`components/admin/RegisterForm.tsx:16-153`).
2. A captcha if a driver is configured; 3 registrations per IP per hour
   (`app/api/partners/route.ts:37-38,56-59`).
3. `POST /api/partners` creates the Supabase Auth credential, then `orgs` (`kind='partner'`),
   then the first `operators` row, then grants **one free credit**, 24-month expiry
   (`lib/admin/credits.ts:43-52`).
4. **Failure modes:** an existing address, or *any* other Supabase sign-up error, both read as
   "That did not work. Try a different email address" — which is how a bad Resend key on
   Supabase's side once read as the studio's own fault, live, on 11 September 2026
   (`docs/NEXT.md:496-507`). If the operator insert fails after the org is created, the org is
   deleted; the orphaned auth user is harmless.
5. No approval step exists — self-registration is public by design (D-39: "suspend after," not
   "approve before"); whether to gate it is one of the decisions at the end of this document.

### 4.2 Sign in, forgot password, change password

Shared with the client door (Chapter 2) — `/admin/login` redirects to `/login?door=studio`.
5 failed attempts per address or 10 per IP locks for 15 minutes; a captcha challenge appears
after 3 failures if a driver is configured (`app/api/admin/session/route.ts:33-58`). Forgot
password answers one identical sentence regardless of whether the address exists, and issues a
single-use, hashed, 1-hour credential link (`app/api/auth/forgot/route.ts:25-55`).

### 4.3 The console

`/admin` — a searchable, filterable, sortable board of every catalogue with an "attention" chip
(`lib/admin/catalogue-health.ts:36-103`), the credit balance ("N credits to publish with"), and a
**Delivered** list of every catalogue this studio originated but no longer owns, each showing its
term end and whether a support window is currently open (`components/admin/DeliveredList.tsx`).

### 4.4 Creating a wedding — the five-step wizard

1. **The couple** — name, wedding date, city, one of seven occasions; the address slug is
   suggested from the names and year with a live availability check; the app name is refused if
   it contains `-flix` (`components/admin/CreateWizard.tsx:287-445`; `lib/schema.ts:112-125`).
2. **The look** — a saved house style (default preselected), or "choose myself": a theme (7
   built-in + platform-authored) and one of four layouts (`keepsake`, `films-only`,
   `anniversary`, `blank`) (`CreateWizard.tsx:447-595`).
3. **Guests and the couple** — privacy (unlisted, or a guest code typed or auto-generated),
   language, time zone, an optional premiere date and time, and how the couple's own first
   sign-in reaches them (a link, or a temporary password read aloud) (`CreateWizard.tsx:597-740`).
4. **Upload** — the catalogue is created at the end of step 3 (`POST /api/admin/catalogues`,
   `app/api/admin/catalogues/route.ts:75-159`), then films start uploading.
5. **Titles** — name, category and visibility for whatever has arrived so far.

**Failure modes:** an address that collides mid-race with another studio's surfaces as a bare
500 — the wizard checks availability but the create route does not re-check it
(`map-studio.md` §7 item 8). Only step-1 fields survive a page refresh before creation; occasion,
theme/layout and every step-3 answer are lost (`map-studio.md` §7 item 7).

### 4.5 Uploading and titling films

Resumable multi-gigabyte upload straight from the browser to Bunny (TUS protocol, bytes never
touch the Next.js server), a 20 GB per-file cap, storage checked against the real plan before a
byte moves. A dropped connection marks the item `interrupted` and resumes automatically on the
browser's `online` event — proven against a real network drop by `pnpm verify:upload`
(`components/admin/UploadManager.tsx`; full detail in Chapter 9). Films can be renamed,
recategorised, reordered, retried and removed inline, with one shared "Saving… / Saved / Not
saved" indicator across the whole console (`components/admin/TitleList.tsx`, `SaveState.tsx`).

### 4.6 Photographs

Client-side resize into three renditions (2048/1024/480px) plus an inline low-quality preview,
one multipart upload, one default album per catalogue, a caption field on blur
(`components/admin/PhotoManager.tsx`). **The size-limit error message is wrong** — it says "larger
than 25MB" when the real cap is 4MB (`app/api/admin/catalogues/[id]/photos/route.ts:32,98`).

### 4.7 Customizing

Drag-and-drop section list, live preview of the *real* guest components, in-place heading
editing, a branding panel — autosaved as a **draft** until Publish. Full detail in Chapter 10.

### 4.8 Publishing — the credit gate

1. Click Publish — the draft sections and branding are flushed and checked first, so Publish can
   never ship a stale draft (`components/admin/CustomizerShell.tsx:246-269`).
2. `POST /api/admin/catalogues/:id/publish` — on a wedding's **first** publish only, it consumes
   the soonest-to-expire credit of the studio's own org
   (`app/api/admin/catalogues/[id]/publish/route.ts:26-41`).
3. **No credit left** → a 402 refusal and a panel naming the price, with "Ask for a credit" (which
   emails the platform once per studio per day) — full detail in Chapter 7.
4. On success: the draft is promoted to live, any ticked films/photographs go live, the guest
   cache is invalidated. A republish (the wedding was already published once) spends nothing more.
5. "Take offline" in Settings reverts to `draft` without losing `published_at`, so a republish
   later is free (`components/admin/CatalogueSettings.tsx:61-66`).

### 4.9 Delivering the wedding to the couple

From the overview, published weddings only: "Email it" queues a `delivery` email (through the
notification queue, drained within 15 minutes — Chapter 8) carrying the public link, the
couple's names and the studio's name. "Open in WhatsApp" is a `wa.me` link pre-filled with the
identical text — **a compose link, not a send; nothing is recorded**
(`components/admin/SendToCouple.tsx:85-97`). N-36 (delivered) is built; N-36c (a real WhatsApp
Business send via MSG91) is planned — Chapter 8.

### 4.10 Issuing the couple's own sign-in

From the wizard's step 3 or the overview, a studio creates (or links, if the address already has
an account) the couple's own account — never holding their chosen password. Either a set-password
link is emailed, or a temporary password is shown once for the studio to read aloud
(`app/api/admin/catalogues/[id]/couple/route.ts:40-135`). **This is the one route in the whole
admin API restricted to `kind='partner'`** — a couple account cannot issue another couple's
sign-in.

### 4.11 Handover, the support window, and Delivered

1. **Direct** (the couple's account is already linked): "Hand over now" moves ownership
   instantly and emails every operator of the couple org
   (`app/api/admin/catalogues/[id]/transfer/route.ts:101-154`).
2. **By link** (no linked account yet): a single-use, 14-day claim URL is generated and shown
   **once**, for the studio to forward by hand — **no email is sent automatically on this path**,
   by design (`transfer/route.ts:20-32`).
3. After handover, the studio's session no longer owns the row; it appears in **Delivered**
   instead, showing the term and whether a support window is currently open. The couple can open
   that window (7 or 14 days) from `/my`, letting the originating studio back in to fix something
   without giving it Settings or a second handover (Chapter 2, "support window").

### 4.12 Settings

Language, privacy (unlisted / guest code — a new code bumps `passcodeVersion` and signs out
everyone holding the old one), time zone, premiere date, a read-only "Serving until," unpublish,
and delete-with-slug-confirmation. **The wedding's own facts — couple name, city, wedding date,
the address itself — cannot be edited from any console screen once created**, even though the
API route accepts them; the wizard's own warning that "changing it later breaks links" describes
an edit path that does not exist (`map-studio.md` §7 item 3).

### 4.13 House styles and the studio's own look

Chapter 10 has the full mechanism. In one line: a studio saves named presets (theme, layout,
branding, language, guest-code-on) so every wedding does not need re-choosing, and sets one
studio-wide default that only new weddings inherit.

### 4.14 The studio's own custom domain

Chapter 11 has the full mechanism — `films.studio.in/<wedding>` served for every wedding once
DNS is verified and (in production, manually) attached.

### 4.15 Credits

Chapter 7 has the full mechanism. In one line: a balance shown on `/admin` and `/admin/studio`,
spent only by a first Publish, topped up only by registration or a platform grant.

### 4.16 What a studio still cannot do — its own account, its own team, its own language

**A studio cannot edit its own account at all.** `PATCH /api/admin/studio` accepts exactly one
field: `branding` (`app/api/admin/studio/route.ts:11`, `bodySchema = z.object({ branding:
brandingSchema })`). Business name, org slug — which is the `<studio>` segment of every wedding's
address — contact name, email and the language chosen at registration are all **permanently
uneditable from the console**. There is no profile screen; `UserMenu` offers sign-out only. There
is not even a change-password link, although `app/login/change-password/page.tsx:11-13` states
that everyone "reaches it from the account menu" — the page exists and works, but nothing under
`components/admin` links to it (the couple's `/my/account` does, at `app/my/account/page.tsx:26`).
So a studio operator who wants to change their password has to know the URL
(`map-studio.md` §7 item 2). Wedding facts are the same story one level down: `PATCH
/api/admin/catalogues/:id` accepts `coupleName, city, synopsis, weddingDate, slug`, and no console
surface sends any of them — a typo in the couple's name is permanent (`map-studio.md` §7 item 3).

**There is no team management for a studio at all.** No invite, no list of operators, no role
change, no removal — anywhere in the studio-facing product. A second seat is added only by a
platform admin, by email, from the platform console (`app/api/admin/platform/operators/route.ts:11-16`).
`operators.role` (`admin`/`uploader`) is stored and shown to the platform, but **enforced
nowhere** — an "uploader" has identical reach to an "admin" (`map-studio.md` §7 item 1).

**The console is English-only, by decision.** D-32 (8 September 2026,
`docs/reference/00-decision-log.md:539`) settled that the operator console stays English and the
guest page does not. The Hindi/English radio a studio picks at registration (§4.1) therefore sets
the **guest and email** locale, not the console's — a Hindi-first studio operates the console in
English regardless of what it chose. This is a decision, not a gap; it is recorded here because
§4.1's radio reads like a console-language choice and is not one.

### 4.17 The wedding lifecycle, start to finish

| Stage | What moves it | What a guest sees |
|---|---|---|
| **Draft** | Created (§4.4); every upload/customizer edit | "Not yet available" — never a 404 (`lib/catalogue-access.ts:50`). |
| **Published, `included`** | First Publish (§4.8) — `included_until` set to +12 months at creation | The live wedding. |
| **`active`** | A platform admin's manual renewal (Chapter 3.6), or nothing yet self-service | The live wedding. |
| **`grace`** | Automatic, the day after `included_until` passes (`lib/lifecycle.ts:39-65`, run nightly) | Still plays; the couple is shown a renewal prompt and offered the download link — never told it is "gone" (`lib/catalogue-access.ts:36-48`). |
| **`cold` (archived)** | Automatic, 90 days into grace (`GRACE_DAYS=90`) | Streaming stops; `/renew` — film list, a `mailto:` link, the download link. **Nothing is purged from storage** — archive is a state, not a storage reduction (Chapter 7, Chapter 9). |
| **`deleted`** | **Never automatically.** Reachable only by an explicit, recorded request — and in the entire codebase, nothing actually writes it, including the one route closest to that request (`POST /api/my/close`) (`map-commerce.md` §7 item 7; `map-notifications.md` §7 item 11). | — |

The ladder, the warnings sent along the way, and what is billed at each stage are the whole of
Chapter 7; the messages themselves are Chapter 8.

---

## 5. Client — every way an account is created, and everything it can do

**Built.** The client (couple) subsystem exists so a wedding — or an anniversary, a naming day —
has a home that outlives the studio that made it. Structurally it is *almost* nothing new: the
same `operators`/`orgs` tables, the same session code, distinguished only by `orgs.kind='couple'`
(`map-client.md` §1).

### 5.1 How an account is created — there is no self-registration

**A client never signs up.** `/admin/register` is partner-only; there is no equivalent public
form for a couple (confirmed by `map-client.md` §7 item 1 — no `*regist*` page exists outside the
studio one). An account is always created *for* them, one of two ways:

1. **Issued by a studio** — from the wizard's step 3 or the overview (§4.10): a link to set a
   password, or a temporary password read aloud. This is now the common case (D-37: the couple's
   email is collected up front in the wizard).
2. **Claimed from a forwarded link** — the older path, now used only when a studio skipped
   issuing a sign-in up front, or the account predates that step. The studio generates a
   single-use, 14-day claim URL (§4.11) and forwards it by hand, typically over WhatsApp with no
   verifiable sender; `/claim/<token>` shows *what* is being handed over and *by whom* before any
   form field, then the person sets a password (or, if their address already has an account,
   simply signs in) (`app/claim/[token]/page.tsx:17-52`; `app/api/claim/route.ts:42-145`).

An address that already holds a client account is always **linked**, never duplicated — one
account per household, however many studios or weddings (`couple/route.ts:53-64`,
`claim/route.ts:73-90`). A studio's own address is refused as a client's, on both paths.

**The consequence, worth stating plainly:** a person with no wedding and no studio relationship
has *no way into the product at all* — including for the two occasions (baby shower, naming day)
the "start your own catalogue" feature (§5.6) was explicitly built for
(`map-client.md` §7 item 1).

### 5.2 Signing in

The shared door, Chapter 2 — `/login?door=couple`, identical security mechanics to the studio
door. The couple-tab copy differs ("Your studio created this sign-in…") and, unlike the studio
tab, carries no "create an account" link (`components/auth/LoginForm.tsx:72-81`).

### 5.3 `/my` — the client's home

One page, no search or filter (deliberately simpler than the studio's board): every catalogue the
account **owns** or is merely **linked to** (a wedding a studio is still preparing), across as
many studios as apply — each card says who made it and its state
(`app/my/page.tsx:29-129`). "Start a catalogue of your own" is here too (§5.6).

### 5.4 Managing one catalogue — `/my/c/<id>`

A small, plain-language panel, deliberately narrower than the full console:

| Control | Linked (studio still owns it) | Owned (self-made, or handed over) |
|---|---|---|
| Public link, share, download | Yes | Yes |
| Guest code (set/change/remove) | Yes | Yes |
| Rewrite the letter | No | Yes |
| Show/hide a section | No | Yes |
| Open the studio's support window | No | Yes, and only if a *different* org originated it |
| "Open the full editor" | No | Yes — drops into the exact studio console (§5.5) |

(`components/my/panels.tsx`; `app/my/c/[id]/page.tsx`.)

### 5.5 The full console, for anything owned

For any catalogue a client **owns** — self-made or handed over — "Open the full editor" opens the
*identical* `/admin/c/<id>/*` routes a studio uses: overview, upload, photographs, customizer,
Settings (including a custom domain and delete). **Only four panels are hidden**: Send to couple,
issue a sign-in, save as a house style, hand over — everything else, including Publish and its
credit gate, is symmetric by *ownership*, never by org kind
(`app/admin/c/[id]/page.tsx:74-76,206-243`; confirmed by grep — no other partner-only guard exists
under `app/api/admin`). This is arguably the single largest fact about this subsystem and is not
written down anywhere outside the code and its tests
(`tests/unit/couple-accounts.test.ts:318-343`; `map-client.md` §7 item 12).

### 5.6 Starting a catalogue of your own (N-73, 12 September 2026)

The identical five-step wizard, reshaped: occasion asked first (two more added just for this —
baby shower, naming day), no house-style step, no "issue a sign-in" step (the account already
exists). The new catalogue's `org_id` **and** `origin_org_id` are both the client's own org, so it
is `owned` immediately (`app/api/admin/catalogues/route.ts:100-148`). **A self-made catalogue
starts with zero credits** — there is no registration grant for a `couple` org — so the very
first Publish always needs a credit added by someone else first
(`tests/unit/couple-catalogues.test.ts:76-93`). The "Ask for a credit" button on this path emails
the *platform's* support inbox, the same as a studio's — despite the panel's own copy implying
the studio can help too (`map-client.md` §7 item 3; Chapter 7).

### 5.7 Closing the account

`/my/account` → typing the word `close` to confirm → `POST /api/my/close` **suspends** the org
(never deletes it), signs the browser out, and alerts the platform's ops inbox. **Catalogues are
untouched** — they keep serving or archiving on their own schedule regardless
(`app/api/my/close/route.ts`). **Gap:** the read side of `/my` never checks `orgStatus` — the
same person can sign back in immediately and browse everything read-only forever, which
contradicts the panel's own promise ("you stop being able to sign in")
(`map-client.md` §7 item 2).

---

## 6. Guest — addressing, access, watching, downloads, sharing

**Built.** This is the product's actual audience: no account, ever, opening a link on a phone.
One route tree (`app/c/[slug]/**`) serves every wedding; nothing about it knows or cares which
studio made it (`map-guest.md` §1).

### 6.1 Addressing

| Mode | Shape | Status |
|---|---|---|
| **Path** (production default) | `mehfilbox.com/<studio>/<wedding>` | **Built.** Decided 12 September 2026 (D-32) over a per-wedding subdomain, because it needs one certificate, no wildcard DNS, and no nameserver delegation for a domain that also carries mail. |
| `/c/<wedding>` | Legacy/internal alias | **Built.** A **307** (temporary) redirect to the canonical path, so links already sent keep working — `lib/address.ts:96` calls `redirect()`, not `permanentRedirect()`, and `docs/DEPLOYMENT.md:151` says so in as many words ("A legacy `/c/` link redirects temporarily, not permanently"). It was corrected from 301 on 12 September, commit `60eae78`; any document still calling this a 301 predates that. |
| **Subdomain** | `<wedding>.mehfilbox.com` | **Retired as a product mode**, kept only for the Playwright test harness (`lib/tenant.ts:23-111`). |
| **Custom domain** | A studio's or couple's own | **Built** once verified and attached — Chapter 11. |

A request that lands on a stale form of its own address (an old `/c/` link, a wrong studio
segment, or the mehfilbox path once a custom domain is live) is silently redirected to the one
address the product actually prints, deep-link suffix and query string preserved
(`lib/address.ts:85-98`).

### 6.2 The access verdict — one function, six outcomes

Every guest page and API re-derives the same answer from `resolveAccess(slug)`
(`lib/catalogue-access.ts:30-64`), checked in this exact order:

1. Unknown slug → **missing**.
2. Subscription not `included`/`active`/`grace` — **checked before publish state** — → **lapsed**.
3. `included_until` already past (compared independently, as a date, so a wedding serves the
   whole of its last day in every guest's timezone) → **lapsed**, overriding a stale status.
4. Not published → **draft**.
5. A premiere date still in the future → **premiere**.
6. Passcode privacy with no valid grant → **locked**.
7. Otherwise → **ok**.

| Verdict | What the guest sees | HTTP shape |
|---|---|---|
| missing / draft | A themed "not yet available" page | **200**, never a 404 — a draft wedding never confirms it exists to a prober either. |
| locked | `/locked` — a passcode form | Redirect |
| lapsed | `/renew` — never reads as "gone" | Redirect |
| premiere | `/premiere` — a live countdown | Redirect |
| ok | The wedding | 200 |

### 6.3 Unlocking with a passcode

Enter the code → `POST /api/passcode`, rate-limited both per device (5/15 min) and per catalogue
across every device (30/15 min — so a guess spread across many phones still hits a wall), a
captcha after 3 device failures if configured (`app/api/passcode/route.ts:27-58`). A wrong code
and an unknown catalogue both answer the identical "That passcode did not work." On success, a
signed grant cookie is issued (30-day TTL, carrying the catalogue id and the *current*
`passcodeVersion` — changing the code later invalidates every existing grant at once, with
nothing to enumerate or revoke individually) (`lib/auth.ts:81-99`).

### 6.4 Waiting for the premiere

A scheduled reveal: anyone with the link sees a live countdown (computed from a server-sent
instant, correcting across a DST boundary), because the code gates the *films*, not the page's
existence (`components/streaming/PremiereScreen.tsx`). At zero, a "Watch now" link appears with
no reload needed.

### 6.5 A lapsed wedding

`/renew` — every published film listed by name (so the family sees exactly what is still
theirs), a `mailto:` link, and — the most load-bearing link on the page — "download everything."
**No price, no "pay now" button, nothing self-service exists on this screen** (Chapter 7).

### 6.6 Browsing — the profile gate and the modules

1. First visit: a full-screen gate offers four fixed labels — **Bride's side · Groom's side ·
   Friends · Family** — never a personal name, and can be skipped
   (`components/streaming/ProfileGate.tsx`). It is *not* a sign-in; it exists so "Continue
   Watching" can resume per-device, and it is the key likes are (loosely) attributed to.
2. The page renders as an ordered list of sections from the module registry — billboard (hero),
   curated rows, photo rows/grids, a letter, continue-watching, timeline, checklist, a randomiser
   — with no `switch` on module type anywhere outside `modules/` (Chapter 10 has the full
   registry). An empty section renders nothing, never a heading over a blank strip.

### 6.7 Watching a film

1. Tap a poster → a title modal opens (URL gains `?title=`), which immediately prefetches a
   playback token and warms the manifest — the first segment is often already cached before Play
   is pressed (`components/streaming/TitleModal.tsx:44-63`).
2. Play → `/watch/<wedding>/<film>`; `POST /api/playback/token` mints a signed, directory-scoped
   Bunny URL bound to *this catalogue and this film* (a leaked token cannot unlock another film),
   default 4-hour TTL (`app/api/playback/token/route.ts`; full mechanism in Chapter 9).
3. hls.js everywhere except iPhone Safari, which uses native HLS. A mid-stream 401/403 triggers a
   silent token refresh that reattaches at the same position rather than restarting.
4. Resume: a `?t=` deep link (from a shared "watch from 7:08" link) overrides the server's own
   resume position. Progress is heartbeated every 10 seconds and on pause/unload; a view counts
   once a guest crosses 30 watched seconds.
5. **Not built, despite the spec and the data path promising them:** captions and a speed
   control. `titles.captions` reaches the browser in the playback response and the translation
   keys exist in both languages, but the player never renders a `<track>`, never reads them, and
   has no `c` key in its keyboard map (`map-guest.md` §7 item 4) — dead UI copy for a promised
   control.

### 6.8 Photographs and the lightbox

Responsive `srcset` (2048/1024/480px) from one stored master; two module shapes (a scrolling row,
a masonry grid); a full-screen lightbox with swipe, arrow keys and focus-trapping. Each
photograph has its own shareable address (`?photo=<id>` on the current page), so a forwarded link
reopens the lightbox directly at that image (`components/streaming/Lightbox.tsx`,
`usePhotoDeepLink.ts`).

### 6.9 Liking a film or photograph

A heart with a count, **counted across every guest and shown to all of them** — a deliberate
choice over a private keepsake. Keyed on a device-minted random id (not the profile, since the
gate can be skipped), so "most-liked photo" is really "most taps," not "most distinct admirers"
(`components/streaming/LikeButton.tsx`; `map-guest.md` §7 item 11). Optimistic UI, rolled back
only on a genuine failure. **No rate limit exists on this endpoint.**

### 6.10 Sharing

One component, three places: the whole wedding (top bar, carries the studio's referral link on
the platform-credit line), one film (from the title modal), one photograph (from the lightbox).
`navigator.share` first — on a phone this is the real OS share sheet, WhatsApp included — falling
back to a pre-filled `wa.me` link plus copy-to-clipboard (`components/streaming/ShareButton.tsx`).

### 6.11 Language

A toggle in the top bar between English and Hindi; the default before a guest touches it is the
*studio's own choice for this wedding*, not a hardcoded English (`lib/guest-locale.ts:22-25`).
Every string — the product's own chrome and operator-authored content alike — silently falls back
to English rather than ever showing a raw key or blank text, and this is enforced by
`tests/unit/i18n.test.ts` (CLAUDE.md's own working rule).

### 6.12 Downloading everything

`/c/<slug>/download` (or the footer link on any page) — **server-rendered with no client
JavaScript at all**, deliberately, because a guest reaching this page is often already dealing
with something having gone wrong. A manifest of direct, signed links per film (original if still
held, else the best rendition, labelled which) and plain CDN links per photograph — **never a
server-built zip**. Available at any time: before expiry, in grace, and from archive, because the
product's core promise depends on it (`lib/downloads.ts:9-20,71-115`). One film's link failing to
sign is disclosed in plain text, never hidden. **No rate limit exists on this endpoint**, and each
request can trigger one provider network call per film.

### 6.13 The WhatsApp link preview

Every page's Open Graph image is generated on the fly (`GET /api/og`), re-checks the access
verdict itself so a draft wedding never gets a preview card, and is cached immutably for a year
with the publish timestamp as the cache-buster (`app/api/og/route.tsx`).

### 6.14 What a guest cannot do, and two real gaps

A guest cannot see a draft, cannot bypass a passcode, cannot reach another wedding's data. Two
access-check inconsistencies are worth flagging precisely because CLAUDE.md names
`lib/catalogue-access.ts` as "the only place a guest request is authorised — change it once, not
per route": `GET /api/module-state` (a checklist's ticks) and `GET /api/progress` (resume
positions) **never call it at all** — low practical risk, since the ids involved are unguessable
server-minted UUIDs, but a genuine inconsistency in a codebase that states this as its own
invariant (`map-guest.md` §7 item 1).

---

## 7. Payments and purchases

**Mostly planned, not built.** Commerce decides how much a catalogue may hold, whether it may go
live, and what happens when its paid term runs out — while not yet being able to take anyone's
money for any of it (`map-commerce.md` §1).

### 7.1 The three primitives that exist in code

| Primitive | What it is | Resolution / behaviour |
|---|---|---|
| **Entitlement** | A per-org (or, in theory, per-catalogue) override of the storage default | `resolveLimits`: catalogue entitlement → org entitlement → a flat **20 GB** default (`lib/entitlements.ts:29-31,70-88`). |
| **Credit** | A token good for exactly one catalogue's *first* publish | Granted at registration (1, free) or by a platform admin; expires 24 months after purchase (`credits` table; D-27). |
| **`subStatus`** | The catalogue's own place on the lapse ladder | `included → active → grace → cold`, moved only by the nightly `lifecycle` cron; never automatically `deleted` (`lib/lifecycle.ts`; Chapter 4.17). |

### 7.2 Storage — what is sold vs. what is enforced

**Built**, and enforced at both upload paths (a film, a photograph — every rendition counted)
against real stored bytes, before a byte moves (`app/api/admin/uploads/route.ts:51-79`;
`app/api/admin/catalogues/[id]/photos/route.ts:139-156`). The console shows usage against the
plan with an hours-of-film hint and an 80%-used warning quoting ₹25/GB/month
(`app/admin/c/[id]/page.tsx:39-65,126-163`).

**Two caveats on "real stored bytes."** First, it is only true for rows written since migration
`0007`: existing `titles` rows still need `pnpm backfill:sizes --write` before the enforcement
above is measuring anything for pre-`0007` uploads (`docs/NEXT.md:453`). Second, storage is
reclaimed asymmetrically on delete — deleting a **single** photograph removes only the master
rendition (`app/api/admin/photos/[id]/route.ts:63` passes one key), leaving the `-1024` and `-480`
files in the zone forever, while a **catalogue** delete loops every `PHOTO_WIDTHS` entry and gets
it right (`app/api/admin/catalogues/[id]/route.ts:168-174`). The two code paths disagree
(`map-media-infra.md` §7 item 5). Both matter to any argument made from stored bytes — including
the cost cases in [03 §B](./03-port-and-build-vs-buy.md).

**The mismatch:** the price list sells 100–200 GB per plan; the code's actual default, absent a
platform admin manually raising it, is a flat **20 GB**
(`docs/PRICING.md:27-31` vs. `lib/entitlements.ts:29-31`). A studio sold "Deliver, 100 GB" is
capped at 20 GB until someone remembers to open the platform's quota control (Chapter 3.4).
**A catalogue-level override is fully implemented and tested but nothing anywhere ever writes
one** — only the org-level override exists in practice (`map-commerce.md` §7 item 4).

### 7.3 Credits — the publish gate

**Built.** A catalogue's first Publish spends the soonest-to-expire credit belonging to its own
org; a republish, or a wedding published before credits existed, spends nothing
(`app/api/admin/catalogues/[id]/publish/route.ts:26-41`). On Supabase, the spend is a
pick-then-guarded-claim (up to three attempts) so two publishes racing for the last credit cannot
both win it (`lib/db/supabase-repository.ts:788-813`). Refused → a 402 and a panel naming the
price (₹1,999, or five for ₹7,999), with **"Ask for a credit"** — emails the platform's support
inbox once per studio per day; a platform admin then grants from the console (Chapter 3.4). There
is still **no revoke or reduce** for a mistyped grant.

### 7.4 The `plans` table — real, empty, unread

`plans` exists as a table with zero rows. `entitlements.plan_id`, `max_titles` and `max_photos`
are written nowhere and read nowhere; the platform's own quota-route comment says so explicitly
(`app/api/admin/platform/orgs/[id]/quota/route.ts:19-24`). Neither pricing ladder discussed
anywhere in the docs — the current duration-priced Deliver/Keep/Cinema ladder, nor the proposed
storage-tiered Light/Medium/Heavy/Custom ladder (D-44) — is represented in the database. The only
real, enforced number in the whole commerce subsystem is the flat 20 GB default.

### 7.5 The lapse ladder and renewal — what moves, what does not

The ladder itself (Chapter 4.17) runs automatically and correctly: a nightly cron moves
`included`/`active` → `grace` the day after the term ends, and `grace` → `cold` 90 days later,
emailing on the move into `cold` (Chapter 8 has the messages). **Renewal is entirely manual**:
the *only* thing that ever writes `included_until` forward is a platform admin typing a new date
into the platform console, with a free-text reason as the sole evidence money changed hands
(Chapter 3.6; `app/api/admin/platform/catalogues/[id]/term/route.ts`). No self-service renewal, no
proration, no downgrade check.

**"Archive" reduces nothing.** Going `cold` stops streaming and sends one email; it does **not**
trim a catalogue to its best rendition, purge original files, or reduce stored bytes in any way.
The entire archive-tier pricing (₹999–1,499/year, "≈30 GB") assumes a storage-reduction step that
does not exist — a cold catalogue's storage bill keeps compounding exactly as if it were still
active (`map-commerce.md` §7 item 7; ties to Chapter 9's media-pipeline findings).

### 7.6 Who is billed, and when

Decided September 2026 (D-16, D-26, D-29):

- **For the first twelve months after delivery, every purchase is the studio's** — including the
  day-60 Deliver→Keep upgrade — at a base price the studio marks up. A couple must never receive
  an invoice from a company they have not heard of inside that first year.
- **Handover moves control, not billing.** The couple gains the passcode, family links, downloads
  and their own login; billing stays with the originating studio for the wedding's life.
- **The escape hatch (D-26):** when a studio is *gone* — account closed, its own Studio plan
  unpaid past grace, or unresponsive 90 days after a catalogue lapsed — the couple may pay
  Mehfilbox directly, at list price, to renew or archive. **This predicate is computed, never
  stored, and nothing in the code currently acts on it** — deliberately deferred until the
  checkout that would gate it exists (N-24b).

### 7.7 Razorpay — the single largest gap in the product

**Not built at all.** Zero lines of payment code, zero webhook, zero `RAZORPAY_*` (or any
payment-related) environment variable anywhere in the repository — confirmed by grepping
`lib/env.ts` (`map-commerce.md` §7 item 1). No `invoices` table exists either; the only record
that money changed hands anywhere in the product is a free-text `reason` string on an audit row
or a credit grant. This is `docs/NEXT.md` **N-20**, and it blocks: plan selection at wedding
creation, add-on storage purchase, self-service renewal, the archive fee, and the Studio plan
subscription itself.

### 7.8 What is planned, ticketed, and currently blocked on N-20

| Planned | Ticket | Status |
|---|---|---|
| Buy add-on storage | N-79 | Blocked by N-20; an interim "Ask for more space" (like credits) is ~1 hour of work on its own. |
| Tiered plans by storage (Light 5GB / Medium 50GB / Heavy 100GB / Custom 100–300GB) | N-80, D-44 | **Proposed, not decided** — conflicts with the current duration-priced ladder; Sandeep's call (Chapter 16, Decisions). |
| Self-service renewal, restore-on-payment for a cold catalogue | N-24b | Blocked by N-20; the `studio_gone` escape-hatch predicate should not be built before the checkout it would gate. |
| The "call them" prompt for a Cinema renewal | N-21c | Needs plan assignment (N-27c) first, which needs something to enforce a plan. |
| Reconcile the delivery-bandwidth estimate against Bunny's real bill | N-25b | Needs real traffic; every chart reads zero today. |
| A live cost line on the platform dashboard | N-82 | Modelled (`docs/reference/00-decision-log.md`-adjacent `SCALE-PLAN.md`), not built or billed. |
| Plans seeded and actually read | N-27c | Blocked — deliberately: a console that assigns a plan nobody consults is "furniture that looks like a feature." |

---

## 8. Notifications

**Partially built.** Every message the product sends rides through one queue, so a request a
person is waiting on never blocks on a mailer: a route writes a `queued` row and returns; a
bearer-guarded cron drains it separately (`lib/notify/send.ts:16-49`; `map-notifications.md` §1).

### 8.1 The mechanism

`enqueue()` renders the message **at queue time**, in the recipient's own language, from the same
`lib/i18n.ts` dictionary the rest of the product uses — so a template missing a Hindi string
fails the identical test a missing button label would. `drain()` (`GET /api/cron/notify`, run by
GitHub Actions every 15 minutes) sends up to 50 queued rows oldest-first, and **skips** — never
fails — a channel the active driver cannot carry, which is the entire reason a `whatsapp` row
would simply wait for a future driver rather than error today.

### 8.2 Every message the product sends

| Template | Trigger | Recipients | Channel today |
|---|---|---|---|
| `credential` | Forgot password; a studio issues a client's sign-in; the platform creates a studio/operator or resends a link | The one address | Email |
| `delivery` | Studio clicks "Email it" (§4.9) | The couple's address typed in | Email (+ a `wa.me` compose link, not a send) |
| `handover` | Direct handover, or a claim accepted | Every operator of the receiving org | Email |
| `expiry` | 60/30/7/1 days before the term ends, on a **published** catalogue | Current owner's operators, **and** the originating studio's operators if the current owner is a couple | Email |
| `grace` | 30/60/89 days into grace | Same recipients as `expiry` | Email |
| `archived` | The moment a catalogue moves to `cold` | **Current owner only** — not the originating studio (a real gap, §8.5) | Email |
| `credit-request` | "Ask for a credit," deduped to once per studio per day | Mehfilbox's own support inbox | Email |
| `ops-alert` | A stuck transcode webhook (reconcile), a failed synthetic guest check, a client closing their account | Mehfilbox's own support inbox | Email |

Eight templates total, each rendered in English and Hindi from 48 dictionary keys
(`lib/notify/templates.ts:16-29`). An unknown placeholder is left visible as `{name}` rather than
rendered blank.

### 8.3 Channels — only one actually sends

| Channel | Status |
|---|---|
| **Email**, via Resend | **Built.** Production driver. |
| **WhatsApp** | **Not built beyond a compose link.** N-36 shipped the email and a `wa.me/?text=` link a studio opens by hand — honest, since it composes rather than sends, but nothing is recorded and the studio must be at a device with WhatsApp on it. The real thing needs an `msg91` driver behind the same seam, blocked on a ₹500/month subscription and Meta's template-approval process, not on code (N-36c; D-12). |
| **SMS** | **Not built at all**, beyond the schema value. `Channel` allows `'sms'`; nothing anywhere ever produces one. |
| **In-app** | **Does not exist, in any form, for any actor.** `notifications` is a queue-and-audit table no UI reads — not the studio console, not the platform console, not `/my`. There is no bell, inbox or unread count anywhere in `app/` or `components/` (`map-notifications.md` §7 item 3). |

`drain()` is already written to skip a channel the driver cannot carry cleanly — the future
WhatsApp/SMS driver needs no change to any call site, only the driver itself.

**The consequence worth stating once, because it shapes every other chapter:** every actor learns
everything by email. A studio finds out a wedding is lapsing because an email arrived; a couple
finds out they own their wedding because an email arrived (or, for delivery, because a human sent
a WhatsApp message by hand). If the queue stops draining — §8.5's last bullet, and the
GitHub Actions dependency in Chapter 13 — there is no second surface anywhere in the product where
the same fact would still be visible.

### 8.4 Supabase Auth's own mailer — the one message outside this queue

**One message bypasses the queue entirely**: the sign-up confirmation email, sent by Supabase's
own SMTP (configured on the Supabase dashboard, not in this codebase) when a studio registers
(`lib/admin/auth-supabase.ts:72-93`). Every account this product itself creates (a client's
sign-in, a platform-created studio) sets `email_confirm:true`, so Supabase sends nothing for
those. Password reset moved **off** Supabase's mailer and into this queue on 12 September 2026
(D-33/D-34) — a stale in-code comment (`lib/env.ts:85-87`) still says otherwise.

### 8.5 Known gaps, worth carrying forward

- **A studio with two or more operators does not all receive the expiry/grace ladder.** The
  dedupe key for those two templates is keyed by *role* (`studio`/`couple`), not by operator id —
  the first operator processed for a role claims that milestone's row; every other operator with
  the same role at the same rung is silently dropped, forever, for that milestone
  (`lib/notify/schedule.ts:108`; `map-notifications.md` §7 item 4).
- **A catalogue a couple made themselves is warned twice at every milestone.** `recipientsFor`
  adds the originating studio as a second party whenever the owner org is a couple
  (`lib/notify/schedule.ts:128-159`) — correct after a handover, but for a catalogue a couple
  created itself (§5.6, N-73) `origin_org_id === org_id`, so the same operator is pushed into the
  list twice: once with `role: 'couple'`, once with `role: 'studio'`. Both get queued, because the
  dedupe key includes `role` (`schedule.ts:108`) and therefore does not collapse them, and the two
  emails carry identical `params` — nothing in the template varies by role. It reads as a plain
  duplicate (`map-client.md` §7 item 4).
- **The originating studio is never told when a wedding it delivered actually goes cold.** The
  warning ladder deliberately keeps the studio informed through every earlier rung ("a studio
  that hears nothing about a lapsing wedding cannot sell the renewal"), but the `archived` message
  itself only reaches the *current* owner — by then, the couple (`lib/lifecycle.ts:127-141`).
- **The 300 GB delivery alert doesn't alert anyone.** It is a `log.warn` line only — never
  `enqueue()`d or sent to ops — and Vercel's log retention is brief and unqueryable, so in
  practice it is unobserved (`app/api/cron/usage/route.ts:82-93`).
- **N-54 (paused, 7 September 2026): a concurrent drain can send the same row twice.** `drain()`
  reads, sends, then marks — sequential re-runs are safe, and GitHub Actions serialises its own
  schedule, but a second *caller* (a manual trigger mid-run, or a future Vercel Pro cron alongside
  the still-existing GitHub Actions one) is not guarded against. Scheduled to fix before any move
  to Vercel Pro.
- **The whole schedule is a soft dependency for a hard requirement.** Draining, the lapse ladder,
  warnings, and the synthetic health check all ride on GitHub Actions workflows in a public repo,
  which GitHub **disables after 60 days with no commits** — a quiet period between building
  sessions would silently stop every queued email and every guest-path health check.
- `docs/PRODUCT.md`'s own §1/§2 tables still describe notifications as **"Missing … blocks the
  most"** — stale since 7–8 September 2026, when the queue, the delivery message and the warning
  ladder all landed (`map-notifications.md` §7 item 13).

---

## 9. Media pipeline — upload to playback, with every external call

**Built**, and this is where the product's real engineering weight sits (CLAUDE.md names
`components/admin/UploadManager.tsx` explicitly as "where doc 13 §7 says the schedule slips").
It is also where this review's single most consequential finding lives (§9.6).

### 9.1 The two provider seams

`VideoProvider` (`lib/video/provider.ts`) and `PhotoProvider` (`lib/photos/provider.ts`) are the
only two places the product talks to Bunny. Each has a `fake` driver used by CI, tests and an
offline demo, and a `bunny` driver used in production — switched once on an environment variable
and memoized so dev's hot-reload does not lose it (`lib/video/index.ts:6-18`).

### 9.2 Uploading a film — every external call

1. **Pre-flight, before a byte moves**: container/extension check, a 20 GB per-file cap, a
   storage-quota check against real stored bytes (`app/api/admin/uploads/route.ts:32-79`).
2. **`POST /library/<id>/videos`** to Bunny creates the video record, then a TUS creation
   signature (`sha256(libraryId+apiKey+expiry+guid)`, 24-hour expiry) is returned — **the API key
   itself never reaches the browser** (`lib/video/bunny.ts:62-94`).
3. A `titles` row is written at `status='uploading'` **before** any bytes are sent.
4. The browser uploads directly to Bunny over TUS (resumable), 5 MB chunks, parallelism 2, a
   five-step retry backoff (0/2s/6s/15s/30s); a bare network failure is always retried, only a
   real 4xx (not a TUS offset conflict) gives up (`components/admin/UploadManager.tsx:35-225`).
5. **Resume**: the browser's own `localStorage` fingerprint plus a HEAD request to Bunny for the
   true offset — proven against a real network drop by `pnpm verify:upload`, which boots a real
   production build, drops the connection mid-transfer, and asserts the percentage never falls
   back. **The fingerprint is per-browser** — reopening on a different device shows no in-flight
   item to resume, though the server-side row will eventually be caught by reconcile (§9.4).

### 9.3 Uploading a photograph — every external call

1. The **browser** cuts one decode into three JPEG renditions (2048/1024/480px) plus an inline
   low-quality placeholder — **no server-side image processing exists at all**
   (`components/admin/PhotoManager.tsx:41-116`).
2. All three renditions go up as **one** multipart POST (Vercel's ~4.5 MB body cap applies before
   the route runs, so the whole set must clear it in one request).
3. The app server itself proxies three separate `PUT`s to Bunny's storage **origin**
   (`<region>.storage.bunnycdn.com`, password-authenticated) — bytes are proxied through the app
   here, unlike video, because authenticating a browser `PUT` directly would mean shipping the
   storage zone's write password to the client (`lib/photos/provider.ts:1-39`).
4. Photographs are later **read** through a separate **pull zone** (`<zone>.b-cdn.net`, public) —
   this asymmetry between the write path (authenticated) and the read path (unauthenticated) is
   exactly the shape of N-83 (Chapter 12).

### 9.4 Transcode status, and the safety net for a lost webhook

1. Bunny calls back `POST /api/webhooks/bunny`, signed HMAC-SHA256 over the **raw** body with the
   library's **read-only** key; a bad or missing signature is refused with nothing written
   (`app/api/webhooks/bunny/route.ts:17-27`; `lib/video/bunny.ts:264-304`).
2. The handler trusts the webhook only as "something changed" and re-asks Bunny's own status API
   for the truth, because Bunny's webhook and API enumerate "finished" differently.
3. **Nightly reconcile** (`GET /api/cron/reconcile`, 02:00 UTC) polls Bunny for anything stuck
   `uploading`/`processing` past `RECONCILE_STALL_MINUTES` (default 120) and settles it either
   way — this is the net that catches a webhook that never arrives. If it ever has to settle even
   one title, it alerts ops that the webhook itself may be broken
   (`app/api/cron/reconcile/route.ts:14-124`). This exact failure has happened in production: a
   domain change once left the webhook pointed at a superseded build for a period, and it "looked
   healthy" throughout (`docs/GO-LIVE.md`, cited in `map-media-infra.md` §7 item 4).

### 9.5 Playing a film — every external call

1. `POST /api/playback/token` authorises via the single guest gate (Chapter 6.2), rate-limited
   60/minute per catalogue+IP.
2. Bunny's **directory** (not file) token is signed — `base64url(sha256(key+"/guid/"+expires))` —
   because HLS immediately fetches child playlists under the same path that a file-scoped token
   would 403 on; verified end to end against real Bunny by `pnpm verify:playback`
   (`lib/video/bunny.ts:96-148`).
3. A token is bound to catalogue **and** title, checked before minting, so a leaked token for one
   film cannot fetch another (`lib/video/provider.ts:80-88`).
4. hls.js (or native HLS on iPhone Safari) attaches; a mid-stream 401/403 silently refreshes the
   token and reattaches at the same position.

### 9.6 The single most consequential finding on this map

**On the Supabase driver — the one production actually runs on — the "wait for Publish" promise
silently does not hold for films.** (It did not hold for photographs either until 16 September;
that half is fixed, and the fix is recorded at the end of this section.) `titles.live_at` /
`photos.live_at` exist specifically so a couple's freshly-encoded film or freshly-uploaded photo
does **not** reach the guest gallery until the studio's next explicit Publish
(`supabase/migrations/0012_content_waits_for_publish.sql:8-9`; the schema's own doc-comment says
"Null means the couple cannot see it, whatever `published` says," `lib/schema.ts:461-462`).

- `SupabaseRepository.listTitles({publishedOnly:true})` filters on `published` and `status`
  **only** — never `live_at` (`lib/db/supabase-repository.ts:1390-1392`; the predicate is
  the `if` at :1392). **Still live at `HEAD 7730633`.**
- `POST /api/playback/token` has the same gap a second time, on a different path: it refuses a
  title on `!title.published` and never reads `live_at` at all
  (`app/api/playback/token/route.ts:35-41`). So even once the list above is fixed, a
  ticked-but-not-yet-published film still mints a working playback URL to anyone who knows its
  slug — and a slug is frozen to the upload filename forever (N-84, §16.2), so it is guessable
  from a forwarded file. Whether this is deliberate is resolved nowhere in the code: the
  customizer's preview mounts the real guest components and calls this same public endpoint, so
  the route cannot currently tell an operator's own preview from a guest who holds the passcode
  (`map-media-infra.md` §7 item 3). Fix it with the list gate, not after it.
- The in-memory driver (what every unit test runs against) implements the list gate correctly.
  **No behavioural test exercises the Supabase driver's read path for either gate** — the one
  integration test that touches it never actually sets `published:true` on a ready title, so its
  own passing assertion proves less than its comment claims (`map-media-infra.md` §7 item 1).

**Practical effect, in production today:** an operator ticking "Visible to guests" on a
just-encoded film puts it in front of guests **immediately**, before the next catalogue Publish.
This directly contradicts the "identical semantics" promise CLAUDE.md makes for the `Repository`
seam (deliberate deviation 2) and is worth fixing before it is worth explaining to a studio why a
pre-publish preview leaked. It is ticketed as N-89 ([06 §2](./06-what-changes-next.md)).

**Fixed 16 September 2026 — the photograph half.** `SupabaseRepository.listPhotosForCatalogue`
did not accept the `liveOnly` parameter the `Repository` interface declares, so it returned
**every** photograph regardless of `live_at` — and since photographs have no `published` toggle
at all, every uploaded photograph reached guests the instant its upload finished. Commit
`7730633` gave the method the option and one filter, `.not('live_at','is',null)`
(`lib/db/supabase-repository.ts:1625-1642`), and added
`tests/unit/supabase-query-shape.test.ts`, which pins that filter through a recording stand-in
client. The commit message is explicit that the wider finding — no behavioural test runs against
this driver — is not fixed by the patch. Anything in an earlier draft describing photographs as
visible-on-upload describes the code before 11:27 on 16 September.

### 9.7 Jobs, crons, and the external services this subsystem depends on

| Service | Called for | Driver |
|---|---|---|
| **Bunny Stream** | Video upload tickets, transcoding, signed playback/poster URLs, download URLs, the webhook | `VIDEO_DRIVER=bunny` |
| **Bunny Edge Storage + pull zone** | Photograph storage (write) and serving (read) | `PHOTO_DRIVER=bunny` |
| **Resend** | Every queued email (Chapter 8) | `NOTIFY_DRIVER=resend` |
| **Supabase Postgres** | Every table in Chapter 14 | `DATA_DRIVER=supabase` |
| **Supabase Auth** | Identity (Chapter 12) | `AUTH_DRIVER=supabase` |

Six scheduled jobs share one `runJob()` wrapper that always records a `job_runs` row, whether the
work throws or not (`lib/jobs/run.ts:18-46`) — full detail, including why only two of the six fit
on Vercel's own cron limit, is Chapter 13.

---

## 10. Themes, house styles and customization

**Built** (the picking half); the *selling* half — a marketplace — is entirely unbuilt and is its
own section below.

### 10.1 Themes

A theme is nothing but a validated set of CSS custom properties — surfaces, text, accent/ink,
radii, faces, poster palette, card edge — 12 fields, Zod-validated and `.strict()`
(`themes/contract.ts:23-47`). **Seven ship built in** (`themes/registry.ts:29-122`); a platform
admin can author more from `/admin/platform/themes` (Chapter 3.7). One function (`themeCss`)
emits the CSS shared, byte-for-byte, between the real guest page and the customizer's live
preview, so they cannot drift (`themes/css.ts:35-96`). An unknown or withdrawn theme id falls
back to the default ("Marquee") rather than ever breaking a page
(`themes/registry.ts:154-160`).

### 10.2 The contrast gate

Every theme, built-in or platform-authored, is held to the same WCAG contrast checks before it
can be saved — seven token pairs (headings/body/small text on page and card, button text on
accent, accent on page) (`lib/contrast.ts:69-128`). `pnpm check:contrast` (part of `pnpm verify`)
re-derives this at CI time and separately fails the build if the streaming incumbent's exact red
(`#E50914`) appears anywhere in the codebase (`scripts/check-contrast.ts`).

### 10.3 Branding

One shared panel (`ThemePicker`) takes a target — `catalogue` or `studio` — rather than being
copied, so the contrast gate cannot silently exist in only one place
(`components/admin/ThemePicker.tsx:23-46`). Fields: theme, headline typeface, accent (five
presets or a colour picker, judged live against the chosen theme), "Presented by," a logo **URL**
(there is no image upload), and the "Made with Mehfilbox" toggle. A wedding's branding is a
**draft**, autosaved and only promoted on Publish; the studio's own default is a **live setting**
that only affects weddings created afterwards (`app/api/admin/studio/route.ts:26-37`).

### 10.4 House styles — saved presets, frozen while in use

A studio saves named presets bundling theme, layout, branding, locale and guest-code-on, one
marked default, created from a blank form, captured from a **published** wedding's current look,
or duplicated. **A style referenced by a published catalogue is frozen** — its look fields refuse
to change, with the count and a "Duplicate and edit" way out; renaming and the default flag
always pass (`app/api/admin/presets/[id]/route.ts:23-56`; D-36). Values are **copied** into a
catalogue at creation, so editing a style later never repaints an already-delivered wedding.

### 10.5 The module registry — the mechanism a "section" is built on

One `REGISTRY` object is the *only* place a module type is switched on; a structural test
(`tests/unit/registry.test.ts:123-157`) fails the build if any other file names a module type by
its string, which is the rule CLAUDE.md calls out explicitly. Each module declares a `meta`
(type, label, `occasions`, content shape), a Zod `schema`, a `Guest` component, an
`Editor` (always lazily imported, so admin-only form code never ships to a guest's phone), and
`defaults()`. **`meta.occasions` is decorative — nothing reads it.** Every module declares which
occasions it suits (`letter`'s excludes `baby-shower` and `naming-day`, `modules/letter/index.ts:25`
— the two occasions N-73 was written for) and the field is declared in the contract
(`modules/contract.ts:23`), but no file in `app/`, `components/` or `modules/registry.ts` ever
reads it: the wizard picks the same default template regardless of occasion, and the customizer's
Add-section menu offers every module to every occasion (`map-client.md` §7 item 5). Worth naming
because occasions are the hook N-73 and the direct-client case in
[05](./05-market-and-differentiation.md) both rest on — today the field constrains nothing in
either direction. **Eight module types ship**: billboard, curated row, photo row, photo grid, letter,
continue-watching, timeline, checklist, and a randomiser. A developer or coding agent adds a new
one by following `.claude/skills/add-module/SKILL.md` — one folder, one registry line.

### 10.6 The customizer

`/admin/c/<id>/customizer` — a drag-and-drop (pointer and keyboard) section list, undo/redo 20
deep, an Add menu, curation advisories (all-video page, films with no poster, over 12 titles —
never blocking), and **a live preview that mounts the real guest component tree** against draft
state, not a mock (`components/admin/PreviewPane.tsx`). This is a deliberate, argued deviation
from the original spec (CLAUDE.md, "Deliberate deviations" §1) — the spec sketched the guest
renderer as a server component, but a server component cannot mount live in an operator's
browser, and one implementation that both surfaces share beats two that drift. It is also why the
whole guest tree is a client component, and why the video player is still lazy-loaded on its own
route so that decision does not cost the browse page's load budget.

Every change — reorder, hide/show, an in-place heading edit, a drag inside the preview itself —
funnels through one `commit()` so undo and autosave cannot be bypassed, and autosaves to
`draft_modules` on an 800ms debounce (`components/admin/CustomizerShell.tsx:110-172`). Nothing is
visible to a guest until Publish (Chapter 4.8), which the console makes explicit — "3 films and
40 photographs will go live when you publish" (D-31).

### 10.7 The theme *marketplace* — planned, and not close

**Entirely unbuilt**, and `docs/PRODUCT.md` §6 says so in detail. What exists today is
single-tenant: only a platform admin can write a theme; there is no owner/author column on a
theme row at all, no price, no entitlement check, no versioning (editing a shared theme's tokens
repaints every wedding on it immediately — there is no "keep the old version"), and no
third-party submission or review queue. Five product decisions are named as unresolved in
`docs/PRODUCT.md` §6 and remain so: who may author a theme; what a theme may change (colours vs.
layout vs. a full plugin system); who buys — the studio or the couple; one-off or subscription;
and what happens to a live wedding when a theme it uses is updated or withdrawn. **The documented,
argued conclusion is that the first version worth building is not a marketplace at all — more
templates plus reusable branding presets (i.e., house styles, §10.4) — until a third party
actually asks to publish into it.**

---

## 11. Custom domains and addressing

**Built**, with one manual step in production. The default and canonical addressing is the
tenant path (`mehfilbox.com/<studio>/<wedding>`, Chapter 6.1); a custom domain is additive.

### 11.1 Requesting a domain

A studio can attach one domain to itself (serving every wedding it makes, at
`films.studio.in/<wedding>`) from `/admin/studio`; a client can attach one to a single wedding at
its own root, from that wedding's Settings. `POST /api/admin/domains` refuses the product's own
host, a host already in use elsewhere, or a second domain for the same scope, and writes a
`domains` row at `status='pending'` with a random verification token
(`app/api/admin/domains/route.ts:34-74`).

### 11.2 What the studio sees, and the verification ladder

The panel prints the exact DNS records to add — a `TXT` proving ownership, a `CNAME` (subdomain)
or an `A` record plus `www` `CNAME` (root domain), with copy buttons and registrar-specific hints
(`lib/domains/instructions.ts`). "Check DNS" resolves from the **server** (not the browser) with
a 3-second budget:

| Status | Meaning |
|---|---|
| `pending` | Not yet verified; the panel names exactly what is missing and that DNS can take up to a day to show. |
| `verified` | The TXT record is correct. On `DOMAIN_DRIVER=vercel`, this also **attaches automatically** and stamps every covered catalogue's `served_at`. On `DOMAIN_DRIVER=none` — **what production runs today** — it waits here for a platform admin. |
| `active` | Serving. Every printed URL for that wedding now uses the custom host, and the mehfilbox-path address **308**s to it — `permanentRedirect()` is used here and nowhere else, because an active domain is the address for good (`lib/address.ts:96`). `docs/DEPLOYMENT.md:189` and `docs/PRODUCT.md:287` both still call this a 301; both are stale. |
| `failed` | The provider (Vercel) itself refused it; the host's own message is shown. |

### 11.3 The platform's manual attach step

Because production runs `DOMAIN_DRIVER=none`, "Mark `<host>` attached" on
`/admin/platform/domains` (Chapter 3.8) is the *only* path from `verified` to `active`
(`app/api/admin/platform/domains/[id]/attached/route.ts:23-25`). **Neither side of this — the
studio's "Check DNS" nor the platform's "Mark attached" — sends an email when it completes**,
even though the studio-facing copy promises one ("you will get an email, and the address changes
over") (`components/admin/DomainPanel.tsx:161-164`; `map-studio.md` §7 item 14).

### 11.4 How a guest's request resolves on a custom domain

Because the edge middleware cannot query the database, any host that is not the product's own
root, `www`, or a loopback address is rewritten **blind** to `/d/<host>[/…]`
(`middleware.ts:41-48`). That route then looks the host up against the `domains` table — it must
be `status='active'` — resolves it to a catalogue slug, and renders the **identical**
`/c/<slug>` page components directly; there is no second guest tree for custom domains
(`app/d/[host]/[[...rest]]/page.tsx:34-90`). An inactive or unmatched host is a plain 404.

---

## 12. Security model

**Built**, with three known, named weaknesses in production today (N-83, N-85, N-86). Auth and
security is the choke-point layer every other subsystem calls through rather than reimplements
(`map-auth-security.md` §1).

### 12.1 Identity — who is this

One swappable interface, `AuthProvider` (`currentUser`, `signIn`, `signOut`, `createUser`,
`setPassword`) — a `local` driver (a signed cookie over an app-held scrypt hash, what CI and E2E
run on) and a `supabase` driver (Supabase Auth, what production runs), switched once on
`AUTH_DRIVER` (`lib/admin/auth-provider.ts:24-67`). The session cookie itself is a stateless,
HMAC-SHA256-signed token (12-hour TTL) — no session table, so an edge deploy needs no round trip
(`lib/auth.ts:17-66`). Passwords and guest passcodes are scrypt-hashed at rest.

### 12.2 Authorization — what org may they touch

**Deliberately a different file from identity.** `AuthProvider` only ever answers "which user";
`lib/admin/session.ts` is the *sole* place `org_id` enters a query, so swapping the authenticator
can never widen anyone's reach (`lib/admin/auth-provider.ts:12-16`). Three functions cover every
admin route in the product:

| Function | Rule |
|---|---|
| `requireOperator()` | Authenticated, with an `operators` row; refuses a suspended org at the same point, for reads and writes alike. |
| `requireOwnedCatalogue()` | The catalogue's `org_id` must equal the session's — another org's row 404s, **never 403s**, so its existence is never confirmed to a prober. |
| `requireEditableCatalogue()` | Owned, **or** originated by this org with an open support window (Chapter 2). |

CLAUDE.md itself calls this file "the only place `org_id` enters a query… a route that does not
call it is visibly unscoped." **There is no automated test enforcing that claim** the way
`tests/unit/registry.test.ts` enforces the module-type rule — it is a followed convention, not a
machine-checked one (`map-auth-security.md` §7 item 5).

### 12.3 The platform admin — structurally outside both

A fourth identity, `platform_admins`, has no `org_id` column and no code path that converts an
operator into one or back — two disjoint lookups, never one flag (Chapter 2, Chapter 3.1–3.2).
Every platform write route answers `NOT_FOUND`, never `FORBIDDEN`, to anyone else.

### 12.4 Credential issuance — one pattern, three callers, never invented per caller

- An unguessable 32-byte password nobody is told, plus a 14-day single-use, SHA-256-hashed link
  mailed to the real owner — used by a studio issuing a client's sign-in and by the platform
  creating a studio or adding an operator (`lib/auth/credential-links.ts:39-109`).
- A temporary password a studio can read aloud across a table: two Hindi-spellable words plus
  four digits (over 60 bits), flagged to force a change on first sign-in.
- The same hashing pattern is reused a third time for a wedding's handover claim token
  (`transfers.token_hash`).

### 12.5 Lockouts and captcha

An in-process, per-instance rate limiter (`lib/http/rate-limit.ts:1-41`, explicit in its own
comment that it is approximate across more than one Vercel instance) guards sign-in (5/address,
10/IP per 15 min), the guest passcode (5/device, 30/catalogue per 15 min), forgot-password,
set-password and playback-token minting. A three-driver captcha seam (`none`/`fake`/`turnstile`)
adds a challenge after 3 failures **when configured** — and **production currently runs
`CAPTCHA_DRIVER=none`** (`docs/NEXT.md`), so the approximate rate limiter is, today, the *only*
thing standing between a script and a password guess or a four-digit passcode (N-86).

### 12.6 What is signed, what is not — the video/photo asymmetry (N-83)

Film playback and posters are Bunny **directory** tokens, signing the whole rendition tree
because HLS fetches child playlists a file-scoped token would 403 on (Chapter 9.5).
**Photographs have no equivalent at all**: `getPhotoUrl` returns a bare, unsigned, un-expiring
public URL on the pull zone (`lib/photos/bunny.ts:34`). **Verified live against production on 13
September 2026**: a photograph's URL, once copied out of a passcode-protected wedding, returns
200 to anyone, forever. What softens it: keys are unguessable UUIDs with no filename in them, so
the exposure is a URL that leaked, not one that can be found by guessing. The fix (turn on the
pull zone's token authentication, sign at render) is written up but not built; one product
decision blocks part of it — whether an *unlisted* (no-passcode) wedding's photographs should be
signed too, or stay plain for share previews and WhatsApp's own image fetch (Chapter 16,
Decisions).

### 12.7 A passcode views; who downloads? (N-85, D-43)

**Today, the exact same passcode cookie that lets a guest watch also lets them download every
original file** at full resolution via `/download`, for as long as the 30-day grant lasts
(`lib/downloads.ts:38-55`; the current test suite documents this as *today's* intended behaviour,
`tests/unit/downloads.test.ts:53-58`). Sandeep's own rule, decided 13 September 2026 (D-43), is
that the passcode should be **view-only** — downloading should need the client's or the studio's
own sign-in. The pieces to build this already exist; it has not been built yet.

### 12.8 Row Level Security — a backstop, not the mechanism

RLS is enabled on every table the anonymous key could otherwise reach, and **the anonymous role
has zero policies anywhere** — every guest and admin path already goes through a Next.js route
using the service-role key server-side, which bypasses RLS by design
(`supabase/migrations/0002_row_level_security.sql:29-39,85-109`). A live integration test asserts
the anon key reads and writes nothing (`tests/integration/drivers.test.ts:289-331`). One
consequence worth naming: RLS's own `authenticated`-role policy on `catalogues` would actually
**refuse** a studio's legitimate support-window read (during the window the row's `org_id` is the
couple's) — this is fine only because the application never queries as `authenticated`, and would
mislead a future developer reading only the SQL.

### 12.9 Response headers, and the one that is missing

Six headers ship on every response — `X-Robots-Tag: noindex` (the *whole* product is
unindexable, not only the admin), `X-Content-Type-Options`, `X-Frame-Options: DENY`,
`Referrer-Policy`, a `Permissions-Policy`, and HSTS with `preload` (`next.config.ts:11-37`).
**There is no Content-Security-Policy anywhere in the repository** — a named, still-open part of
N-86.

### 12.10 Named security gaps, in one place

| Item | Ticket | What it is |
|---|---|---|
| Photographs unsigned on a public CDN | N-83 | Chapter 12.6. Verified live 13 September 2026. |
| Passcode grants downloads (should be view-only) | N-85, D-43 | Chapter 12.7. |
| Rate limits per-instance; no CSP; `CAPTCHA_DRIVER=none` in production | N-86 | Chapter 12.5, 12.9. |
| A film's URL carries its original upload filename forever | N-84 | Not an access gap — a metadata leak; the slug is set once at upload and never re-derived on rename. |
| No automated test enforces the `org_id`-scoping convention | Observed | Chapter 12.2. |
| Cron bearer-secret compares are not constant-time (`!==`, not `timingSafeEqual`) | Observed | Low practical severity — a 16+ character secret over the network. |
| Three guest endpoints have no rate limit at all, while every sibling does | Observed | `POST/GET /api/likes` (unlimited toggling), `GET /api/download` (unlimited manifest builds, **one provider call per film per request**), `GET /api/og` (uncapped on the first request per `v=`, then cached a year). Every other guest API — passcode, profiles, progress, playback/token, module-state, qoe — calls `lib/http/rate-limit.ts` (`map-guest.md` §7 item 2). |
| The playback-token route gates on `published`, never `live_at` | N-89 | Chapter 9.6, second bullet. The same class as the list-gate bug and not closed by fixing it — a ticked-but-unpublished film still mints a working URL to anyone holding the slug (`map-media-infra.md` §7 item 3). |
| `POST/DELETE /api/admin/catalogues/:id/transfer` is ownership-scoped, not partner-scoped | Observed | `requireOwnedCatalogue` with no `org.kind === 'partner'` check, unlike `couple/route.ts:49`, which does check. No UI exposes it (`canHandOver` hides the panel for a couple) and the `direct: true` shortcut is separately blocked — but a couple who owns a catalogue could, by calling the API directly, mint a working 14-day claim link to **any** address and hand their own wedding away (`map-client.md` §7 item 6). |

---

## 13. Operations — deploy, health, crons, migrations

**Built**, with the honest caveat that there is no staging environment (N-87) — everything real
is tested in production.

### 13.1 Deploying

`./scripts/deploy-vercel.sh` (`scripts/deploy-vercel.sh:1-108`): refuses to link a Vercel project
that is not already listed (a past rename once silently created a second, empty project and
deployed into it while production kept serving the old one), pushes every variable from a
gitignored `.env.vercel.local`, deploys, then prints a four-step manual checklist — curl
`/api/health`, sign in and create a catalogue, **point Bunny's webhook at the new URL and upload
one film to prove the signature**, check `ROOT_DOMAIN`. The webhook step cannot be automated: it
needs Bunny's *account* API key, which this repo deliberately never holds
(`docs/DEPLOYMENT.md:58-68`) — a domain change moves `ROOT_DOMAIN` on Vercel but does **not** move
the webhook, and this has already caused one real, hard-to-diagnose incident (Chapter 9.4).

### 13.2 Health — two very different endpoints

| Endpoint | Audience | Depth |
|---|---|---|
| `GET /api/health` | Public, unauthenticated, for uptime monitors | Shallow by design — reports which drivers are configured, nothing about whether they actually work. Notably omits the `PHOTO_DRIVER`, so a photo driver silently defaulted wrong would not show here (`map-media-infra.md` §7 item 10). |
| `/admin/platform/health` | Platform admin only | Ten services probed live, 3-second budget each, 60-second cache: database, Bunny Stream, Bunny Storage, the photo CDN, Resend, the notification queue, the transcode pipeline, every scheduled job's last run, custom domains, and a synthetic guest-path walk that actually mints a playback token (`lib/health/probes.ts:69-254`). |

The synthetic check exists specifically because `/api/health` "stayed green through every real
fault this product has had" — a webhook pointed at a dead URL, a storage column nothing wrote, an
SMTP credential that authenticated but could not send (`app/api/cron/synthetic/route.ts:16-20`).

### 13.3 The six scheduled jobs

Only two fit on Vercel's Hobby-plan cron limit; the other four run from a GitHub Actions
workflow instead:

| Job | Cadence | Runs from | Purpose |
|---|---|---|---|
| `reconcile` | Daily, 02:00 UTC | Vercel | Settles stuck film transcodes (Chapter 9.4). |
| `usage` | Daily, 03:30 UTC | Vercel | Storage/delivery rollup (Chapter 7). |
| `lifecycle` | Daily, 03:40 UTC | GitHub Actions | Moves the lapse ladder (Chapter 4.17). |
| `warnings` | Daily, 03:40 UTC | GitHub Actions | Queues expiry/grace emails (Chapter 8). |
| `notify` (drain) | Every 15 minutes | GitHub Actions | Sends everything queued (Chapter 8). |
| `synthetic` | Hourly | GitHub Actions | The guest-path health check above. |

**A public GitHub repository's scheduled workflows disable themselves after 60 days with no
commits** — silently, with only a GitHub email as warning. A quiet period between building
sessions would stop notifications, the lapse ladder, and the synthetic check all at once, with no
error surfacing anywhere in the product itself (`map-media-infra.md` §7 item 7). Every cron
authenticates with a bearer token against `CRON_SECRET`; if that variable is simply unset, Vercel
sends **no** `Authorization` header at all, so a forgotten variable reads as a job that silently
never runs rather than an error (repeated in every cron route's own comment).

### 13.4 Migrations — no ledger, convention instead

25 migration files under `supabase/migrations/`, every one written `create table if not exists` /
`add column if not exists`, so re-running one is harmless **by convention, not by tracking**.
**There is no migration ledger** — which have run is inferred from which tables/columns exist
(`docs/DEPLOYMENT.md:116-117`). `pnpm bootstrap:sql` concatenates every migration plus a first-org
insert into one paste-ready script for a brand-new Supabase project; `pnpm db:migrate` prints the
ordered file list for an existing one. Neither executes DDL itself — the service-role key cannot
run arbitrary SQL over PostgREST, and building an `exec_sql` RPC would be a standing remote-DDL
hole in a database holding people's weddings (`scripts/bootstrap-supabase.ts`). A skipped
migration produces a column that silently reads `undefined` downstream, not an error.

### 13.5 Verification tooling

`pnpm preflight` (read-only, a few seconds): validates Supabase reachability, distinguishes
Bunny's library key from its account key, checks the video pull zone's token authentication and
referrer/IP-pinning settings, and does a real write+read against the photo storage zone — but
**does not** check the photo zone's token authentication the way it does for video (N-83 again),
and **cannot** check the webhook URL at all (§13.1). `pnpm verify:playback` and `pnpm verify:upload`
are real-Bunny, real-network-drop proofs (Chapter 9) — both manual, both consuming real encoding
minutes, and **neither is part of `pnpm verify` or CI**.

### 13.6 If not Vercel

A `Dockerfile` exists (multi-stage, non-root, a container healthcheck) for a self-hosted
deployment. Three things Vercel was quietly providing must be replaced by hand: wildcard TLS, the
cron scheduler (two curl calls for the two Vercel-native jobs), and ISR revalidation across
instances. **The four GitHub-Actions-only jobs have no documented container-deploy replacement at
all** — a literal Docker deploy following the current docs would never drain notifications, walk
the lapse ladder, queue warnings, or run the synthetic check (`map-media-infra.md` §7 item 7).

### 13.7 What operations still lacks

**No staging environment** (N-87) — CI is deliberately hermetic (memory + fake drivers); Vercel
Preview has zero real environment variables and the app refuses to boot against ephemeral data in
production mode, so nothing real can be tested before it reaches production. This already bit
once: applying a migration on 12 September 2026 broke catalogue creation for the minutes before
deploy finished, with nowhere to have caught it first. **No log drain that survives an
invocation, and no error tracking with a release marker** (N-53b) — `lib/log.ts` writes
structured JSON to stdout, which Vercel keeps only briefly.

---

## 14. Data model summary

25 migrations, `0001` to `0025`, Postgres via Supabase, RLS enabled on every table with **no
anonymous-role policy anywhere** — every read and write goes through the app's service-role
`Repository` seam, in one of three interchangeable drivers (memory, file, Supabase) with
identical contracted behaviour (CLAUDE.md deviation 2) — except the one place that contract
currently does not hold (Chapter 9.6).

| Table | One line | First appears |
|---|---|---|
| `orgs` | A studio or a client account — `kind` (`partner`/`couple`), `status`, `locale`, `branding`. | `0001`, `kind`/`status`/`locale` added later |
| `operators` | A person who can sign in, pointing at one `orgs` row; `role` is stored but enforced nowhere. | `0001` |
| `catalogues` | One wedding (or other occasion) — the biggest table: content, branding, privacy, lifecycle, addressing, all in one row. | `0001`, extended by nearly every later migration |
| `titles` | One uploaded film — status, provider id, `size_bytes`, `live_at` (the publish gate). | `0001` |
| `albums` | One photo album per catalogue (today, always exactly one, auto-created). | `0001` |
| `photos` | One uploaded photograph, three renditions referenced by one stored URL. | `0001` |
| `profiles` | A guest's chosen household label ("Bride's side," etc.) for one catalogue. | `0001` |
| `playback_progress` | Per-profile resume position for one film. | `0001` |
| `play_events` | Watched-seconds records, the raw input to usage estimation. | `0001` |
| `module_state` | Per-profile state for an interactive module (today: the checklist). | `0001` |
| `usage_rollup` | Monthly stored/delivered GB and watch-seconds, per catalogue. | `0001`, `watch_seconds` in `0015` |
| `likes` | One (catalogue, device key, film-or-photo) like. | `0008` |
| `notifications` | Every message queued, sent, or failed — the whole of Chapter 8. | `0009`, dedupe key in `0014` |
| `platform_admins` | The platform owner identity — deliberately outside the `orgs` graph. | `0004` |
| `platform_audit` | Every platform-console write, after the fact. | `0010` |
| `entitlements` | A per-org (or per-catalogue, unused) storage override. | `0006` |
| `plans` | **Empty. Nothing reads it.** The undone half of Chapter 7. | `0006` |
| `credits` | One publish-credit — granted, spent, or expired. | `0021` |
| `credential_links` | A single-use, hashed, expiring set-password/reset link. | `0017` |
| `transfers` | A single-use, hashed handover claim token. | `0005` |
| `job_runs` | One row per scheduled-job invocation, whether it succeeded or not. | `0022` |
| `themes` | A platform-authored theme (the 7 built-in ones are code, not rows). | `0019` |
| `presets` | A studio's saved house style. | `0020` |
| `domains` | A custom domain and its verification/attachment state. | `0023` |
| `auth.users` | Supabase-managed identity table; `operators.id` is a foreign key into it. | Supabase-managed, not in this repo's migrations |

Two columns are worth flagging as **dead**, kept for history rather than removed:
`entitlements.max_titles`/`max_photos` — superseded by storage limits, nothing resolves them
(`0007_storage_only.sql:23-27`); `catalogues.custom_domain` — superseded by `served_at` and the
`domains` table, no longer written.

---

## 15. Configuration

Every variable is read in exactly one place, `lib/env.ts`, enforced by an eslint rule
(`no-restricted-properties`) with a narrow, deliberate exemption for `scripts/**` — so a
diagnostic script can read a *partially* configured environment the app itself would refuse to
boot on at all.

| Group | Variables | Notes |
|---|---|---|
| **Core** | `SESSION_SECRET`, `CRON_SECRET`, `ROOT_DOMAIN`, `TENANCY_MODE` (`path`\|`subdomain`), `NODE_ENV`, `NEXT_PHASE`, `ALLOW_EPHEMERAL_DATA` | `SESSION_SECRET` signs both the operator session and the guest passcode-grant cookie, and falls back as the cron bearer if `CRON_SECRET` is unset. Production refuses the committed default `SESSION_SECRET` outright. |
| **Auth** | `AUTH_DRIVER` (`local`\|`supabase`) | `local` needs nothing external and is what CI/E2E run on; `supabase` is production. |
| **Data** | `DATA_DRIVER` (`memory`\|`file`\|`supabase`) | Production must be `supabase`, enforced at boot unless `ALLOW_EPHEMERAL_DATA=1`. |
| **Supabase** | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`/`SERVICE_ROLE_KEY` | The anonymous key is subject to RLS and reaches nothing (§12.8); the secret/service-role key is what the app actually reads and writes with. |
| **Video (Bunny Stream)** | `VIDEO_DRIVER` (`fake`\|`bunny`), `BUNNY_LIBRARY_ID`, `BUNNY_API_KEY`, `BUNNY_CDN_HOSTNAME`, `BUNNY_TOKEN_AUTH_KEY`, `BUNNY_WEBHOOK_SECRET` | `BUNNY_API_KEY` must be the **library** key, not the account key — the two return an identical 401 if swapped. |
| **Photos (Bunny Storage)** | `PHOTO_DRIVER` (`fake`\|`bunny`), `BUNNY_STORAGE_ZONE`, `BUNNY_STORAGE_PASSWORD`, `BUNNY_STORAGE_REGION`, `BUNNY_PHOTO_CDN_HOSTNAME` | The zone that currently serves every photo **unsigned**, regardless of these values (N-83). |
| **Notifications** | `NOTIFY_DRIVER` (`fake`\|`resend`), `RESEND_API_KEY`, `NOTIFY_FROM`, `SUPPORT_EMAIL` | Boot refuses `fake` against `DATA_DRIVER=supabase` — that exact combination once shipped for a day. |
| **Captcha** | `CAPTCHA_DRIVER` (`none`\|`fake`\|`turnstile`), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Production runs `none` today (§12.5). |
| **Custom domains** | `DOMAIN_DRIVER` (`none`\|`fake`\|`vercel`), `DOMAIN_CNAME_TARGET`, `DOMAIN_A_RECORD`, `DOMAIN_NAMESERVERS`, `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` | Production runs `none` — the platform's manual "Mark attached" step (§11.3) is load-bearing because of this. |
| **Playback & jobs** | `PLAYBACK_TOKEN_TTL_S` (default 4h), `RECONCILE_STALL_MINUTES` (default 120), `DEMO_CATALOGUE_SLUG` | The synthetic health check walks whichever catalogue this last variable names. |
| **Development only** | `DEV_OPERATOR_EMAIL`, `DEV_OPERATOR_PASSWORD` | Seeds an operator on the memory/file drivers; production is guarded against the committed default value and against booting on a non-Supabase driver at all. |
| **Written, not read by the app** | `PLATFORM_ADMIN_EMAIL`, `PLATFORM_ADMIN_PASSWORD` | Written *by* `pnpm platform:admin` into a gitignored file for a human to move into a password manager — outside the validated schema, never read back by any route. |
| **Informational** | `VERCEL_GIT_COMMIT_SHA` | Surfaced as the deploy marker on `/api/health` and stamped into every ops alert. |

---

## 16. What is planned and not built

Sourced from `docs/NEXT.md`, current as of 13–16 September 2026. Several tickets are already
detailed in the chapter their subject matter belongs to; this section indexes those and then
lists everything else.

### 16.1 Already covered above — pointer only

| Ticket(s) | Subject | Chapter |
|---|---|---|
| N-20, N-79, N-80, N-24b, N-25b, N-27c | Payment, add-on storage, plan tiers, restore-on-payment | 7 |
| N-36c, N-54 | Real WhatsApp send, concurrent-drain safety | 8 |
| N-83, N-84, N-85, N-86 | Photo signing, film-URL metadata, download gate, rate limits/CSP | 12 |
| N-87 | Staging environment | 13 |

### 16.2 The gaps of 13 September 2026, Tier 1c — remaining items

| Ticket | Item | Size | Notes |
|---|---|---|---|
| N-77 | "Generate one for me" on the guest-code panel — the wizard already has this button, the two settings-screen equivalents do not | ~1h | Cosmetic parity gap. |
| N-78 | "Client," not "Couple," on every account-facing surface (D-42) | ~2h | The substance (`/my` listing every catalogue) is already built; only outward copy is left — door, platform nav, register-page wording, account-addressed emails, the usage guide. "The couple" stays wherever it means the people in the wedding. |
| N-81 | Measure the limits for real | ~2h, after 3–4 real weddings | `SCALE-PLAN.md` §3 reasons the numbers today (Vercel invocations bind first, ~333 weddings/month); none are yet measured against real traffic. |
| N-82 | A live cost line on the platform dashboard | ~2h, with N-25b | `SCALE-PLAN.md` §1 models ₹55,474 infrastructure against ₹3,30,000 revenue over six months (83% margin) but nothing reads Bunny's own billing API yet. |
| N-88 | A studio guide and a client guide, kept current, published at `/help` | ~1 session | `docs/USAGE-GUIDE.md` exists but predates the entire second pass — old addressing, one door, no themes/credits/house styles/domains/client accounts. |

### 16.3 Tier 2 — before a planner sees it, not yet covered

| Ticket | Item | Size | Notes |
|---|---|---|---|
| N-53b | A log drain that survives an invocation, and error tracking with a release marker | ~2h | The seam (`lib/observability.ts`) already exists; needs a paid vendor, so deferred until revenue justifies it. |
| N-21c | A "call them, don't email them" prompt for a Cinema-tier renewal | ~1h | Needs **plan** assignment first — a prompt keyed on a plan nobody has assigned yet. `docs/NEXT.md:296-301` names the blocker as **N-27b** in both its header and its body, which reads as already cleared, since N-27b (the storage quota) shipped on 8 September. The real blocker is **N-27c**, plan assignment, which is itself blocked on D-44. Correct the ticket when NEXT.md is next touched. |
| N-22b | Per-film download from the title modal, not only the full manifest | ~1h | Worth doing once there is real footage to test a 6 GB file against, on a phone. |
| N-24a | Set Bunny's encoding ladder to 360p–720p by default; upload one real 15-hour wedding and correct the pricing model's GB figures | ~1h, operator task | **Nothing on the price list holds a real wedding until this runs.** |
| N-36b | The studio's "Filmed by" credit made permanent and un-editable, plus an enquiry link that survives every renewal (D-13) | ~half a session | What a studio gets *instead of* a renewal revenue share. |
| N-37 | Delivery tracking and a studio-facing lapse dashboard | ~1 session | Moved earlier in priority by D-26: under studio-only billing, the studio *is* the renewal mechanism, so a list of every catalogue it originated with its end date is the collection channel, not a report. |
| N-38 | Family circles — scoped links per side of the family, "who watched" | ~1 session | The profile gate already identifies a guest by label; nothing groups them yet. |
| N-39 | An anniversary-date message with a deep link — the renewal nudge that does not read as one | ~2h | — |
| N-26b | A second saved house style, if a studio ever asks for one | ~half a session | A studio has one studio-wide default today; the *plural* (named presets a studio picks between) is house styles (Chapter 10.4) applied to itself. |

### 16.4 Phases 4 and 5 — sized only when reached

Cast to TV (Chromecast/AirPlay) · AI-generated, operator-corrected subtitles · custom domains
served and verified fully automatically · DPDP consent and deletion-on-request · an in-catalogue
`store` module with commission · guest uploads and a guestbook · a studio portfolio page · draft
feedback from a couple · an API and webhooks. A theme marketplace, photo proofing/CRM, native TV
apps, and a renewal revenue share are **deliberately off the roadmap entirely**, not merely
deferred (D-22).

### 16.5 Operator tasks — not code, and not delegable to an agent

- **N-14, real footage.** Two real catalogues exist; one has been reviewed on a real phone and
  "reads as a streaming product" — the largest unknown Phase 0 needed answered. **Still open**:
  what a finished hour actually costs in storage, and whether the visual treatment holds against
  200–300 real photographs rather than eleven.
- **N-6, the demo catalogue needs real footage.** The fixture uses generated gradients, which
  proves the mechanics but would misrepresent the product to a planner, who judges it on whether
  the films feel real.
- **N-11, one item left on the live domain.** The Bunny library's webhook target needs updating
  to the stable domain via Bunny's dashboard (account-key-gated, so not scriptable from this
  repo) — see the incident already described in Chapter 9.4/13.1.
- **The Resend API key** — flagged as possibly invalid on 11 September 2026, possibly since
  fixed; the only honest check is sending a real message and reading what arrives
  (`docs/MANUAL-TEST.md` §0), not trusting a dashboard.

### 16.6 Decisions already made that shape everything above

Three decisions from `docs/reference/00-decision-log.md` are the reason several of the above are
*sized* the way they are rather than simply missing: **D-11** (archive, never automatic deletion)
is why the "cold" state exists at all; **D-26** (studio-only billing, with a computed-not-stored
escape hatch) is why N-37 moved earlier and why nothing writes `subStatus='deleted'`; **D-42**
(client, not couple, in the account's own copy) is why N-78 is words only, not a rebuild.

---

## Decisions this asks of Sandeep

| # | Decision | Where it comes up | Recommended default |
|---|---|---|---|
| 1 | **Fix the Supabase-driver publish gate for films now, before any feature work** (the photograph half was fixed on 16 September, commit `7730633`). A film ticked "visible to guests" is live to guests before the studio publishes (Chapter 9.6) — a silent break of a stated product promise, live, today — and the playback-token route has the same gap independently. | Chapter 9.6 | **Fix it first**, both sites. It is a data-correctness bug in production, not a feature gap; every day it stays open is a day a "preview" can leak. Ticketed as N-89. |
| 2 | **Should studio self-registration require approval?** Today anyone can register at `/admin/register` with no gate. | Chapter 4.1; `docs/NEXT.md` "Decisions Sandeep owns" | Keep it open (D-39's "suspend after," already decided) unless real abuse shows up — an approval queue costs every honest studio a wait. |
| 3 | **Should unlisted (no-passcode) catalogues' photographs be signed too, once N-83 is fixed?** | Chapter 12.6 | Sign photographs on any catalogue **with** a passcode; leave unlisted ones plain, since a share preview and WhatsApp's own image fetch need an unsigned URL. |
| 4 | **Build N-85/D-43 (passcode views, only an account downloads) alongside N-83.** Both are named, live security gaps; the pieces for N-85 already exist in the code. | Chapter 12.6, 12.7 | Build both together — they are the same class of fix and the second is smaller than the first. |
| 5 | **Turn Turnstile on in production** (`CAPTCHA_DRIVER=turnstile`). This is an operator step — two keys and one environment variable — not a code change. | Chapter 12.5 | Do it now; it is the cheapest of the three named security items and removes the "only defence is a per-instance rate limiter" exposure immediately. |
| 6 | **Plan tiers: duration-priced (current) or storage-tiered (D-44 proposal)?** `plans` stays empty and N-27c stays blocked until this is decided. | Chapter 7.8, 16.6 | Keep the current Deliver/Keep/Cinema ladder as the sellable product; treat the storage proposal as a future **add-on dimension** rather than a replacement, since it is not what is being sold today. |
| 7 | **Ask one studio owner the day-60 question** — will they actually offer Keep at the upgrade point, and at what markup? No amount of internal reasoning substitutes for one real answer. | `docs/reference/00-decision-log.md` P-6 | Ask before Phase 2 pricing work goes further. |
| 8 | **Prioritise Razorpay (N-20) as the next major engineering block, or hold?** It is the single largest planned gap — nothing self-service (renewal, add-on storage, the Studio plan itself) exists without it. | Chapter 7.7 | Treat it as the next major build once the two security fixes above (items 1, 4, 5) are done — everything else in Chapter 7 is blocked behind it. |
