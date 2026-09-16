# What Changes Next

Related: [00-README.md](00-README.md) for how this set of documents fits together,
[01-master-project.md](01-master-project.md) for what Mehfilbox is today,
[02-codebase-assessment.md](02-codebase-assessment.md) for the 49 confirmed findings this document
turns into tickets, [03-port-and-build-vs-buy.md](03-port-and-build-vs-buy.md) for the two
architecture decisions, [04-startup-india.md](04-startup-india.md) for the company and grant
research behind §4, [05-market-and-differentiation.md](05-market-and-differentiation.md) for the
go-to-market case behind §1's D-49 to D-51, and
[07-evidence-and-provenance.md](07-evidence-and-provenance.md) for the judges' scorecards, the
reconciled finding counts and the list of what this research could not establish.

This document does not repeat any of those five — it draws the line from each of them to the two
files Sandeep actually acts on: `docs/reference/00-decision-log.md` and `docs/NEXT.md`. It proposes
changes to both. It edits neither. Every decision and ticket below is a proposal for Sandeep to
accept, amend or reject.

**Numbering.** The decision log's last entry is D-44 ("Plan tiers by storage — proposed, not
decided," 13 September 2026); decisions below start at **D-45**. `docs/NEXT.md`'s last ticket is
N-88; tickets below start at **N-89**. One thing worth fixing while either file is next touched:
the decision log currently carries two unrelated decisions both labelled D-32 — line 539 ("The
console stays English," 8 Sept) and line 562 ("The tenant is in the path," 12 Sept). Rename the
second one **D-32b** in place; do not renumber anything after it, since `docs/NEXT.md:54` already
cites "D-32 to D-41" as a range.

**Where this evidence is asymmetric — three tiers, not one.** D-45 (backend language) rests on
three independent written positions scored by **two** independent adversarial judges who reached
the same verdict by different reasoning (`port-judge-1.json`, `port-judge-2.json`) — the strongest
evidence in this document. D-47 (video hosting) rests on two positions and **one** judge
(`transcode-judge.json`) — still a scored, adversarial contest, but a single reading of it. D-49–D-51
(go-to-market) rest on **no** judge at all (scorecards for all three panels:
[07 §1](07-evidence-and-provenance.md)): `05-market-and-differentiation.md` says plainly that its
own two judges "did not return from the panel," and its recommendation is "the agent's judgement,
absent the two judges." Give D-45 the most weight, D-47 solid but singly-read weight, and D-49–D-51
the most of your own scrutiny — the last three are a considered opinion, not a verified verdict.

**What counts as confirmed.** Every codebase claim below traces to a `verify-*.json` verdict with
`real: true`; severities are `corrected_severity` where the verifier gave one, the original
reviewer's otherwise. All figures were checked against the working tree at `HEAD 7730633`
("Guests saw unpublished photographs on the Supabase driver," 16 September 2026, the photo half of
finding H1 below — the titles half is still open, and is N-89) on 16 September 2026.

---

## 1. Decisions to record

### D-45 · Backend stays on TypeScript; no Go or Java port, for at least 12 months

- **Was:** open. The repository "feels unmanageable" was a real question, not a settled one — three
  full written positions (stay, port to Go, port to Java 21/Spring Boot) argued it against the
  actual code.
- **Decided or proposed:** Proposed — stay on Next.js/TypeScript. Pay down the confirmed debt via
  the scoped remediation plan in §2–§3 below, not a rewrite.
- **Why:** Two independent judges scored it 8/10 against 5/10 (Go) and 4/10 (Java) on identical
  evidence. The decisive fact is arithmetic, not taste: `grep -rli razorpay` across the whole repo
  returns nothing, `plans` has zero rows and no reader, and every option either leaves that gap
  alone for months or doesn't. Stay leaves roughly 8 of the next 12 months free for commerce; Go's
  own document concedes a stalled port "finishes in month 8 exactly where month 0 was... minus the
  Razorpay integration that would have made the thing a business"; Java states outright "nobody
  should do this at 6 orgs and 5 catalogues pre-revenue." When both rival advocates argue their own
  case down, the verdict isn't close. The specific 3-year guarantee the ports sell — a compiler that
  can't let a driver bug like N-89 reach production — is buyable inside TypeScript in **about a
  week** (a shadow-read, generated Supabase types and a conformance suite: 5–7 days summed from 02's
  own per-item estimates, N-90 — the panel argued it as "about 10 days," the outside end of the same
  range), not 9–18 engineer-months. See
  [03 §A](03-port-and-build-vs-buy.md#a-should-the-backend-be-rewritten-in-go-or-java).

### D-46 · Trigger to reopen D-45: the week a second backend engineer's start date is set

- **Was:** no trigger existed. A rewrite case with no stated end condition is exactly how a debt
  sprint — or a premature port — becomes a permanent state; both judges named this failure mode
  independently.
- **Decided or proposed:** Proposed. Revisit D-45 when any of: a second backend engineer's start
  date is set (the losing positions' actual argument — hiring pool and bus factor — only turns real
  the day a second engineer exists); sustained volume passes ~150–300 weddings/month
  (`docs/SCALE-PLAN.md §3`'s modelled ceiling); a second confirmed driver-parity bug reaches
  production after N-90's conformance suite is in CI (one bug is a mistake already fixed; a second,
  past a suite built to catch it, means the seam design itself is unsafe); or Vercel/Supabase
  pricing moves materially against today's numbers. Full list: [03 §A5](03-port-and-build-vs-buy.md#a5-triggers-that-would-reopen-this-decision).
- **Why:** Today's team is one founder plus an agent, and both are productive in this codebase —
  an untested claim about a future team, not a refuted one about today's.

### D-47 · Video stays on Bunny Stream; no in-house transcoding pipeline this year

- **Was:** open. Two positions argued it (stay on Bunny and harden the seam; build an own-origin
  pipeline and keep Bunny only as the CDN) against one shared, undisputed cost model (`cost.json`).
- **Decided or proposed:** Proposed — hold. Harden the `VideoProvider` seam (N-93, N-97, N-98,
  N-100) and fix the two Bunny settings already costing more per month than a vendor change would
  save, but design the hardening **toward** the build case's target architecture (own origin,
  borrowed edge), so the option stays open and gets cheaper if the numbers ever move.
- **Why:** One judge scored it 8/10 against 5/10. The build case's entire financial argument is
  quoted at 60 weddings/month; the actual six-month target is ~10/month, and the position's own text
  concedes "below about 40 weddings/month this decision is straightforwardly wrong." No scenario in
  the shared cost model breaks even once one on-call person is priced, from 10 to 1,000
  weddings/month (₹52,044–54,971 self-hosted vs ₹7,534 Bunny at 10/month — **7.3×**). Every real
  benefit the build case claims — per-plan retention, a capped 4K allowance, measured delivery — is
  reachable from the existing seam for days of work, not five engineer-months. The Startup India
  angle argues against building, not for it: SISFS's own guidelines bar using seed money to build
  facilities, and its novelty criterion scores IP, not replicating what Bunny already gives away
  free. See [03 §B](03-port-and-build-vs-buy.md#b-should-mehfilbox-build-its-own-video-transcoding-and-delivery)
  and [04 §8](04-startup-india.md#8-what-does-not-help).

### D-48 · Unlisted (no-passcode) catalogues' photographs stay unsigned; passcode-gated ones get signed

- **Was:** open — N-83 itself names this as the one thing to decide before it can be built (guest
  photographs sit on a public CDN pull zone with no token authentication at all today).
- **Decided or proposed:** Proposed — sign a photo URL at render whenever the catalogue has a
  passcode; leave the URL plain when it does not.
- **Why:** A share preview and WhatsApp's own image fetch both need a plain URL, and both only
  matter for a catalogue the operator has already chosen to make unlisted rather than
  passcode-protected. This is the default `docs/NEXT.md`'s own N-83 write-up proposes, and both
  [01 §12.6](01-master-project.md) and [05](05-market-and-differentiation.md) independently land on
  the same answer. N-83 itself is unaffected by this decision except that it can now be built rather
  than waiting.

### D-49 · Go-to-market: hybrid, gated, sequenced — no public self-serve client door this quarter

- **Was:** open. Sandeep's own brainstorm floated a direct-to-couple registration door; the market
  panel argued it as studio-first (never open it; themes stay free to everyone) vs. hybrid (open a
  gated one; themes get a paid tier). No judge scored the contest — see the asymmetry note above.
- **Decided or proposed:** Proposed — do not open any door a couple with no studio relationship can
  self-register through. Build the three studio-safety rules first (N-94, N-95, N-96), then N-20
  (Razorpay for the studio channel), then test demand with a zero-build invite form (N-102) before
  building anything for a direct client at all.
- **Why:** Nearly all of the door is built — a couple-owned catalogue already runs the same wizard,
  customizer, upload and publish routes a studio uses, and exactly one admin route is partner-only —
  which is exactly what makes it dangerous to open first. (The "96%" figure is the hybrid position's
  own framing, not a count; what is evidenced is the one partner-only route. What is *not* built is
  the door itself: no code path anywhere creates a couple account outside a studio's action, so even
  an invite-plus-manual-grant needs two to three days of new code — see [05 §1](05-market-and-differentiation.md).) `presentedBy` and the platform-credit toggle are plain editable fields any catalogue
  owner can change today, including a couple after handover; a couple's credit request and the
  guest renewal screen already bypass the studio and go straight to the platform's support inbox.
  Opening a direct door on top of both gaps makes the bypass the default path, in the channel the
  entire pricing model depends on. See [05 §1–§3](05-market-and-differentiation.md).

### D-50 · Direct-client Deliver credit: test at ₹3,499, floored at the ₹1,999 studio wholesale price

- **Was:** no price floor exists for anything sold outside the studio channel, because nothing is.
- **Decided or proposed:** Proposed, for whenever the door in D-49 actually opens — not before.
  State the floor publicly once it applies.
- **Why:** ₹3,499 is anchored between viddrop's ₹1,900–2,400 and the ₹5,000–8,000 studios are told
  to charge; the floor that matters is the studio's own wholesale price, **₹1,999** (`docs/PRICING.md`
  §1), because [05 §3](05-market-and-differentiation.md)'s rule 4 requires only that a direct price
  sit above wholesale. An earlier draft named "never below ₹2,999"; that number appears in neither
  strategy position, nor `PRICING.md`, `COMPETITORS.md` or the decision log, and is dropped rather
  than given a provenance it does not have. Keeps the Studio plan's own arithmetic ahead of any
  direct path at real volume by construction, which is the rule that makes "a studio earns when a
  signup names them" honest. Needs a channel or price field on credits that neither `credits` nor
  `plans` has today — ships with N-20, not before. **Do not print "excl. GST" until the registration
  question in [04 §4](04-startup-india.md) is answered**: an unregistered supplier cannot add GST to
  an invoice at all. See [05 §2–§3](05-market-and-differentiation.md).

### D-51 · Theme store: free tier stays free for every studio; a paid "Advanced" tier only after ten direct signups; no marketplace

- **Was:** open — themes have no owner, price, tier, entitlement check or purchase flow today
  (`supabase/migrations/0019_themes.sql:9-19`).
- **Decided or proposed:** Proposed — do not build a paid tier, third-party authors or versioning
  this quarter. It competes for the same founder-plus-agent time as N-20, N-83 and N-86, all of
  which affect paying studios today, for a revenue line modelled at roughly ₹4,000/year at 120
  weddings — on two stipulated assumptions (10% of catalogues direct in year one, a third of those
  buying) that nothing observes, since there are no direct catalogues at all today, and at the top of
  the panel's own ₹499–999 band. At the bottom of the band it is half that. The conclusion is robust
  to all of it: one retained Studio plan at ₹4,999/year outweighs the store's first two years.
- **Why:** The honest reason to build it at all is the signal to studios ("you get more from us than
  an individual does"), not the money — and that signal only matters once there are individuals to
  compare against. See [05 §4](05-market-and-differentiation.md#4-the-theme-store).

### D-52 · Entity: incorporate as a Private Limited Company; registered office provisionally Karnataka

- **Was:** nothing is incorporated. A search of `docs/` for "private limited," "LLP,"
  "incorporated," "company registration," "ROC" and "MCA" finds no existing legal entity; the only
  registered asset is the domain `heirloomfilms.in`.
- **Decided or proposed:** Proposed — Private Limited Company, ≤ ₹15 lakh authorised capital (keeps
  the MCA filing fee nil), registered office in Karnataka pending confirmation of Sandeep's actual
  base.
- **Why:** The only structure fully eligible for DPIIT recognition, 80-IAC/140 and SISFS that can
  also issue priced equity and a standard ESOP pool — LLP reaches the same three schemes but becomes
  an awkward fit the moment outside equity is on the table, and OPC is excluded from DPIIT
  recognition outright. **On Karnataka specifically, the ceiling argument does not survive:**
  ELEVATE's ₹50 lakh is gated to the proof-of-concept stage Mehfilbox has already passed, *and* its
  own eligibility text requires the entity be "Registered or Incorporated in Karnataka" — so it is a
  consequence of the office choice, not a reason for it — while the larger ELEVATE NxT ₹1 crore is
  DeepTech-only. What survives is narrower: the deepest software hiring pool (relevant only if D-46
  ever fires), registered-office convenience if Sandeep is already there, and patent-cost
  reimbursement up to ₹15 lakh/year if patents are ever filed. This is explicitly unconfirmed pending
  Sandeep's actual location. See [04 §2.1, §6](04-startup-india.md).

### D-53 · Name an explicit stop date on the codebase remediation effort: 8 weeks

- **Was:** the remediation plan in §3 below has no stated end condition, the same failure mode both
  architecture judges flagged in D-45/D-46.
- **Decided or proposed:** Proposed — if N-89, N-88b (staging, which N-90 depends on), N-90, N-91
  and N-92 (the items both judges independently called urgent regardless of the architecture
  decision, plus the prerequisite neither of them priced) have not all landed by
  **11 November 2026** (8 weeks from this document), stop treating the rest of §3 as a dedicated
  effort, keep whatever shipped, and fold what's left back into the normal one-ticket-per-commit
  backlog rather than letting a "debt sprint" quietly become the new steady state.
- **Why:** This is the same discipline `docs/NEXT.md`'s own ordering rule already asks for — cheapest
  first within a tier — made concrete with a date, because a plan with no end date is how "pay down
  debt" turns into "the debt sprint is now the roadmap." See [03 §A4, item 4](03-port-and-build-vs-buy.md#a4-decision).

---

## 2. Tickets from the architecture and go-to-market decisions

Ordered by `docs/NEXT.md`'s own rule — unretired risk first, then what would embarrass us in front
of a planner or a studio, then debt — cheapest first within a tier. Section 3 covers the rest of the
codebase assessment; N-89 and N-91 here are also that assessment's two high-severity findings, and
are not repeated there.

### Risk

**N-89 · Close the publish gate on the two paths that still leak — 2 hours, then half a day**
Two sites, one class of bug, one ticket, because fixing either alone leaves the promise broken.
*(a) The list gate.* `lib/db/supabase-repository.ts:1390-1392` gates `listTitles({ publishedOnly })`
on `.eq('published', true).eq('status', 'ready')` alone, with no `live_at` check — confirmed still
true at HEAD 7730633; the predicate is the `if` at :1392. `lib/db/memory-repository.ts:745-758`
gates on `status === 'ready' && liveAt !== null` instead, with the comment on record explaining why:
"checking both was the first attempt and it broke withdrawal." This is the photo bug's twin, fixed
everywhere except the read path production actually uses, and it is live on all 5 production
catalogues today, independent of scale. Two lines: add the `live_at` predicate at :1392. **2 hours.**
*(b) The playback gate.* `app/api/playback/token/route.ts:35-41` refuses a title on
`!title.published` and never reads `live_at` at all, so after (a) lands a ticked-but-unpublished
film can still mint a working, TTL'd playback URL to anyone who knows its slug — and slugs are
frozen to the upload filename forever (N-84), so they are guessable from a forwarded file
(`map-media-infra.md` §7 item 3 flags this as unresolved). The half-day is the decision, not the
line: the customizer's preview mounts the real guest components and calls this same public endpoint,
so the route needs a way to tell an operator's own preview from a guest holding the passcode.
**Without (b), "the class is closed" is not true when this ticket lands.** Commit this alone, before
anything else in this document.

**N-88b · Stand up staging — 1 day plus two free accounts · blocks N-90**
Already tracked as **N-87** in `docs/NEXT.md` ("debt that is costing us"), raised independently as
**M9** by [02](02-codebase-assessment.md), and named there as one of the four biggest operational
risks — but it has to appear in this list too, because **N-90's first step cannot run without it**
and nothing else in this document would have said so. Today every migration and every build meet
each other for the first time in production: Vercel Preview has no real environment variables, and
`lib/env.ts` refuses to boot a production-shaped build on an ephemeral data driver, so no preview
deployment can run against anything real, and the 212-test E2E suite proves nothing about the
combination that actually breaks. Exactly as N-87 specifies: a second free-tier Supabase project
seeded from the demo fixture, a second Bunny library, a staging subdomain, and the deploy script
pointed at it first. Numbered `N-88b` rather than N-89+ so it sits where `docs/NEXT.md` already has
it; keep whichever number that file prefers when this is merged. See the decision row below.

**N-90 · Shadow-read, then a driver-conformance suite, then generated Supabase types — about a week, in three steps · needs N-88b (staging) first**
Both port judges independently proposed the same sequence, and it is what would have caught N-89
before a guest did. *Step 1 (cheapest, do first):* run both drivers on every read **in staging**,
return the Supabase answer, log every divergence — no user-facing change. **This is the dependency:
staging does not exist, so step 1 cannot start until N-88b lands.** 1–2 days. *Step 2:* a
contract-test suite run against both `MemoryRepository` and `SupabaseRepository`, starting with the
~15 methods whose body contains a predicate or an `ORDER BY` — and including the playback gate from
N-89(b) in its assertions, so the class is closed rather than the two instances. 2–3 days
([02 §3 H1](02-codebase-assessment.md)). *Step 3:* `supabase gen types typescript` against the
~20 hand-written column maps in `lib/db/supabase-repository.ts`, exporting the remaining private ones
(the 35-field catalogue map at :239-275 first — it's the most-edited entity and currently untested).
1–1.5 days ([02 M1](02-codebase-assessment.md)). **5–7 days summed, which is the "about a week" used
throughout this folder**; the panel argued it as "about 10 days," the outside end of the same range,
and D-45 is priced against the reconciled figure. It closes the *class* of bug N-89 is one instance
of, which a language port would not do for free either. See
[03 §A4](03-port-and-build-vs-buy.md#a4-decision).

**N-91 · Move the six background jobs onto Vercel's own scheduler; retire the GitHub Actions drain — 1 hour, once Vercel Pro is on**
`vercel.json` registers only `reconcile` and `usage`; `lifecycle`, `notify`, `warnings` and
`synthetic` run off `.github/workflows/notify-drain.yml` and `synthetic-check.yml` instead, because
Vercel's Hobby tier caps a project at two cron jobs. That workflow's own header states the rule
plainly: "a public repository's schedules are disabled after 60 days with no commits" — a normal gap
between sprints for a solo founder. Alerts are *enqueued*, not sent directly, so the alert that would
say the schedule stopped is delivered by the same queue that stopped. The fix Vercel Pro buys
(~$20/month ≈ ₹1,900) is exactly the workflow file's own comment: "when the account moves to Vercel
Pro, delete this file and put the entry back in `vercel.json`; the route itself does not change
either way." Both port judges independently call this "the single cheapest, highest-value item in
either document" — Go prices the same outcome at 1.5 of its 13 engineer-months; this buys it for an
afternoon and a subscription. *If Pro isn't approved yet:* an interim heartbeat inside the two
existing Vercel slots that checks how stale the last `notify` run is and sends directly past two
hours overdue — 3 hours, and explicitly a stopgap, not a replacement for this ticket.

**N-92 · Pin the org-scoping rule as an automated test, now, while it holds 100% — 2 hours**
`lib/admin/session.ts` states the strong claim that "a route that does not call one of these
functions is visibly unscoped," but nothing in `tests/` checks it — unlike the module-registry rule,
which gets a 35-line filesystem-walk test. Re-audited 16 September: every one of the 34 route files
under `app/api/admin/` and every `page.tsx` under `app/admin/` does call a guard today. Build the
test in the same shape as `tests/unit/registry.test.ts`, covering **both** guard-name families — API
routes use `requireOperator` / `requireOwnedCatalogue` / `requireEditableCatalogue` /
`requirePlatformAdmin`; pages use `getOperatorSession` / `getSessionOrg` / `getEditableCatalogue` —
plus an explicit allowlist for the pages that are deliberately public (`/admin/login`,
`/admin/register`, `/admin/new`). A naive version built from only the route-side names fails against
every page on day one; get the two families right and this is the cheapest structural guarantee in
the whole plan, for a multi-tenant product whose worst failure mode is one studio reading another's
wedding.

### Embarrassment

**N-93 · Enforce the Cinema plan's 4K allowance at upload — about a day**
`grep` for `enabledResolutions`, `2160` or `1440` across `lib/`, `app/`, `components/` and
`modules/` returns nothing — resolution is a library-wide Bunny setting, not a per-asset one, so
today every plan gets whatever the library allows, regardless of what it paid for. Set
`enabledResolutions` per asset at `createUpload` time, read from the catalogue's plan via
`lib/entitlements.ts`. This is the one line item both the transcoding judge and the codebase
assessment agree is worth more per month, corrected, than the entire build-vs-buy question either
way — and today it is a silent discount every Deliver customer gets on a feature Cinema pays for.

**N-94 · Lock attribution the moment a catalogue's origin is a studio — about a day**
`presentedBy` and the "Made with Mehfilbox" toggle are plain autosaved fields any catalogue owner
can edit today, including a couple after handover (`components/admin/ThemePicker.tsx:64-125`). Make
them read-only in the branding write path (`app/api/admin/catalogues/[id]/route.ts:32-39`) once
`origin_org_id` names a partner, enforced server-side, not hidden in the UI. This is where
`docs/PRICING.md`'s promise that the "Filmed by" credit survives "permanently, through every
renewal" becomes true rather than a sentence in a document. Prerequisite for D-49 — a studio-safety
rule, not tied to whether the direct door ever opens.

**N-95 · Route a couple's money requests to the originating studio first — about half a day**
A couple's credit request and the guest renewal screen both go only to the platform's support inbox
today (`app/api/admin/credits/request/route.ts`, `app/c/[slug]/renew/page.tsx:48-54`), while the
product's own copy tells the couple "your studio can add this." The lifecycle warning emails already
cc the studio correctly (`lib/notify/schedule.ts:124-159`) — reuse that pattern here, with the
platform as a timed fallback rather than the only recipient. Fixes a contradiction the product ships
today, independent of D-49.

**N-96 · Studio-only routes refuse non-partners at the API layer — about a day**
House styles, team seats, the renewal worklist and custom-domain management are hidden from a
couple's chrome today but not refused by the routes themselves. Add the check at the API layer.
**Start with the one the maps found actually reachable, not the UI-hidden four:**
`POST/DELETE /api/admin/catalogues/:id/transfer` calls `requireOwnedCatalogue` with no
`org.kind === 'partner'` check — unlike `couple/route.ts:49`, which does check — so a couple who
owns a catalogue can, by calling the API directly, mint a working 14-day claim link to **any**
email address and hand their own wedding away. No UI exposes it (`canHandOver` hides the panel for
a couple) and the `direct: true` shortcut is separately blocked, because it requires a `coupleOrgId`
that is null on a couple-owned row — but the email-link path is open (`map-client.md` §7 item 6,
cited by [05 §3 rule 5](05-market-and-differentiation.md)). A security tidy-up whether or not the
direct door in D-49 ever opens, and a prerequisite for it if it does.

### Debt and optionality — cheap, not urgent, worth doing while cheap

**N-97 · Wire per-title video-provider dispatch — about 2 hours**
`titles.provider` is already persisted per row (`lib/schema.ts:436`, defaults to `'bunny'`) and seed
data already writes `'fake'` to it, but `getVideoProvider()` in `lib/video/index.ts:10-14` takes no
argument — confirmed nothing dispatches on the column today. About ten lines turns any future
provider migration from a big-bang cutover into a per-upload one, where old films keep serving from
Bunny indefinitely. Worth doing regardless of D-47, because it's what keeps that decision cheap to
reverse if it's ever revisited.

**N-98 · De-leak the two Bunny-specific assumptions that have escaped the `VideoProvider` seam — about half a day**
`modules/curated-row/Guest.tsx:27-29` hard-codes `'preview.webp'` because Bunny happens to write one;
`components/streaming/useHlsPlayback.ts:123-136` re-appends a playback token to child URLs in a way
coupled to Bunny's specific signing shape. Both are small fixes now and a two-week debug later if
D-47 is ever reopened. Prerequisite for N-90's conformance suite covering video, not just data.

**N-99 · Measure real stored bytes on the live Bunny library — about half a day, this week**
Sum `storageSize` across the library (`getUsage` already returns it per video) and compare it to the
ladder-only model's ~32 GB/wedding estimate. The entire "keep-originals is costing ₹25,000/month"
argument behind any future per-plan retention work depends on a number nobody has actually read yet.
Run this before deciding anything about retention, and feed the result into N-82/N-24a's pricing
correction (§3 amendments below) rather than treating it as a separate exercise.

**N-100 · Make the Bunny playback-verification script driver-agnostic — about half a day**
`lib/video/provider.ts`'s own header states "switching from Bunny to Cloudflare is a new
implementation of this interface and one line" — true today only because `lib/video/fake.ts` is a
complete second implementation CI already runs against. Run `scripts/verify-bunny-playback.ts` (or
its equivalent) against `FakeVideoProvider` too, so that claim stays a tested fact rather than an
asserted one, whether or not it's ever exercised.

**N-101 · Lift the Bunny webhook item out of N-11 into its own ticket, with a preflight assertion of our own endpoint — about 2 hours**
Bunny library `724076`'s `WebhookUrl` still points at a pre-rename URL — already tracked as the
"Left" line under N-11, but buried inside a domain-migration note rather than its own risk. The
failure mode is spelled out in `docs/GO-LIVE.md:236`: if a stale Vercel alias ever serves that
webhook, uploaded films silently never leave "processing." The Bunny-side field is account-key-gated
and unreadable from this repo — so the fixable half is ours: make `scripts/preflight.ts` assert that
**our** endpoint is reachable and correctly signed at the expected URL, print the dashboard value it
must match, and put that comparison in the domain-change runbook. The dashboard half stays a manual
step; N-11 keeps that pointer.

**N-102 · A "no studio?" invite-only page to test direct-client demand — about 2 hours, zero product change**
An invite form, not a signup — it tells whether a single couple with no studio has ever actually
wanted this, which nothing today shows (6 orgs, 5 catalogues, all studio-made). This is step 5 of
[05 §6](05-market-and-differentiation.md#6-sequencing-the-next-90-days-and-what-to-defer)'s
sequencing; step 6 — the actual gated wizard-behind-invite door, with lead routing to the named
studio — stays deferred until this form fills and D-49's three safety rules (N-94–N-96) and N-20 are
live. Do not build more than the form.

---

## 3. The remediation work from the assessment, as tickets

`02-codebase-assessment.md` confirmed **49 findings, all real**. Counted per verdict they run 3 high
/ 21 medium / 25 low; six pairs turned out to be the same issue caught by two lenses, and merging
them gives **43 distinct entries: 2 high, 18 medium, 23 low**. (Both figures are correct and they
are not the same count — 49 cannot sum to 43, so say which one is being quoted. The high-severity
pair that merges is the publish gate, raised by both the maintainability and scalability lenses.)
26 of the 49 were marked as mattering within the next 12 months. H1 (the publish gate) is N-89
above; H2 (the scheduler) is N-91 above — both already covered in §2 and not repeated here.
Security was not one of the four lenses, so none of those counts covers N-83, N-85 or N-86; see
[02 §3a](02-codebase-assessment.md).

This section is the rest of 02 §7's own phased plan, converted to tickets in the same order: cheap
and currently-taxing first, background work last.

**What this actually costs, summed rather than asserted.** The tickets in §2 and §3 together come to
**roughly four weeks of hands-on time** if every one of them is done (§2 ≈ 11 days, dominated by
N-90's week; §3 ≈ 10 days, dominated by N-108 and N-110). That is not the same as [02 §7](02-codebase-assessment.md)'s
"three weeks through Phase 2," because §2 here adds the architecture and go-to-market tickets 02
never covered. **The "week and a half" figure that circulates belongs to a third, smaller scope:
N-89 through N-92 plus staging — the tickets D-53's stop date actually covers — which is about six
to eight days.** Three scopes, three numbers; quote the one that matches the sentence.

**N-103 · Point the ship skill's verification at the real deploy URL — 1 hour**
`.claude/skills/ship/SKILL.md:46` curls `marquee-film-pub.vercel.app`, a legacy Vercel project
alias, while production is `mehfilbox.com`. Not hypothetical: `docs/PROGRESS.md:421-424` already
records this exact alias silently serving a stale build once, after a project rename. Point the
check at the URL `vercel --prod` itself just printed, compared against the commit hash, instead of a
hardcoded hostname.

**N-104 · Documentation, this week's tier — about a day, one dedicated pass**
Four fixes that all tax every ticket from here forward, bundled because they're cheap and the
5.6x cold-start overrun compounds until it's fixed: (1) delete the competing "start here" lines in
`README.md`, `docs/README.md` and `docs/PROGRESS.md:8` so CLAUDE.md to PROGRESS to NEXT is the only
reading order; (2) archive `docs/spec/README.md` and `docs/spec/13-agent-runbook.md` — both still
titled for the retired product name and mapping a pre-move file layout — keeping their one surviving
idea ("load only what the item names") as two lines in CLAUDE.md; (3) split `docs/PROGRESS.md`
(2,050 lines) at the last phase boundary into an archive file plus a trimmed live file, and correct
the advertised "~8k-token cold start" to the measured number (CLAUDE.md + PROGRESS + NEXT is ~45k
tokens today, not ~8k); (4) rewrite README's "Known gaps" section from `docs/PRODUCT.md` and
`docs/NEXT.md` directly — it currently says the Supabase driver "has never run" (it has, since
12 September) and that the test suite has 168 tests (it has 659), understating how finished the
product is to the one audience — a contractor, an acquirer — who might actually start there.

**N-105 · Add a real migration ledger — 1 day**
`scripts/migrate.ts` only prints filenames; nothing currently answers "is production on head?"
without a human checking by hand, and the two things that gesture at an answer are already stale (a
health probe still calls credits "the newest migration's table (0021)" while 0025 is head).
`docs/NEXT.md` already records one incident: applying migrations by hand broke catalogue creation
for several minutes on 12 September. Add a `schema_migrations` table; rewrite `scripts/migrate.ts`
to connect, read it, and apply only what's missing, each in its own transaction; have the health
endpoint report the applied version.

**N-106 · Batch the nightly usage cron — 4 hours**
`app/api/cron/usage/route.ts` walks every catalogue, then every title, awaiting one Bunny API call
at a time with no concurrency and no `maxDuration` set anywhere in the repository. At ~10
weddings/month this doesn't currently cost anything real — nothing downstream reads the table it
writes yet, and a killed run shows as "overdue" on the health page rather than failing silently —
but the unbounded serial fan-out is worth fixing before catalogue count grows into it. Set
`maxDuration`, run per-title calls in bounded parallel, give the catalogue walk a resumable cursor.

**N-107 · Widen `pnpm lint`'s directory coverage — 2-3 hours**
`next lint` (what `pnpm lint` runs) never scans `middleware.ts`, `modules/` or `themes/` by default.
Reproduced directly: `pnpm exec eslint middleware.ts modules themes` finds four real
`no-restricted-properties` violations, all in `middleware.ts:23,34,74` — reading `process.env`
outside `lib/env.ts`, which is CLAUDE.md's own first enforced rule. The reads themselves are
legitimate (`lib/env.ts` is `server-only` and can't be imported into edge middleware); the
enforcement claim is not. `modules/` and `themes/` — the two directories an agent edits weekly under
`add-module` — are clean today, so the moat isn't currently breached, only unwatched. Widen the lint
script's directory list and either fix or deliberately exempt the four `middleware.ts` reads.

**N-108 · Batch the playback heartbeat — 2-3 days**
`components/streaming/useProgressHeartbeat.ts` posts every 10 seconds while a film plays; each post
is a `force-dynamic` function doing 5-6 sequential Supabase round trips. At the scale-plan's own
300-guests-for-20-minutes scenario that's roughly 360,000 invocations for one wedding evening
against a system-wide planning figure of 30,000/month — real headroom, not yet a cliff at ~10
weddings/month. Raise the interval, batch deltas into one request, collapse the round trips into one
Postgres function. Fold in the doc correction while here: `docs/SCALE-PLAN.md` also assumes the
guest page is ISR-cached; it isn't (`lib/guest-locale.ts:22-23` reads cookies unconditionally, and
the page awaits `searchParams`) — see the N-81 amendment below.

**N-109 · Documentation, this month's tier — about a day**
Four smaller fixes, real but not urgent: (1) make `docs/PRODUCT.md` the only product-status document
— add a "Target" column to its existing table, archive `docs/ROADMAP.md` and `docs/REQUIREMENTS.md`
into it, and fix `PRODUCT.md`'s own stale claim that "the domain is still `heirloomfilms.in`" first,
since CLAUDE.md names this the file to update before code; (2) date `docs/ARCHITECTURE.md`
("first pass only") immediately — a search for any second-pass term (credit, theme, platform
console, custom domain, premiere, occasion) across its nine sections returns zero matches, and two
other files still call it "the best single entry point"; the full rewrite (~1 day) can follow later;
(3) consolidate `docs/PRICING.md`, `docs/PRICING-MODEL.md`, `docs/ROADMAP.md` and
`docs/REQUIREMENTS.md`'s rupee figures into `PRICING.md` alone, the rest stripped to a link; (4) fix
the numbering hygiene from the "Numbering" note above (rename the second D-32) while touching the log
for D-45 onward anyway.

**N-110 · Component tests for the four largest untested admin components — 3-4 days, background, one per sprint**
`components/admin` sits at 17% line coverage, and `CreateWizard.tsx` (1,006 lines),
`CustomizerShell.tsx` (765), `ThemeStudio.tsx` (613) and `PreviewPane.tsx` (472) have zero component
tests — the inverse of where the risk actually sits, since the pure logic (schema, i18n,
entitlements) is at 92-100%. Not a coverage-number chase: start with `CustomizerShell`'s
undo/redo/autosave path, the single choke point CLAUDE.md's own definition of done depends on, since
the customizer is the thing a planner watches change live. While in `CreateWizard`, its
local-storage draft mirror only restores 5 of roughly 11 relevant fields — a refresh on step 1 or 2
silently drops occasion, timezone, premiere date, privacy and the couple's email. Fix alongside the
test, not as a separate ticket.

**N-111 · A batched low-severity hardening pass — half a day, opportunistic**
23 low-severity findings, none urgent alone, most under 4 hours each — listed in full in
[02 §3](02-codebase-assessment.md#low-severity--23-findings). Batch a handful into a periodic
afternoon rather than ticketing each individually: the module registry matching the string
`'billboard'` instead of `meta.shape`, header-name constants defined five times, comment rot in the
`Repository` interface, "partner" vs. "studio" naming, an RPC for `catalogueCounts`, pagination on
unbounded `list*` methods, chunking the `.in()` id arrays, reading posters through the cached bundle,
moving the passcode-lockout bucket to Postgres, pruning `play_events`, splitting the locale bundle,
one upsert instead of delete-then-add in the deploy script, a shared `requireCron()` helper, a
`?deep=1` branch on `/api/health`, and generating `.env.example` from the schema.

### Amend four existing tickets rather than add new ones

- **N-81 (measure the limits):** add an immediate sub-step ahead of "after 3-4 real weddings" —
  correct `docs/SCALE-PLAN.md §3`'s two wrong assumptions now, in the same pass as N-108: the guest
  page is not actually ISR-cached (three separate things force it dynamic — cookies, the passcode
  grant, and awaited `searchParams`), and the playback heartbeat runs at roughly 12x the invocation
  budget the plan assumes. Neither is a wedding-evening failure at today's volume; both are wrong
  numbers in the document Sandeep would use to judge whether the stack holds.
- **N-82 / N-24a (the cost line):** run N-99 (measure real stored bytes) alongside, not after —
  both feed the same `PRICING.md` correction, and N-99 can run this week while N-24a waits on a real
  15-hour wedding upload.
- **N-21c (the "call them" Cinema renewal prompt):** fix its stated blocker. `docs/NEXT.md:296-301`
  says "needs **N-27b**" in both its header and its body — and N-27b, the storage quota, shipped on
  8 September, so the blocker reads as already cleared and the ticket looks ready to pick up. It is
  not: the prompt needs to know a catalogue *is* Cinema, which means **plan** assignment, **N-27c**,
  which is itself blocked on D-44. One-word fix, but it is the kind that costs a session to
  rediscover.
- **N-86 (lockouts, Turnstile, CSP):** fold in two cheap items while the file is open for the same
  reason — a shared `requireCron()` helper replacing the six copy-pasted, non-constant-time checks in
  `app/api/cron/*/route.ts`, and a documented secret-rotation path (`SESSION_SECRET` currently signs
  three unrelated things with no rotation story). Neither is urgent alone; both are the same kind of
  work as the rest of N-86.

---

## 4. Company and Startup India actions

[04-startup-india.md](04-startup-india.md) has the full reasoning, every primary-source citation,
and every place this research could not get a clean answer. This is that document's own 90-day plan
converted to calendar dates against today (16 September 2026) and an owner for each row. "Agent"
means whichever session picks this up next; none of these need code.

| By | Action | Owner | Why |
|---|---|---|---|
| 22 Sept | Ask the accountant, in writing: does the existing Bunny/Vercel/Supabase reverse-charge liability already force GST registration? | **CA** (Sandeep sends the question) | Doesn't wait for incorporation — a sole proprietor can be liable under reverse charge too. Arguably the single most urgent item on this list. |
| 22 Sept | Run the trademark search, classes 41 and 42, for "Mehfilbox" | **Agent** or a paid search agent (₹3,000–8,000) | Already budgeted in `docs/PRODUCT.md:56-60`. A search engine finds brands, not registry records — do this before the name is locked in anywhere expensive. |
| 22 Sept | Confirm Sandeep's actual base and pick the registered-office state | **Sandeep** | Gates D-52's Karnataka default and every state scheme in [04 §6](04-startup-india.md#6-state-schemes-and-a-recommendation-on-state). We do not know where Sandeep is based; nothing in the repository says. |
| 22 Sept | Confirm whether "Heirloom Films" was ever separately registered as a company, LLP or proprietorship | **Sandeep** | Settles whether moving the code in is an IP assignment or a going-concern transfer — taxed and documented differently. |
| 6 Oct | Incorporate as a Private Limited Company (SPICe+, MCA), authorised capital ≤ ₹15 lakh | **Sandeep**, filed via a CS/CA | ~₹7,000–25,000, ~1–2 weeks. Implements D-52. |
| 6 Oct | Register on Udyam (MSME) | **Sandeep** or **agent** | Free, same-day, self-certified; unlocks the discounted trademark fee immediately without waiting for DPIIT. |
| 13 Oct | Execute the IP Assignment Deed; transfer `heirloomfilms.in` and the `mehfilbox` domains to the company | **Sandeep** + **CA** (registered-valuer report first, only if Sandeep is paid in shares) | Nobody legally owns the Mehfilbox codebase until this happens. |
| 13 Oct | File the "Mehfilbox" trademark (Form TM-A, classes 41 and 42) in the company's name | **Sandeep**, filed via agent | ₹4,500/class once Udyam- or DPIIT-registered. Confirm SIPP's free-facilitator status first — do not budget for it (unverified, possibly lapsed 31 March 2026). |
| 13 Oct | Apply for DPIIT recognition on NSWS (nsws.gov.in), **not** startupindia.gov.in directly | **Agent** drafts the write-up, **Sandeep** files | Free. Lead with the scalable-business-model case (83% modelled gross margin, 30–80× headroom) and the product differentiators as support — not the tech stack; a generic "we use the latest technology" paragraph is the most commonly cited reason an application is sent back. |
| 27 Oct | Register for GST, if the 22 Sept reverse-charge check didn't already force it sooner | **Sandeep** + **CA** | Free to start; modelled revenue alone (₹3.3 lakh over 6 months) sits well under the ₹20 lakh threshold, but reverse charge has no threshold. |
| 27 Oct | File Form-1 for Section 80-IAC / 140 | **Sandeep** + **CA** | Free; needs DPIIT recognition first. Exempts profit Mehfilbox doesn't have yet — paperwork to start and then forget about, not near-term cash. |
| 27 Oct | Check seedfund.startupindia.gov.in directly, or call an incubator, to confirm whether SISFS is actually accepting applications | **Sandeep** or **agent** | **We do not know.** Multiple 2026-dated sources report the last cycle closed 31 May 2026 with no confirmed successor; the live portal renders as a JavaScript app this research couldn't read directly. |
| 8 Dec | If open: submit the SISFS application to up to three empanelled incubators, **T-Hub (Hyderabad)** first | **Agent** drafts the one-pager, **Sandeep** reviews and submits | T-Hub is the only incubator whose own site (checked directly) names both SaaS/enterprise-tech and media-tech as sector focus. Self-score against the eight-criteria rubric in [04 §5](04-startup-india.md#5-grants-and-funding--sisfs-cgss-ffs-maarg) before sending anything. |
| Ongoing | Reuse `docs/SCALE-PLAN.md`'s own numbers for any pitch, one-pager or financials | **Agent** | Don't invent new projections; keep that document's own "reasoned, not measured" honesty about what's estimated versus counted. |

---

## 5. What to explicitly not do this quarter, and why

1. **No Go or Java backend port** (D-45). Both rewrites concede their own case loses on timing at
   this scale — Go's own words are that a stalled port "finishes in month 8 exactly where month 0
   was"; Java states "nobody should do this at 6 orgs and 5 catalogues pre-revenue." Every confirmed
   finding bar the high-severity ones is language-neutral — 41 of the 43 distinct entries — and a
   rewrite fixes neither of those two either.
2. **No in-house video transcoding pipeline** (D-47). The build case's own numbers are quoted at six
   times the actual six-month target, and no scenario in the shared cost model breaks even once one
   on-call person is priced, from 10 to 1,000 weddings/month.
3. **No static/ISR rework of the guest page.** The refactor plan's own R3 proposal to make
   `/c/[slug]` "actually cached" doesn't survive contact with the codebase's own design comment
   (`lib/catalogue-cache.ts:13-17`): whether a guest may see a catalogue depends on a passcode-grant
   cookie, and a page cached across guests can't answer that. Fix the *document's* wrong claim
   (folded into N-108); leave the actual rework for the day real guest traffic gives a reason.
4. **No public self-serve client registration door** (D-49). Nearly everything behind the door is
   built, which is exactly why it's dangerous to open before attribution locks and money routes
   through the studio first — and the door itself is two to three days of code that does not exist
   yet, since nothing anywhere creates a couple account outside a studio's action.
5. **No paid theme tier, marketplace, third-party authors or theme versioning** (D-51). All three of
   the latter are materially larger projects than anything else in this document; the paid tier
   waits for ten direct signups that don't exist yet, because the door in item 4 isn't open.
6. **No pagination, Docker CI build, or full secret-rotation runbook, right now.** All three are real
   findings with an explicit revisit trigger named in
   [02 §7 Phase 3](02-codebase-assessment.md#7-remediation-plan-in-order) — roughly 1,000
   catalogues platform-wide, an actual PaaS migration, or a suspected key leak. None of the three is
   within a year of arriving at ~10 weddings/month. The cheap fragments worth doing anyway (the
   `.in()` chunk, a shared cron-auth helper) are folded into N-86 and N-111 above.
7. **No SISFS pitch-deck effort until the portal's status is confirmed.** Unverified whether the
   current cycle even accepts applications — confirm first (checklist row, 27 Oct), and apply for
   DPIIT recognition regardless, since its 2-year SISFS-eligibility clock runs from incorporation
   either way.
8. **No consumer marketing spend for a direct-client channel that doesn't exist yet.** Wait for
   Keep-renewal retention data from studio-delivered weddings — `docs/PRICING.md §6` already names
   this the model's biggest untested assumption, and no direct door has opened to test it separately.
9. **No `store` module, commission, native TV apps, photo proofing/CRM, or a renewal revenue share.**
   Already deliberately off the roadmap (D-22, `docs/NEXT.md` Phase 4/5) — this research found
   nothing that changes that.
10. **No building N-27c or N-79 ahead of the plan-tiers decision** (D-44, still open — not this
    document's to resolve). `plans` has zero rows and no reader today on purpose: a console that
    assigned a plan before something enforced one would write a foreign key nobody consults —
    furniture that looks like a feature, and the most convincing kind of broken, because the console
    would show it and everyone would believe it.

---

## Decisions this asks of Sandeep

The nine new ones from §1, plus the Vercel Pro purchase and the staging call §2 depends on, plus the
two already-open items in `docs/NEXT.md` this week's research bears on directly — included here so
this is one complete list to work through, not because this document resolves them.

| Decision | Recommended default |
|---|---|
| D-45 — Stay on TypeScript, no Go/Java port, for at least 12 months? | **Yes** — two independent judges, 8/10 vs 5/10 vs 4/10, on identical evidence |
| D-46 — Accept "a second backend engineer's start date" as the trigger to reopen D-45? | **Yes** — it's the losing positions' own best argument, and it's dormant at a team of one |
| D-47 — Stay on Bunny, no in-house transcoding, for this year? | **Yes** — no headcount-priced scenario breaks even from 10 to 1,000 weddings/month |
| D-48 — Sign photographs only on passcode-gated catalogues; leave unlisted ones plain? | **Yes** — unblocks N-83 as written |
| D-49 — Hold the direct-client door until the three safety rules (N-94–N-96) and N-20 ship? | **Yes** — nearly everything *behind* the door is built, which is the risk, not the reassurance; the door itself (a route that creates a couple account) does not exist and is two to three days of new code |
| D-50 — Direct-client price: test at ₹3,499, floored at the ₹1,999 studio wholesale price, once the door opens? | **Yes**, published when it applies — and not quoted "excl. GST" until [04 §4](04-startup-india.md)'s registration question is answered |
| D-51 — Themes stay free for every studio; a paid tier waits for ten direct signups? | **Yes** |
| D-52 — Incorporate as a Private Limited Company, registered office provisionally Karnataka? | **Yes** — but confirm Sandeep's actual base first (checklist, 22 Sept); this is genuinely unconfirmed |
| D-53 — Set an 8-week stop date (11 November 2026) on the codebase remediation effort? | **Yes** — both architecture judges independently named "no stated end condition" as the failure mode to avoid |
| Buy Vercel Pro now (~$20/month ≈ ₹1,900) to execute N-91, or patch around it with the interim heartbeat first? | **Buy Pro now** — the interim heartbeat spends real engineering time working around a problem the subscription removes outright, and it also lifts the two-cron cap that pushed 4 of 6 jobs onto GitHub Actions in the first place |
| **Stand up staging (N-88b / N-87 / [02 M9](02-codebase-assessment.md)) right after Phase 0, before the next schema migration?** | **Yes** — one day and two free accounts, and it is a hard dependency, not a nicety: **N-90's first step runs in staging and cannot start without it**, and [02](02-codebase-assessment.md) names it one of the four biggest operational risks. Every migration and every build currently meet for the first time in production |
| D-44 (already open, not new here) — Plan tiers: keep the current duration-priced Deliver/Keep/Cinema ladder, or move to the storage-tiered proposal? | Not this document's call. `PRODUCT.md`, `ROADMAP.md` and this week's research all treat the current ladder as what's actually sold; N-27c, N-79 and N-80 stay blocked until Sandeep decides (§5, item 10) |
| Studio self-registration (already open, not new here) — should signing up at `/admin/register` need approval? | **Keep it open**, per D-39's "suspend after" rather than "approve before." `docs/NEXT.md:250-253` lists this as Sandeep's own call and it is still unanswered; an approval queue is ~2h of work and costs every honest studio a wait. [01's Decisions, item 2](01-master-project.md) reaches the same answer. Revisit only if real abuse shows up |
