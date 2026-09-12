# Product surface

**The canonical list of what this product is, and what of it exists.** Structured the way Sandeep
described it, so it stays recognisable as the business grows.

**This is the file to update on a pivot or a new requirement** — before writing code, before
touching `NEXT.md`. Everything else follows from it: `NEXT.md` is the ordered slice of what is
missing here, and `PRICING.md` prices what is built.

| Status | Meaning |
|---|---|
| **Built** | Exists, tested, deployed |
| **Partial** | Some of it works; the gap is named |
| **Missing** | Does not exist |

Last reviewed: **14 August 2026** — full consistency audit against the code and the spec.
**Extended 6 September 2026** — rows marked *(new)* come from the competitor and feature review
merged in [`ROADMAP.md`](./ROADMAP.md), which also records three decisions that changed existing
rows: no hard delete, multi-channel notifications, and the studio's credit surviving renewal.

> **12 September 2026 — the second pass.** Sandeep's requirements of that morning, refined
> against the code and the design prototype, are specified in
> [`spec/16-platform-v2.md`](./spec/16-platform-v2.md) and decided as D-32 to D-41. They change
> the shape of several rows below — addressing, accounts, themes, the couple's surface, the
> platform console — and §8 at the end of this file carries the new rows. Each is marked
> **Built** as its `NEXT.md` ticket (N-60 to N-75) lands.

## The name

**Mehfilbox** — decided 7 September 2026. **The domain is still `heirloomfilms.in`**, and so is
every identifier: the Vercel project, the Bunny zones, the package, the repository, the sending
address `hello@heirloomfilms.in`. Only the documents carry the new name today; the code and
infrastructure rename is a separate job (see `NEXT.md`).

That gap is deliberate and worth stating rather than tidying away: a document that renames the
live domain describes infrastructure that does not exist, and this repo has already paid for that
kind of tidiness once.

### What it replaces, and what was learned

The name before this was **Heirloom Films** (`heirloomfilms.in`, registered 14 August 2026), and
before that **Mehfil**. The August reasoning is kept below because the *criteria* still apply even
though the answer changed — a coined word is distinctive and registrable, and the trademark
register rather than a search engine is what decides whether a name is free:

- **An arbitrary word beats a descriptive one.** A trove is a collection and a stream is a stream;
  a coined name has no prior meaning to fight, which is what makes it registrable.
- **Trove and Cinea died on trademarks, not domains.** Trove is occupied in classes 41 and 42;
  Cinea is a registered mark of a Dolby Laboratories subsidiary in video technology. A free domain
  is not the signal — a free domain *plus no trademark holder* is.
- **"Mehfilbox" is a coined compound**, which puts it in the same distinctive category, and it
  reaches back to the original Mehfil rather than away from it.

> **Two things outstanding before this name is committed to anywhere expensive:**
>
> 1. **`mehfilbox.in` (and `.com`) — check availability and register.** Everything currently
>    resolves to `heirloomfilms.in`; that domain is live, verified with Resend, and serving.
> 2. **A trademark search in classes 41 and 42**, which was outstanding for the previous name and
>    still is. A search engine finds brands, not registry records — Cinea is the case that proves
>    the difference. Budget ₹3,000–8,000 with an agent.

---

## 1. Front end

### 1.1 Admin (us — the platform)

| | Status | Where it stands |
|---|---|---|
| Tenant account creation | **Partial** | Tenants self-register at `/admin/register` (working since N-17). **We cannot create one for them** — that is N-27. |
| Tenant management | **Partial** | `/admin/platform` lists every org with catalogue counts, and one org's catalogues **read-only**. No suspend, no edit, no plan assignment, no delete. |
| User management | **Missing** | No view of operators or couples, no password reset on their behalf, no way to move a catalogue between orgs after handover. |
| Plan and quota assignment | **Missing** | `entitlements` resolves grants correctly but **nothing writes one**. Assigning a partner a plan is a SQL insert. |
| Revenue and usage view | **Missing** | Storage is metered per catalogue; delivery is not (`deliveredGb: 0`). No aggregate anywhere. |
| Impersonation for support | **Missing** | Deliberately — read-only is the current stance (doc 15 §1). Revisit only with an audit trail. |

**The shape is right and the surface is thin.** `platform_admins` is correctly outside the org
graph, so there is no privilege-escalation path to get wrong; what is missing is screens.

### 1.2 Tenant — the service provider (studio, planner)

| | Status | Where it stands |
|---|---|---|
| Create a user account with credentials | **Built** | N-62, 12 Sept. The studio issues the couple's sign-in from the overview — a set-password link, or a temporary password shown once and replaced at first sign-in. We still never hold a couple's chosen password. |
| Tier selection at creation | **Missing** | The wizard has no plan step. Every catalogue gets the same default caps. Tiers are now Deliver (90 days) / Keep / Cinema (`PRICING.md`, Sept 2026); a Deliver catalogue needs the 90-day term from N-24. |
| Skin selection from a marketplace | **Missing** | Three hardcoded templates (`keepsake`, `films-only`, `anniversary`) chosen in the wizard. **No marketplace, no purchasable skins.** See §6. |
| Customisation — layout, text, message | **Built** | The customizer: drag or keyboard reorder, in-place heading editing, per-section editors, live preview of the real guest components. |
| **Saving is legible everywhere** | **Built** | One `SaveState` component behind the film list, the customizer and the photographs — `Saving…`, `Saved`, and **`Not saved`**, which the film list could not say at all before: it discarded the response, so a refused save looked identical to a successful one. |
| Photograph captions | **Built** | On-blur caption field per photograph, a PATCH route scoped through the album's catalogue exactly as deletion is, and `updatePhoto` on both drivers. The field had existed on the record since the beginning with nothing able to write it. |
| Language — guest surface | **Built** | English and Hindi, every guest string localised, silent fallback to English. |
| Language — **chosen at account creation** | **Missing** | **New requirement.** `orgSchema` has no locale field, so a tenant cannot set the language for their account and have new catalogues inherit it. Today the guest toggles and the default is always English. |
| Language — admin console | **Missing** | The console is English-only. A Hindi-first studio operates it in English regardless of what their guests see. |
| Account handover | **Built** | Single-use link, 14 days, hash-stored, one live transfer per catalogue, cancellable. Partner loses access entirely; credit survives. |
| Custom domain | **Partial** | Stored and validated. **Not served** — N-68 builds the table, the generated instructions and the verification. |
| Passcode | **Built** | Optional, five wrong tries locks the address for fifteen minutes. |
| Add storage | **Missing** | `entitlements` supports per-catalogue grants with expiry. No purchase flow, no UI, no proration. |
| See what a plan holds | **Missing** | Nothing shows "this plan holds about 9 hours" at purchase, or warns at 80% used. **Required by the pricing** — see `PRICING.md` §6. |
| Limits match the plan | **Built** | Storage is the only limit and it is enforced at both upload paths against real bytes. The film and photograph count caps are gone (N-28). |
| Included term matches what is sold | **Built** | Twelve months, matching `PRICING.md` (N-28). |
| Delivery message *(new)* | **Missing** | One click on the overview sends the couple a WhatsApp/email launch — poster, names, "now streaming", the link. Today the operator copies the link and writes their own. N-36. |
| Delivery tracking *(new)* | **Partial** | Play events are stored and never read per catalogue. No "opened", no watch-time per film, no "not opened in 7 days". N-37. |
| Lapse dashboard *(new)* | **Missing** | Which couples are approaching or past renewal; renew on their behalf. N-37. |
| Permanent credit and referral link *(new)* | **Partial** | `presentedBy` is snapshotted at handover, but it is an editable field, not a promise. Required: a "Filmed by" credit the couple cannot remove and an enquiry link that routes to the studio, both surviving every renewal. N-36b. |
| Client premiere *(new)* | **Missing** | Scheduled reveal with a countdown page. N-43. |

### 1.3 User — the couple

| | Status | Where it stands |
|---|---|---|
| View | **Built** | Guest catalogue, player, resume, deep links, profile gate, two languages. |
| Share a film | **Built** | `ShareButton` in the title modal — `navigator.share` (the WhatsApp sheet on a phone) with a copy-link fallback, and a `?t=` deep link so "watch from 7:08" works. |
| Share a photograph | **Built** | The same `ShareButton` films use, in the lightbox. A photograph's address is the catalogue page plus `?photo=<id>`; the address bar follows the guest as they swipe and clears on close, so what they copy is what they are looking at. |
| Like a film or photograph | **Built** | A heart on both, **counted across guests and shown to all of them** (decided rather than assumed — the alternative was a private keepsake). Keyed on a device-local guest key, not a profile, because the gate can be skipped; the count is of devices that tapped, which is the honest description. |
| Own the account after handover | **Built** | Their own org and, since N-62, their own account at `/my`; the full customizer one link away. |
| Told they now own it | **Missing** | **No migration email.** The couple learns they own it only if the partner tells them. This is the single biggest hole in the commercial model — `PRICING.md` §2. |
| Renewal | **Missing** | `subStatus` drives a renewal screen for guests. There is no way to actually renew — no payment, no self-service, no reminder. |
| Credentials management | **Partial** | Supabase Auth handles password reset. No in-app profile screen, no email change. |
| Passcode management | **Built** | From `/my`, before and after the handover; changing it signs out everyone holding the old one (N-71, 12 Sept). |
| Buy and apply a theme | **Partial** | Seven themes and platform-authored ones, chosen per catalogue (N-63, 12 Sept). Nothing is *bought* yet — see §6 and doc 16 §7. |
| Hand back to the studio | **Built** | N-62, 12 Sept — as a window rather than a return: the couple opens the studio's access for seven or fourteen days from `/my`, and it closes on its own. |
| Download everything | **Missing** | **Required before any lapse behaviour ships.** Available at any time — before expiry, in grace, and from archive. `PRICING.md` §2. |
| Archive instead of deletion *(changed 6 Sept 2026)* | **Missing** | Lapse → 90 days' grace → archive (streaming paused, files kept, restore on payment). Automatic deletion is **removed from the product**; `deleted` is reachable only by a recorded request from the couple. N-24. |
| Family circles *(new)* | **Missing** | Scoped links per side, "who watched". The profile gate already identifies a guest; nothing groups them. N-38. |
| Anniversary moment *(new)* | **Missing** | A clip and a message on the date; the renewal nudge that does not read as one. N-39. |
| Cast to TV *(new)* | **Missing** | Chromecast / AirPlay from the player. N-40. |
| Subtitles *(new)* | **Missing** | AI-generated, operator-corrected, for speeches and rituals. N-41. |
| Guest uploads and guestbook *(new)* | **Missing** | Phase 5. N-45. |

---

## 2. Back end

| | Status | Where it stands |
|---|---|---|
| Platform services | **Built** | Next.js route handlers, typed errors, rate limiting, structured logging, health endpoint, two crons. |
| Authentication | **Built** | Supabase Auth behind an `AuthProvider` seam; `local` driver keeps CI and tests offline. |
| Tenant management | **Partial** | Orgs, operators, handover and `origin_org_id` all exist. No lifecycle: no suspend, no plan assignment, no deletion. |
| Storage connector | **Built** | `VideoProvider` and `PhotoProvider` seams, Bunny and fake drivers. Resumable multi-gigabyte upload, proven against a real network drop. |
| Quota management | **Partial** | Storage resolves catalogue → org → default and **is enforced at both upload paths** against real stored bytes; the console shows GB used against the plan. **Nothing writes a grant yet** — that is the payment work. |
| Renewal | **Missing** | The state machine exists and `resolveAccess` honours it. Nothing writes it, warns about it, or acts on lapse. |
| Payment | **Missing** | No gateway, no invoices, no webhook. N-20. |
| Archive and retention *(changed 6 Sept 2026)* | **Missing** | `subStatus` has `cold`; **no code acts on it.** The policy is now archive, never automatic deletion — the compounding cost is stopped by the archive fee, not by removal (`PRICING.md` §2). N-24. |
| Delivery metering | **Missing** | `getUsage` returns real stored bytes and `deliveredGb: 0`. Allowances cannot be enforced and no catalogue's cost can be attributed. |
| Email — auth | **Built** | Supabase Auth sends registration confirmation and password reset through Resend from `hello@heirloomfilms.in` (N-17). |
| Notifications *(new, 6 Sept 2026)* | **Missing** | The application itself sends nothing. Needed: a **notification seam** — email, WhatsApp Business API and SMS behind one interface with a fake driver for tests. Blocks the migration email, the delivery message, and every expiry warning. **This one blocks the most.** N-50. |
| Payments for archive and long-term archive *(new)* | **Missing** | Rows in `plans`; written by N-20. |
| In-catalogue upsell *(new)* | **Missing** | A `store` module the studio populates; commission to us. Phase 4. |

---

## 3. Storage — Supabase

**Built.** Postgres with RLS, `Repository` seam so the suite runs against an in-memory store.
8 GB on Pro against 0.16 GB used at 60 weddings — roughly 48× headroom. `SCALE-PLAN.md` §3.

Open: play events are kept forever. `retention_months` exists in migration 0006 and is unused.

---

## 4. Delivery — Bunny

**Built.** Stream for video (free transcoding, TUS resumable upload, token auth, HLS), Edge
Storage plus a pull zone for photographs. Signed, expiring, directory-scoped playback URLs.

Open: the encoding ladder must be set to 360p–720p by default before selling — at Full HD a
15-hour wedding needs 64 GB and fits no plan. `PRICING.md` §7.

---

## 5. Deployment — Vercel

**Built.** `bom1` (Mumbai), ISR on the guest page, two crons, deploy script that pushes every
environment variable first. CI runs lint, typecheck, 341 tests, dead-code, contrast, bundle and
vitals gates; 90 E2E across three Playwright projects including path mode.

Headroom: ~33× on function invocations at 10 weddings a month.

---

## 6. Skin / theme marketplace — **entirely new**

> **12 September 2026, N-63 and N-64:** the *theme* half exists — seven built in,
> platform-authored ones from `/admin/platform/themes`, chosen per catalogue in the wizard and the
> branding panel, the whole guest surface following it (D-35) — and studios save **house styles**
> on top of it (D-36). What remains open below is the *marketplace*: selling one, and third
> parties.

**Was missing, and the largest single item on this page.** The text below is kept as the
statement of the problem.

### What exists to build on

- **Templates** — three named starting layouts, each a list of module instances.
- **Branding** — accent colour, logo, display font, "presented by", applied as scoped CSS custom
  properties so a tenant's colour never repaints the console.
- **The module registry** — a page *is* an ordered list of validated module instances. That is
  already most of what a theme is.

A theme is plausibly **template + branding preset + type scale**, which the architecture supports
today. What it does not support is anything about *selling* one.

### What has to be decided before any of it is built

These are product questions, not engineering ones, and the answers change the shape:

1. **Who makes themes?** Only us, or third parties? Third-party themes mean review, versioning,
   payouts and a sandbox — a different product, and a much bigger one.
2. **What can a theme change?** Colours and fonts is a preset. Layouts is a template. **Custom
   components is a plugin system**, and that is where this stops being a weekend.
3. **Who buys — partner or couple?** You have listed it under both. They imply different things:
   a partner buys once and reuses across weddings; a couple buys for their own page.
4. **One-off or subscription?** And does a theme survive handover?
5. **What happens when a theme is updated or withdrawn** on a live wedding?

### The honest read

The first version worth building is **not a marketplace**. It is **more templates plus saved
branding presets a partner can reuse** — which needs no payment, no review process, and no
versioning, and delivers most of the value ("their weddings all look like their studio").

Sell that first. Build a marketplace when a third party asks to publish into it.

---

## 7. What blocks what

Ordered by how much it unblocks:

1. **Notifications** — blocks the migration email, the delivery message, every expiry warning,
   and therefore renewal. **Nothing else on this list matters as much.** (N-50)
2. **Payment** — blocks plan selection at creation, add-on storage, renewal, archive, and the
   Studio plan. (N-20)
3. **Delivery metering** — blocks allowance enforcement and any per-catalogue cost view.
4. **Archive transition** — what stops storage compounding now that deletion is gone.
5. **Download everything** — gates any lapse behaviour ethically.
6. **Plan capacity in the UI** — "holds about 9 hours", warn at 80%. Cheap, and the pricing
   depends on it.

The phases that take these in order are in [`ROADMAP.md`](./ROADMAP.md) §5.

---

## Keeping this current

**Update this file first, then `NEXT.md`.** The order matters: this says what the product *is*,
`NEXT.md` says what to do next, and a backlog that has drifted from the product map is how you
build the wrong thing efficiently.

On a pivot: change the affected rows, move the date at the top, and say what changed in the commit
message. Do not delete a row that turned out to be wrong — mark it, so a future session knows it
was considered.

| Related | |
|---|---|
| [`NEXT.md`](./NEXT.md) | The ordered slice of what is missing here |
| [`PRICING.md`](./PRICING.md) | What the built parts are sold for |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | How the built parts fit together |
| [`USAGE-GUIDE.md`](./USAGE-GUIDE.md) | How to use the built parts |

---

## 8. The second pass — 12 September 2026

The rows the second pass adds or changes. Specified in
[`spec/16-platform-v2.md`](./spec/16-platform-v2.md); decided as D-32 to D-41; scheduled as
N-60 to N-75 in [`NEXT.md`](./NEXT.md).

| | Status | Where it stands |
|---|---|---|
| Tenant-path addressing `/<studio>/<wedding>` | **Built** | N-60, 12 Sept. `/c/<wedding>` is an alias that redirects to the canonical address; the studio segment is frozen on the catalogue. |
| Share this wedding (WhatsApp) and the "Made with Mehfilbox" toggle | **Built** | N-60, 12 Sept. In the top bar; the footer line is on unless the studio switches it off in the branding panel. |
| One sign-in with a Studio door and a Couple door | **Built** | N-61, 12 Sept. `/login`; `/admin/login` redirects. The door is a tab, the landing is decided by the org. |
| Forgot password, on both doors | **Built** | N-61, 12 Sept. Credential links, hashed and single-use, identical on both auth drivers. |
| Per-address lockout and a captcha seam | **Built** | N-61, 12 Sept. Per-address and per-IP buckets, a per-catalogue bucket on the guest code, Turnstile behind `CAPTCHA_DRIVER`. |
| Studio issues the couple's credentials at creation | **Built** | N-62, 12 Sept. From the overview: a link to choose a password, or a temporary one shown once. |
| Couple account with many catalogues, from many studios | **Built** | N-62, 12 Sept. An address with an account is linked, never duplicated. |
| Couple console `/my` | **Built** | N-62, 12 Sept. Link, share, download, guest code; letter, sections and the studio window once theirs. |
| Studio support window after handover | **Built** | N-62, 12 Sept. Seven or fourteen days, opened by the couple, closing on its own. |
| Delivered view — every originated catalogue with its renewal date | **Built** | N-74 with N-62, 12 Sept. On the console's list page. |
| Themes — seven built in, chosen per catalogue | **Built** | N-63, 12 Sept. Wizard step 2 and the branding panel; the whole guest surface, the preview's frame and the generated posters follow it. |
| Platform-authored themes | **Built** | N-63, 12 Sept. `/admin/platform/themes` — gated on the same contrast pairs, withdrawable without repainting a wedding. |
| House styles — saved presets, frozen while in use | **Built** | N-64, 12 Sept. `/admin/studio/styles`; captured from a delivered wedding or typed in; the wizard offers them; a style a published wedding was made from is frozen, with *Duplicate and edit*. |
| Start from blank | **Built** | N-64, 12 Sept. A fourth layout, in the wizard and in a style. |
| First publish free, second on a credit | **Built** | N-65, 12 Sept. `credits` table; registration grants one; the first publish spends one; refusal is a panel with *Ask for a credit* until Razorpay (N-20). |
| Platform console: create a studio, credits, password links, all catalogues, extend a term | **Built** | N-66, 12 Sept. Dashboard, studios (create one), couples, every catalogue (term, offline), themes, audit. The term left the studio's settings. |
| Platform health page | **Built** | N-67, 12 Sept. `/admin/platform/health`: ten rows probed live — database, Bunny Stream and Storage, the CDN, Resend, the queue, the pipeline, every job's last run (`job_runs`), the synthetic walk. `/api/health` stays shallow for monitors. |
| Custom domains with generated instructions and verification | **Built** | N-68, 12 Sept. A studio's (`films.studio.in/<wedding>`) or a couple's (one wedding at the root); records generated from what was typed with copy buttons and registrar hints; *Check DNS* from the server; attached through `DOMAIN_DRIVER` or by hand from the platform; the mehfilbox path 301s to it. |
| Five-step wizard with the couple in the room | **Built** | N-69, 12 Sept. The couple (with occasion) → the look (style, or theme and layout) → guests and the couple (code, language, time zone, premiere, the couple's sign-in) → upload → titles. |
| Every console surface at 360px | **Partial** | Guest surface yes; consoles unaudited. N-70. |
| Premiere date with a countdown | **Built** | N-72, 12 Sept. Set in the couple's zone in the wizard or settings; the link shows a countdown until then and opens into the wedding after. |
| Couple-created catalogues from `/my` | **Built** | N-73, 12 Sept. *Start a catalogue of your own* opens the same wizard in its couple shape — occasion first (baby shower and naming day added), no house styles, no sign-in card. A draft until a credit is added by the studio or us. |
