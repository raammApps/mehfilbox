# NEXT — the ordered backlog

[`PRODUCT.md`](./PRODUCT.md) is **what the product is**, surface by surface — update that first
when something changes. `PROGRESS.md` records what was built and why. **This file records what is
left, in the order it should be taken up.** Read CLAUDE.md → PROGRESS.md → this file; that is a ~8k-token cold start.

Ordering rule: unretired risk first, then things that would embarrass us in front of a planner,
then debt. Within a tier, cheapest first.

**6 September 2026:** [`ROADMAP.md`](./ROADMAP.md) groups this backlog into phases and adds
N-34 to N-50 from the competitor and feature review. Phase 1 is Tier 2 below, in this order:
held items → N-21 → N-22 → N-23 → N-29 → N-36 → N-24a → real footage → N-51.
**N-34 and N-35 were already built** on 6–7 September, before this patch was applied — photograph
sharing, captions, likes and one save indicator across the console. See PROGRESS.

Update this file as items land — move them out, do not leave them ticked.

---

**17 September 2026:** the review Sandeep asked for on 15 September is in
[`15-sep-finding/`](./15-sep-finding/00-README.md). It proposes decisions D-45 to D-53 and tickets
N-89 to N-111 (`06-what-changes-next.md`), none of which is applied to this file until he decides.
Same day, his follow-on message decided six more (D-54 to D-59, Tier 1d below) rather than
proposing them — a paid registration for both studios and direct clients, quota from the org's
plan, a theme store split between studios and clients, a payment-gateway seam (built), and a
redesign direction (not yet buildable — see N-116). N-89's list-gate half is fixed; its
playback-gate half is still open, above in Tier 1b.

## Where things stand, in one paragraph

Phase 0 is built and deployed: guest catalogue, player, admin console, customizer, the module
registry, and the partner/handover model. All six doc 10 §2 journeys run, plus an OG size budget,
a first-load JS budget and a zero-axe-violations gate. The second pass of 12 September (doc 16)
is built on top of it: the tenant path, two sign-in doors, couple accounts, themes and house
styles, credits, the platform console with health, custom domains, the five-step wizard and the
premiere, all deployed to production on 12 September. **659 unit and component tests; 156 E2E
passing, 56 skipped by design.**

**Live on `https://mehfilbox.com`** (`heirloomfilms.in` redirects) with `DATA_DRIVER=supabase` +
`VIDEO_DRIVER=bunny`: an
operator signs in against real Postgres, and create → publish → guest page works. Registration
sends a confirmation through Resend and the link resolves back to the domain — verified by reading
the delivered message, not by trusting the dashboards. `pnpm verify:upload` proves a real TUS
upload survives a network drop. Local development stays on `file` + `bunny` so the demo catalogue
is available. Branch is `main`.

Two things worth knowing before trusting any status here, both found by looking at production
rather than at tests: the Supabase driver **never wrote `size_bytes`**, so every catalogue reported
0 GB and the storage cap had never refused an upload; and the E2E suite's intermittent failures
were three parallel projects sharing one store, not the code they pointed at. Both fixed.

Run `pnpm preflight` first in any new session: it reports the real state of both services in a
few seconds and is more trustworthy than this paragraph.

---

## Tier 1 — the second pass (12 September 2026) · `docs/spec/16-platform-v2.md`

**Landed, all of it, on 12 September.** N-60 to N-75 — the tenant path, two doors and credential
links, couple accounts, themes, house styles, credits and the trial, the platform console, health,
custom domains, the five-step wizard, the premiere, a catalogue of the couple's own, the consoles
at 360px — each with its entry in `PROGRESS.md` and its rows in `PRODUCT.md` §8. The decisions are
D-32 to D-41. Nothing from the list is deferred; what the spec left open is listed under Tier 2
where it belongs (Razorpay for credits, N-20; the ops account, N-53b).

## Tier 1b — unretired risk

### N-89 · Close the publish gate on the two paths that leaked  ·  **done, 18 September 2026**  ·  **security**

The photo bug's twin, same driver, same class. `listTitles({ publishedOnly })` on the Supabase
driver gated on `published` — the operator's intent — instead of `live_at` — whether a Publish
actually carried a film to guests — so a ticked-but-never-published film was already on the guest
list read. **Part (a), the list gate, fixed 17 September 2026**
(`lib/db/supabase-repository.ts`, matching the memory driver's `live_at`-only predicate since
N-57; pinned by `tests/unit/supabase-query-shape.test.ts`).

**Part (b), the playback gate, fixed 18 September 2026.** `app/api/playback/token/route.ts`
refused a title on `!title.published` alone and never read `live_at`, so a ticked-but-unpublished
film could mint a working, TTL'd playback URL to anyone who knew its slug — and a slug is frozen
to the upload filename forever (N-84), so it is guessable from a forwarded file. The decision the
half-day was scoped for: the customizer's own preview calls this same endpoint for real, with no
`preview`-mode check anywhere in `TitleModal.tsx`'s manifest prefetch, and that is deliberate — it
is what wins the sub-1.5s playback target once a guest actually presses Play. So the fix reads
`live_at` for a guest and falls back to `getOperatorSession()` — the org that owns the catalogue,
not merely any session — only when that first, cheap check has already failed, which costs a real
guest on a live film nothing extra. The un-ticked case stays refused to the owner too; encoding
status (`TITLE_NOT_READY`) stayed a wholly separate check throughout, exactly as before. 4 new
unit tests, including cross-org refusal.

---

## Tier 1c — the gaps of 13 September 2026

Sandeep's brainstorm, each item checked against the codebase and against production before it was
written down. **Four of the twelve turned out to exist already**; they are answered in
[`PRODUCT.md`](./PRODUCT.md) §9 rather than ticketed. The rest are below, risk first — the first
three came out of the security pass and two of them were verified live, not inferred.

Three decisions are Sandeep's to make before their tickets can be taken up; each is marked.

### N-79 · Buying storage  ·  **interim step done, 18 September 2026**  ·  the checkout itself **blocked by N-20**

`PRICING-MODEL.md` §3 prices the add-on — ₹25/GB per month, co-terminus with the plan, small
top-ups cheap and big ones pushed to the next tier. What does not exist is a way for a client to
*buy* it, which is N-20's checkout — still blocked, still open.

**The interim step: done.** The shape credits already had — an **Ask for more space** button
where the refusal is actually shown (the overview's storage-full warning, not the 80% one, which
still has room) — posts to `POST /api/admin/storage/request`, which emails `SUPPORT_EMAIL` with
the studio, the wedding, and what is used against what is held, once per catalogue per day. Per
D-60, this targets the **catalogue's** own grant, not the org's: the email links to the platform's
new per-catalogue quota control (`/admin/platform/catalogues/:id`, mirroring the org one from
N-27b one level down, `setCatalogueStorageQuota`), so a studio's other weddings are never touched
by granting this one more room.

### N-81 · Measure the limits  ·  ~2h  ·  **after three real weddings**

`SCALE-PLAN.md` §3 already answers the question as far as reasoning can: the binding constraint is
Vercel function invocations at roughly 333 weddings a month, Supabase's 8 GB holds ~2,900 weddings,
Bunny has no ceiling, and 300 guests on one link mostly hit the edge cache because the guest page is
ISR. Concurrent viewers are bounded by Bunny, not by us — video never touches the application.
**Every number in that table is reasoned, not measured**, and the document says so.

What closes it: read the Vercel dashboard after three or four real weddings and correct §3; run one
load test of the guest page and `/api/playback/token` at 300 concurrent from a phone-shaped client;
and note the two limits the code has none of — there is no cap on catalogues per studio or on
studios, only on storage, which is deliberate and should be written down as such.

### N-82 · The cost line  ·  ~2h  ·  **with N-25b**

`SCALE-PLAN.md` §1 costs 60 weddings at ₹55,474 of infrastructure over six months against
₹3,30,000 of revenue — 83% gross margin — and names the thing that will actually hurt: storage that
is never deleted. That is a model. What is missing is the bill: a line on the platform dashboard
that reads live GB from the Bunny statistics API × the storage rate, delivery GB × the delivery
rate, plus the two fixed subscriptions, and shows this month's cost next to this month's credits.
N-25b reconciles the per-catalogue estimate against the same bill; build them together.

---

## Decisions Sandeep owns, from the same list

- **Should studio signup need approval?** Registration is public (`/admin/register`, linked from
  the login form, captcha-ready, three per IP per hour, one credit granted). D-39 chose *suspend
  after* over *approve before*, and the platform console can also create a studio directly. An
  approval queue is ~2h if wanted; it costs every honest studio a wait.
- **Plan tiers** (N-80) — decided, D-60. The remaining open figure is the tiers' actual prices,
  needed before the wizard's tier step can show them, not before the rest of the build.
- **Turning 4K on, platform-wide.** Raised 18 September, setting up staging: `PRICING.md` §1
  already sells Keep and Cinema with a 4K minute allowance (20 / 90 min), priced against Bunny's
  premium encoding at $0.15/min — but nothing enables premium encoding anywhere. Every library,
  including production's, is on standard encoding only (1080p, no extra cost), so a Keep or
  Cinema catalogue's "4K included" is a price list promise with no lever behind it today. Needs a
  decision on the mechanism before it is buildable: premium encoding is a **per-library** Bunny
  setting, not per-video, so either every studio's library carries the $0.15/min cost structure
  (and the allowance is enforced entirely in the app), or 4K-eligible catalogues need routing to
  a *second* library that has it turned on — a bigger architectural change than a checkbox.

---

## Tier 1d — the monetization decisions of 17 September 2026

Sandeep's follow-on to the 15 September review, decided rather than proposed: D-54 to D-59 in
`docs/reference/00-decision-log.md`. N-89(a) above is the one urgent item that came out of the same
message; the rest is real scope and is sequenced here, cheapest and most foundational first.

### N-112 · A PaymentProvider seam  ·  **done, 17 September**  ·  D-58

`lib/payments/` (interface, a `fake` driver, `PAYMENT_DRIVER` in `lib/env.ts`), matching
`VideoProvider`/`DomainProvider` exactly: `createPayment` starts a charge, `verifyWebhook` confirms
one from a raw signed body, `none` is the state production is in today. No real gateway is
implemented — Razorpay, Cashfree and PhonePe are all still options — so `getPaymentProvider()`
throws on any driver name that has no class yet, rather than silently granting nothing while a
deploy believes it is charging someone. 5 new unit tests.

### N-113 · Paid registration, both doors  ·  ~1 session  ·  **needs N-20/a chosen gateway**  ·  D-55, D-56

The identity fields (business or individual name, logo, a contact photo, email, address, mobile,
PAN), the configurable fee (`platform_settings` or an env value — no config store exists yet,
build the smaller of the two), and the 2-credit/100 GB grant on confirmed payment. Registration
already lets an unpaid account build a whole wedding before meeting `CREDIT_REQUIRED` at Publish
(`app/api/admin/catalogues/[id]/publish/route.ts`); this ticket removes the free registration
credit (`grantRegistrationCredit`, D-38) and replaces it with a payment that grants the same shape
of thing. The direct-client variant is the identical flow on `orgKind = 'couple'` — build once.
Blocked on N-112's `none` becoming a real driver, which is blocked on the business bank account
(`docs/15-sep-finding/04-startup-india.md`).

### N-114 · Storage quota from the org's plan  ·  ~2h now, more with N-80  ·  D-54

`resolveLimits`'s per-org override (`lib/entitlements.ts:84-87`) already wins over the flat 20 GB
default — this ticket is mostly naming that the override is the mechanism, tightening
`OrgQuotaControl`'s copy so it reads as "this org's plan" rather than "an exception," and writing
the override automatically at the point a paid registration (N-113) or a plan purchase (N-80)
happens, instead of a platform admin typing a number in by hand.

### N-115 · The theme store  ·  **studio half done, 18 September 2026**  ·  client half **blocked on N-113**  ·  D-57

Two halves, buildable separately. **Studio half: done.** House styles' `duplicateOf`
(`app/api/admin/presets/route.ts`, N-64) now accepts a theme id as well as a preset id —
`/admin/studio/styles` offers every enabled theme with a **Duplicate as a house style** button, so
"make a copy, edit, save as new" works from a theme exactly the way it already worked from a saved
style. No new schema, matching the ticket's own constraint: a theme has no `presentedBy`/`logoUrl`
of its own, so those still seed from the studio's own branding, the same as a blank "New house
style" already does.

**Client half — still open.** A `tier` column on `themes`
(`supabase/migrations/0019_themes.sql` has none today), a catalogue-scoped entitlement write (the
seam `lib/entitlements.ts` was built to support and nothing has ever used, per `map-commerce.md`
§7), a "locked until bought" state in the customizer picker, and the purchase itself, which is
N-113/N-112's payment flow. Basic five free; everything past that priced and gated.

### N-116 · The redesign, once it can actually be looked at  ·  **blocked on real reference material**  ·  D-59

The direction is recorded in D-59; the design itself is not. Three of the four reference URLs
returned unrendered lazy-loaded placeholders, checked by screenshot; the fourth (saasinterface.com)
rendered and gave one real data point — a dark hero, serif display type over sans body text, a
gradient pill CTA, a card-grid gallery — not a survey. Two ways to unblock: retry the fetch with a longer render wait or a different capture
path, or Sandeep sends screenshots directly. Either way, do the marketing site
(`app/page.tsx`, one file, no auth surface at risk) before the three admin consoles — it is the
cheapest place to prove the direction looks right on the existing token system before touching
`components/admin/` (13,326 lines) or the guest-dark token set, which nothing here asks to change.

---

## Tier 2 — before a planner sees it

### N-53b · The observability that needs an account  ·  ~2h  ·  **D-24**

Two of N-53's four parts landed on 8 September: an alert when the transcode webhook stops arriving,
and a synthetic check that walks a guest's path to a playable film. Both are free and both catch
faults we have actually had. Two parts remain, and both want a third-party service:

- **Logs that survive the invocation.** `lib/log.ts` writes structured JSON to stdout, which Vercel
  keeps briefly and does not make queryable when it matters. A drain — Axiom, Better Stack, Datadog
  — is the fix, and all of them cost money or a free tier with a retention cliff.
- **Error tracking with a release marker.** `lib/observability.ts` is already a seam
  (`setErrorSink`), built so a vendor is one file. The alert email carries the deploy SHA today,
  which answers the first question of an investigation but does not group or count anything.

Take this when there is revenue, or when a fault costs more than the subscription. Until then the
alerts land in a mailbox, and that is the difference between "a partner told us" and "we knew".

### N-117 · A browser-driven synthetic check against production  ·  ~2h  ·  **the other half of N-90**

N-90 (closed 18 September) gave the E2E suite a real `.m3u8` fixture, so `hls.js`/`MediaSource`/
`blob:` are now genuinely exercised before a deploy ships. What it cannot do is catch a mistake
*in* a deploy that already shipped — the existing synthetic check (N-53b, `app/api/cron/synthetic/
route.ts`) only asks whether the token endpoint resolves, the same shape of check that stayed
green through the whole N-86 CSP outage. A scheduled Playwright run against the live site —
navigate, press play, assert `readyState >= 2` and `currentTime` advances — is the only thing that
would have caught that specific outage within minutes rather than by a person happening to press
play. Low urgency while a human is watching every deploy closely; worth it the moment that stops
being true.

`staging.mehfilbox.com` is live now (N-87, closed 18 September) — a real target to point a
`--base-url` Playwright run at, without touching production. The suite would still need writing
against it rather than the hermetic local fixtures (no known demo catalogue, no fixed password,
real Bunny rather than `fake`), the gap N-87 named without building.

### N-54 · Claim a notification row before sending it  ·  ~1h  ·  **paused, 7 September**

`drain` reads, sends, then marks, so two overlapping runs would both see the same `queued` rows and
send twice. Sequential repeats are already safe, and the GitHub Actions schedule serialises itself
with a `concurrency` group — so the remaining exposure is a second *caller*: a `workflow_dispatch`
fired by hand while a scheduled run is in flight, or the Vercel cron restored on Pro alongside a
workflow nobody deleted.

The fix is a `sending` status written before the provider call, so a concurrent drain's
`listQueuedNotifications` does not see the row. It needs a migration — 0009's constraint is
`check (status in ('queued','sent','failed'))` — plus a way back for rows stranded in `sending` by
a crash, which is what makes this an hour rather than ten minutes: a row stuck mid-send is a
message nobody will ever receive, and that is the failure this must not introduce while fixing a
rarer one.

**Do it before the Vercel Pro move**, when the cron entry returns to `vercel.json` and two
schedulers exist for however long it takes to delete the workflow.

### N-21c · The "call them" prompt for Cinema renewals  ·  ~1h  ·  **needs N-27b**

doc 15 asks for a prompt to phone rather than email when the renewal is a Cinema catalogue's
₹4,000. The banner exists (N-21b, 8 September); what does not is any way to know a catalogue *is*
Cinema — `entitlements.planId` is there, and nothing assigns it. Build it after N-27b puts plan
assignment in the platform console, or it is a prompt keyed on a plan nobody has.

### N-22b · A per-film download from the title modal  ·  ~1h

`/c/<slug>/download` lists everything (N-22, 8 September). What is missing is the small case: a
guest watching one film who wants that one film, without a trip to a page listing forty
photographs. `getDownloadUrl` already exists on the provider — this is a control in the title modal
and a route that signs one asset.

Worth doing when there is real footage to try it against: the interesting part is what a 6 GB file
does on a phone, and that cannot be learned from a 750 KB sample.

### N-24a · The encoding ladder  ·  ~1h  ·  operator task

Set the Bunny library to 360p–720p by default; confirm Keep Original Files and MP4 Fallback are
off. Then upload one real 15-hour wedding and correct `PRICING.md` §1 with the measured GB.
Without this nothing on the price list holds a wedding.

### N-36c · Send it on WhatsApp for real  ·  ~2h  ·  **needs the MSG91 driver**

N-36 landed the email and a `wa.me` link that opens the studio's own WhatsApp with the message
written. That link is honest — it composes, it does not send — but it means nothing is recorded and
the studio has to be at a device with WhatsApp on it.

The real thing is one `msg91` driver behind `NotificationProvider`, which `drain` already skips
cleanly for `whatsapp` rows (D-12). Blocked on the ₹500/month subscription and on Meta's template
approval, not on code.

### N-24b · Renewal, and what restores a cold catalogue  ·  doc 15  ·  **blocked by N-20**

The ladder moves on its own now (N-24, 8 September): a term ends → 90 days' grace → cold, never
silently and never to `deleted`. What is left all needs money to change hands:

- **The renewal path.** Nothing writes `active`, because nothing takes a payment (N-20).
- **The restore-on-payment screen** a cold catalogue's guests should see instead of the current
  renewal screen — the difference between them is a paid button.
- **The `studio_gone` predicate** (D-26), which is only interesting when a couple can act on it:
  it exists to let them pay *us* directly. Computed rather than stored, and logged when it unlocks
  a purchase.
- **Twelve months of archive at our cost after grace**, then the fee — a billing rule with no
  billing to attach to.

Do not build the predicate before the checkout. On its own it is a boolean nobody can act on, and
`PRICING.md` §2 is explicit that it needs an audit trail rather than a flag.

### N-25b · Reconcile the delivery estimate against the bill  ·  ~2h  ·  **after real traffic**

N-25 attributes delivery per catalogue by deriving it from watch time (8 September), because Bunny
reports no per-video bandwidth. The derivation is only as good as `PRICING.md` §1's bitrate, which
is itself an estimate until N-24a measures a real wedding.

What closes the loop: Bunny's **pull zone** statistics give the true total bandwidth for the
library. Summing every catalogue's derived figure for a month and comparing it to that total says
how wrong the multiplier is, in one number — and `usage_rollup.watch_seconds` means the whole
history can be recomputed once it is corrected rather than left wrong.

Needs traffic to be worth running. Today every chart reads zero.

### N-36b · The credit that survives  ·  ~half a session  ·  **Phase 3**

`presentedBy` is an editable field snapshotted at handover. Make it a promise: a "Filmed by"
credit rendered from `origin_org_id`, not from branding, that the couple cannot edit, plus an
enquiry link ("Get your wedding on Mehfilbox") routed to the originating studio, which the couple
can hide but not redirect. Both survive every renewal. This is what the studio gets instead of a
share of renewals (`PRICING.md` §2).

### N-37 · Delivery tracking and the lapse dashboard  ·  ~1 session  ·  **Phase 2** (moved)

> **Moved from Phase 3 by D-26.** Under studio-only the studio *is* the renewal mechanism, so a
> list of every catalogue they originated with its end date — and one-click renew on behalf — is
> not reporting, it is the collection channel. Without it, renewals depend on a studio remembering
> a date three years after a wedding.

Play events exist and nothing reads them per catalogue. Show the studio: opened (first profile
gate pass), watch-time per film, "not opened in 7 days". Then a partner-level view of every
catalogue they originated with its renewal date and status, and *renew on their behalf* (N-20).

### N-38 · Family circles  ·  ~1 session  ·  **Phase 3**

Scoped links per side (bride, groom, "just the highlights"), each a profile-gate group; "who
watched" for the couple. `module_state` and the gate already hold per-guest identity.

### N-39 · Anniversary moment  ·  ~2h  ·  **Phase 3**

On the wedding date each year: a message with a deep link into the highlights film. It is the
renewal nudge that does not read as one.

### Phase 4 and 5, one line each — sized when they are reached

N-40 cast to TV (Chromecast / AirPlay) · N-41 subtitles, AI-generated and operator-corrected ·
N-42 hand back to the studio · N-43 client premiere with countdown · N-44 custom domain served
and verified automatically · N-48 DPDP consent and deletion-on-request · R8 the `store` module
and commission · N-45 guest uploads and guestbook · N-46 studio portfolio page · N-47 draft
feedback · N-49 API and webhooks.

### N-26b · A second saved look, if a studio asks for one  ·  ~half a session

A studio now has **one** studio-wide look, set once and inherited by every new wedding (N-26,
8 September). `PRODUCT.md` §6's presets are the plural of that: a named set a studio picks between
— a house style and a destination-wedding style, say.

Two things worth having with it, and neither is worth having alone: **apply a preset to an existing
wedding** from the customizer (the draft, so it reaches the couple at Publish), and a preview
thumbnail so choosing one is not a guess.

Build it when a studio asks for a second look. Until then it is a list with one item in it.

### N-27c · Plans, once anything reads one  ·  doc 15 §1  ·  **blocked by N-20/N-24**

The storage quota landed on 8 September (N-27b). **Assigning a *plan* deliberately did not**, and
the reason is worth keeping: `plans` has no rows, nothing anywhere reads `entitlements.plan_id`,
and `resolveLimits` consumes `storage_gb` alone. A console that assigned a plan would write a
foreign key nobody consults — furniture that looks like a feature, and the most convincing kind of
broken, because the console would show it and everyone would believe it.

A plan becomes real when something enforces one: **credits** (N-20's checkout decrements them),
**retention** (N-24's archive transition reads it), or **price** (an invoice quotes it). Build this
after whichever of those lands first, and seed `plans` from `PRICING.md` in the same change so the
rows and the reader arrive together.

`max_titles` and `max_photos` are in the same position — columns nothing reads. They were caps
before storage replaced them (`lib/schema.ts` says so), and they should probably be dropped rather
than wired up.

### N-20 · Razorpay  ·  doc 15 §4  ·  **Phase 2**

Two flows that should not share a code path: partners buy catalogue credits in advance, couples
pay renewal, archive, long-term archive and storage after the included months — **and nothing is
billed to a couple inside twelve months of delivery** (`PRICING.md`, "Who is billed when"). The
`plans` rows for Deliver, Keep, Cinema, archive (₹999 / ₹1,499), the Studio plan with its three
included credits, and the Deliver → Keep upgrade (`ROADMAP.md` §3) land here. The subscription state machine already exists
and `resolveAccess` honours it — what is missing is only the thing that *writes* it. Verify the
webhook the way the Bunny one is verified, and assume it gets lost, because that lesson is
already paid for.

The entitlement tables and the resolver now exist (N-19); what is missing is the thing that
*writes* a row. `plans` is empty on purpose — the price list is a business decision, not a
migration.

### N-14 · Real footage  ·  operator task  ·  **half answered**

Two real catalogues exist. `sample-swarit-and-smriti-2026` was reviewed on a 375px viewport
against real material, and **the first question is now answered: it reads as a streaming product.**
The billboard photograph carries the scrim, text stays legible over it, and a row of real frames
looks like a service rather than a template. That was the largest unknown and it is closed.

**Still open, and it needs different material:** what a finished hour actually costs in storage,
and whether the card treatment and row gradients hold against 200–300 DSLR frames. The catalogue
holds two ~40-second vertical clips and 11 photographs, which cannot answer either.

Both things the review turned up are fixed (see PROGRESS): the storage column the driver never
wrote, and the row that held a single film. Existing rows still need `pnpm backfill:sizes --write`;
new uploads record their size.
Three things that looked like bugs and were not, recorded so they are not re-investigated:

- The `1m` badge on a 35-second clip is deliberate — `formatDurationBadge` rounds to whole minutes
  so `4:07` does not imply a precision the number does not have.
- A letter module that appeared to be an empty card was its sign-off.
- **"Presented by san-test-studio" is correct.** `branding.presentedBy` is an operator-editable
  field in the customizer, seeded from the business name at registration — so it shows whatever
  was typed there, and a slug-looking value means a slug-looking business name. Not a fallback,
  not a bug.

### N-11 · Domain  ·  **live** — one item left, see [`GO-LIVE.md`](./GO-LIVE.md) §4

`https://heirloomfilms.in` serves the product: DNS points at both Vercel addresses, the
certificate issued, `ROOT_DOMAIN` is switched and redeployed, health reports `supabase` + `bunny`,
and push-to-deploy works again now the repo is public.

Nameservers stayed with Hostinger and the MX records are untouched, so existing mail is intact —
that is why `path` mode rather than `subdomain` is the right call for this domain.

**Left:** the Bunny library's `WebhookUrl` still points at the old URL. It needs Bunny's *account*
API key, which this repo deliberately does not hold, so it is a dashboard change.

> It has not broken, because `marquee-film-pub.vercel.app` is still attached and still serving the
> current build — luck rather than design. The alias list already holds several `marquee-film-*`
> names pinned to deployments days old. The webhook must point at the **stable domain**, never at
> a per-deployment URL, precisely because such a URL keeps answering after the next deploy from
> the *old* build: a webhook that appears healthy while running superseded code.

`pnpm preflight` and an end-to-end playback check against the new domain are **not yet run**.

### N-6 · The demo catalogue needs real footage  ·  doc 13 §8 — **not to be delegated**

The fixture uses generated gradients. That proves the mechanics and would misrepresent the
product to a planner, who judges it on whether the films feel real. Needs real, cleared,
permission-granted material. Sandeep's, per doc 13 §8.

---

## Tier 3 — debt, in the order it will start hurting

## Held by Sandeep, not by an agent (doc 13 §8)

**The Resend API key is invalid, and registration is broken because of it.** Found on 11 September
by trying to register a studio through the live site: Supabase answers
`"Error sending confirmation email"`, and `/admin/register` turns that into *"Try a different email
address"* — so a real studio is told their own address is the problem. The same key is
`NOTIFY_DRIVER=resend`, so every handover, delivery, expiry, grace, archive and ops-alert email
would fail too. It worked on 7 September; it has been revoked or rotated since. Issue a new key and
put it in **both** `.env.vercel.local` (then deploy) **and** Supabase's SMTP settings — they are
separate, and both are needed. `docs/MANUAL-TEST.md` §0 has the verification command.

> 13 September: the key in `.env.vercel.local` answers Resend's `/domains` with `400`, which is
> what a *restricted, sending-only* key returns — an invalid key returns `401`. So this may already
> be fixed and the paragraph stale; the only honest check is §0's, which sends a message.

~~**Insert yourself into `platform_admins`.**~~ **Done, 12 September** — `pnpm platform:admin`
created the account and the row together, and the sign-in route reads the row since N-76. The
console is reachable; the password is in `.env.platform.local`.

**No migration is outstanding.** `0008_likes.sql` was applied on 7 September with RLS enabled, and
verified end to end against production: a like round-trips, a second guest key sees the count and
not as their own, and the anon key is refused both read and write. `0006_entitlements.sql` was
already applied — checked against the live database rather than assumed, because this file had
claimed otherwise.

<!-- Historic, kept because the reasoning still applies to any unapplied migration: -->
**`0006_entitlements.sql`** creates `plans` and `entitlements`. Until it
is applied the Supabase driver logs a warning and resolves every catalogue to the default caps —
deliberately the *low* answer, so nothing is over-granted while the table is missing, but also
means no upgrade can take effect.

**Rotate the admin password.** `pnpm rotate:password` writes a new one to `.env.operator.local`
(gitignored, never printed) and prints the SQL. Run that `update operators …` in the Supabase SQL
editor, sign in, then delete the file. Production now refuses to boot on the repo's published
default, so this cannot quietly stay unrotated.

~~**Rotate the Supabase secret key.**~~ **Done, 7 September.** The new-format `sb_secret_…` keys
can exist side by side, so it was a rolling swap with no downtime: create, move `.env.local` and
`.env.vercel.local` over, deploy, verify, then revoke. Verified in that order rather than assumed
— the old key now returns `401`, the new one reads every table, and a guest catalogue still
renders its title out of Postgres, which is what proves the *deployment* uses it and not just the
shell.

The step that must not be skipped is the deploy: Vercel bakes environment variables into a
deployment, so pushing a variable without deploying leaves production on the old value. That
happened here — the first attempt pushed 25 variables and then died on an unrelated cron error,
leaving the rotation half-applied for several minutes.

~~**Rotate the Bunny account API key.**~~ **Done, 7 September** — and verified rather than
assumed: the new key answers the account API and the old one returns `401`. Bunny lets you
regenerate without invalidating, so the revocation is the half worth checking.

**Real footage** (N-14), which is the one thing no agent can do for this product.

## Facts a new session will want

- **Credentials** live in `.env.local` (gitignored, verified). Both services are fully
  configured; `pnpm preflight` is all green.
- **Supabase**: schema applied through `0025_occasions.sql` (12 September). Six orgs exist, and the operator
  rows are, read from the database on 7 September rather than remembered:

  | org | operator |
  |---|---|
  | `smtp-test-studio` | `hello@heirloomfilms.in` — an address on the retired domain |
  | `teststudio` | `sandeep.bh5+1@gmail.com` |
  | `swarit-and-smriti` | `sandeep.bh5+2@gmail.com` |
  | `san-test-studio` | `sandeep.bh5@gmail.com` |
  | `kalyanam` | **none — the org cannot be signed into** |

  `kalyanam` lost its operators when three auth users were deleted carelessly; `on delete cascade`
  took the `operators` rows with them. Its catalogues and films are intact, so recovering it means
  creating an auth user and inserting an `operators` row pointing at it — not restoring content.
  This document previously claimed the login was `operator@heirloomfilms.test` /
  `heirloomfilms-dev`, which was wrong in both halves: that row has never existed in the real
  database, and those are the *dev seed* defaults, which are now `operator@mehfilbox.test` /
  `mehfilbox-dev` and only ever seed the memory and file drivers.
- **The real database has no demo catalogue.** The nine-title fixture only exists in the
  `memory`/`file` drivers. Seeding a real one properly is N-6 (it needs real footage).
- **Bunny**: library `heirloomfilms` id `724076`, pull zone `6300168`, CDN `vz-98fb153e-d39.b-cdn.net`.
  Token auth **on**, IP pinning **off**, `BlockNoneReferrer` **off** — all three deliberate, see
  PROGRESS.
- **The account key and the library key are different.** `BUNNY_API_KEY` is the library key
  (Stream endpoints); `BUNNY_ACCOUNT_API_KEY` manages libraries. A 401 looks identical either way.
- **Playback tokens sign the directory `/{guid}/`, not the manifest.** Signing the file 403s
  every rendition and segment. `pnpm verify:playback` guards this; do not "simplify" it.
- **An interrupted upload is not a failed one.** `UploadManager` marks it `interrupted` and
  resumes on the `online` event; tus's default retry policy gives up on a bare network error,
  so `onShouldRetry` is set explicitly. `pnpm verify:upload` guards this against real Bunny.
- Commands: `pnpm preflight` · `pnpm verify` · `pnpm test:e2e` · `pnpm test:integration` ·
  `pnpm verify:playback` · `pnpm verify:upload` · `pnpm check:bundle` · `pnpm check:vitals` ·
  `pnpm bootstrap:sql`.

## Picking up an item

```
Read CLAUDE.md, docs/PROGRESS.md and docs/NEXT.md. Do not read any other documentation
unless the item names it.

Run `pnpm preflight` to see the real state of the external services.

Implement <N-nn> from docs/NEXT.md. Only that item.

When its acceptance criteria are met:
1. pnpm verify
2. Commit with a message that says what changed and why
3. Move <N-nn> out of docs/NEXT.md and append to docs/PROGRESS.md
4. Stop.
```
