# Executive Summary

Sandeep asked six questions on 15 September 2026 — about the codebase, two build-vs-buy
architecture calls, a new company under Startup India, a master reference document, and how the
product goes to market. This is the five-minute version of the answers. The six other documents in
this folder are the full working; read this first, and open one of them only for the file path or
the source behind a specific claim.

Compiled 16 September 2026 from nine subsystem maps of the codebase, four adversarial code reviews
(each re-verified line by line by a second, skeptical pass), two architecture panels scored by
independent judges, a go-to-market panel, and six Startup India research passes checked against
primary sources. Code claims are checked against `main` at **`HEAD 7730633`**. Every claim about the
code cites a file; every external fact cites a URL with the date it was checked; where nobody could
get a clean answer, this says so rather than guessing — those are collected in
[07 §4](07-evidence-and-provenance.md).

**Provenance.** This folder was committed to `main` on 17 September 2026 together with the inputs
it was built from, frozen under [`evidence/`](evidence/README.md): the nine subsystem maps, every
review finding with its adversarial verdict, the panel positions and scorecards, the Startup India
research with its fact-check, and the transcoding cost model. Every citation of the form
`map-client.md §7` or `verify-scalability.json` resolves there. The external prices and policy
pages are also inlined in [03, Sources for §B](03-port-and-build-vs-buy.md#sources-for-b), and the
judges' scorecards and reconciled finding counts are reproduced in
[07](07-evidence-and-provenance.md).

## What Sandeep asked on 15 September

1. **Is the codebase actually good?** — doubts about quality, maintainability, scalability,
   deployability.
2. **Should the backend be ported to Go or Java** — or decomposed and rebuilt entirely in-house?
3. **Should Mehfilbox build its own video transcoding**, instead of paying Bunny?
4. **Should Mehfilbox register for Startup India**, under a new company?
5. **Write a master project file** documenting every workflow, for every actor.
6. **Open direct client onboarding**, plus a theme store — free themes for studios, paid advanced
   themes for individual clients.

---

## The answers

### 1. Is the codebase actually good?

**No rewrite. Fix two live bugs this week, stand up staging, then work a priced remediation list
against a hard stop date.** Four independent adversarial reviews, each re-verified line by line
against the repository, raised 49 findings across ~35,250 lines and 296 files; every one held up.
Merging the six pairs that two lenses caught independently leaves **43 distinct entries: 2 high, 18
medium, 23 low** (per-verdict, before that merge: 3 high / 21 medium / 25 low across 49). Both high
entries are cheap — a small query fix, and roughly ₹1,900 a month for a Vercel subscription that
removes the other. The property that matters most for a multi-tenant platform — no studio can ever
read another studio's wedding — holds with zero exceptions across the **34 admin route files** (46
handlers) where org scoping applies, checked by hand twice; the other 27 route files under
`app/api` are the guest and webhook surface, authorised through `lib/catalogue-access.ts` instead.

**Three things this answer does not include, and a reader should know before quoting it.**
*First, security was not one of the four lenses.* Three named production security gaps sit outside
every count above and are all still live: photographs served from a **public CDN pull zone with no
token authentication** (N-83 — a photo URL copied out of a passcode-protected wedding returns 200
forever, verified against production 13 September), **the guest passcode granting full original
downloads** rather than viewing (N-85/D-43), and **captcha switched off in production with no
Content-Security-Policy** (N-86). See [02 §3a](02-codebase-assessment.md) and
[01 §12](01-master-project.md). *Second, nothing here measures the product against its own
definition of done* — "under a second and a half on 4G." The instrument exists and writes to a log
nobody reads; no number has ever been taken ([02 §1](02-codebase-assessment.md)). *Third, the
single most useful next step after the two bug fixes is **staging**, which does not exist* — one
day and two free accounts, and the driver-conformance work everything else rests on cannot start
without it ([02 M9](02-codebase-assessment.md), N-87).

**On effort, three different scopes get quoted and they are not the same number:** the four urgent
tickets plus staging are **about a week and a half**; 02's full remediation plan through Phase 2 is
**about three weeks**; all 23 tickets in [06](06-what-changes-next.md), which add the architecture
and go-to-market work, come to **roughly four weeks**. We recommend Sandeep set an explicit stop
date on the first of those — **11 November 2026, eight weeks out** — so paying down debt doesn't
quietly become the roadmap. Full findings, severities and file paths:
[02-codebase-assessment.md](02-codebase-assessment.md).

### 2. Port to Go or Java, or decompose and build it all ourselves?

**Stay on TypeScript, for at least the next 12 months.** Three full written positions — stay, port
to Go, port to Java — were scored independently by two adversarial judges, who reached the same
verdict by different reasoning: **8/10 for staying, against 5/10 for Go and 4/10 for Java**, on
identical evidence. Staying costs an estimated **3.5 engineer-months**, against 13 for a Go port
and 14–22 for a Java one — and leaves roughly eight of the next twelve months free to build
Razorpay, the payment integration that doesn't exist anywhere in the code today. The specific
guarantee a port sells — a compiler that can't let a driver bug reach production — is buyable
inside TypeScript in about a week (5–7 days, summed from 02's own per-item estimates; the panel
argued it as "about ten days"), not nine to eighteen months. Reopen this the week a second
backend engineer's start date is actually set. Full panel and both judges' reasoning:
[03-port-and-build-vs-buy.md §A](03-port-and-build-vs-buy.md).

### 3. Build our own video transcoding, instead of Bunny?

**Stay on Bunny.** The same kind of contest, scored by one judge: **8 out of 10 for staying, versus
5 for building** an owned pipeline. At today's actual volume — about 10 weddings a month —
self-hosting costs **₹52,044–54,971 a month against Bunny's ₹7,534**, a 7.3× multiple, once a
single on-call engineer is priced in; no scale in the modelled range — up to 1,000 weddings a month
— breaks even once people are counted. Harden the seam that already exists instead: cap the 4K
allowance nothing currently enforces, and settle the keep-originals storage setting, which **may** be costing
more per month than switching vendors ever would — the whole ₹25,000-a-month argument for changing
it rests on a stored-bytes figure nobody has read yet, and reading it is an afternoon's work (N-99).
Measure before deciding. Full cost model and triggers to revisit:
[03-port-and-build-vs-buy.md §B](03-port-and-build-vs-buy.md).

### 4. Startup India, under a new company?

**Yes — incorporate a fresh Private Limited Company for Mehfilbox, and apply for DPIIT
recognition immediately.** This answer was originally written assuming nothing was registered;
that was wrong — Sandeep has a proprietorship, Raamm Group Enterprises (Udyam
`UDYAM-MP-10-0138268`), owned by Asha Sharma. **A proprietorship cannot get DPIIT recognition,
the 80-IAC tax holiday or the SISFS seed grant — none of DPIIT's eligible entity types include
one** — so it was never a live option for this track, and Sandeep decided (17 Sept, **D-52a**) to
leave it untouched and incorporate fresh instead. DPIIT recognition is free, saves **₹9,000** on
the "Mehfilbox" trademark filing alongside it, and the SISFS seed grant of **up to ₹20 lakh** is
genuinely uncertain regardless — **we do not know whether the current application cycle is even
open**, and the live portal could not be read directly to confirm. **Still open: the
registered-office state.** Raamm Group Enterprises sits in Bhopal, Madhya Pradesh — a family
member's address, not confirmed as Sandeep's own base — and Madhya Pradesh has never been
researched against the provisional Karnataka default (§6). Full plan, with dates:
[04-startup-india.md](04-startup-india.md).

### 5. A master project file, documenting every workflow

**Done.** [01-master-project.md](01-master-project.md) — 16 sections covering all four actors
(platform owner, studio, client, guest) end to end, every capability marked Built, Partial or
Planned, with a file path behind every claim. It paid for itself before it was finished: mapping
the media pipeline caught a live bug — guests could already see a film or photograph before the
studio's next Publish. Every uploaded photograph was visible the instant it finished uploading, with
no toggle to delay it at all. The photo half was fixed the same day (commit `7730633`); the titles
half, and the same gap on the playback-token route one layer up, were both fixed 18 September
(ticket N-89, both parts, [PROGRESS.md](../PROGRESS.md)). Its single biggest finding, independent of
that bug: the price list sells 100–200 GB of storage and a working payment flow; what's actually
enforced today is a flat **20 GB cap** and a credit granted by hand, because Razorpay does not
exist anywhere in the code.

### 6. Direct client onboarding, plus a theme store

**Hybrid, gated, sequenced — do not open a public self-serve door this quarter.** Almost everything
*behind* the door is already built: a couple-owned catalogue runs the same wizard, customizer,
upload and publish routes a studio uses, and exactly one admin route is partner-only. That is
exactly why it's dangerous to open first: today a couple can already edit the studio's own
attribution off their wedding page, and a couple's payment requests already bypass the studio and
land on the platform's own support inbox. (The door *itself* is the part that doesn't exist — no
code path anywhere creates a couple account outside a studio's action — so even an invite-only
version is two to three days of new code, not a switch.) Close those two gaps and ship Razorpay for
the studio channel first; only then test real demand with a zero-build invite form, before building
a door at all. Keep every theme free for every studio, and add a paid "Advanced" tier only after the
direct door has **ten** real signups — modelled revenue at that point is about **₹4,000 a year** on
two stipulated assumptions nothing yet observes (there are no direct catalogues at all today), at
the top of a ₹499–999 band, against a **₹4,999-a-year** Studio plan. Whichever way those assumptions
land, the tier is a signal to studios, not a revenue line. Full sequencing and the studio-safety
rules that must come first:
[05-market-and-differentiation.md](05-market-and-differentiation.md).

---

## The eight documents

| Document | What it answers |
|---|---|
| [00-README.md](00-README.md) | This summary — the six questions, the answers, and the decisions Sandeep owns. |
| [01-master-project.md](01-master-project.md) | What Mehfilbox actually is and does today, actor by actor, capability by capability. |
| [02-codebase-assessment.md](02-codebase-assessment.md) | Is the code good: 49 confirmed findings (43 distinct, 2 high severity), the three live security gaps the four lenses never covered, a priced remediation plan, no rewrite. |
| [03-port-and-build-vs-buy.md](03-port-and-build-vs-buy.md) | Two scored architecture calls: stay on TypeScript, not Go/Java; stay on Bunny, not in-house transcoding. |
| [04-startup-india.md](04-startup-india.md) | What Startup India is actually worth to a pre-revenue SaaS, fact-checked, with a dated 90-day plan. |
| [05-market-and-differentiation.md](05-market-and-differentiation.md) | Whether to open a direct-to-couple channel and sell themes, without hurting the studio channel. |
| [06-what-changes-next.md](06-what-changes-next.md) | The nine decisions (D-45–D-53) and the ticket list (N-88b, N-89–N-111) that turn the other five into work. |
| [07-evidence-and-provenance.md](07-evidence-and-provenance.md) | Where the evidence came from, the judges' scorecards, the reconciled finding counts, and everything this research could **not** establish. |

---

## Decisions this asks of Sandeep

Nine decisions came directly out of this week's research; [06-what-changes-next.md](06-what-changes-next.md)
has the full reasoning and file paths behind every one.

| Decision | Recommended default |
|---|---|
| D-45 — Stay on TypeScript; no Go or Java port, for at least 12 months? | **Yes** |
| D-46 — Reopen D-45 the week a second backend engineer's start date is set? | **Yes** |
| D-47 — Stay on Bunny; no in-house transcoding pipeline, for this year? | **Yes** |
| D-48 — Sign photographs only on passcode-gated catalogues; leave unlisted ones plain? | **Yes** |
| D-49 — Hold the direct-client door until the studio-safety fixes and Razorpay ship? | **Yes** |
| D-50 — Direct-client price: test at ₹3,499, floored at the ₹1,999 studio wholesale price, once the door opens? | **Yes** — and not printed "excl. GST" until the registration question below is answered |
| D-51 — Themes stay free for every studio; a paid tier waits for ten direct signups? | **Yes** |
| D-52 / D-52a — Incorporate as a Private Limited Company? | **Yes, decided 17 Sept (D-52a).** A proprietorship, Raamm Group Enterprises, already exists and stays untouched; Mehfilbox gets a fresh Pvt Ltd instead, since the proprietorship cannot carry DPIIT/80-IAC/SISFS. Registered-office **state is still open** — Karnataka was only ever provisional, and Madhya Pradesh (where the family entity sits) has never been researched against it |
| D-53 — Set an 8-week stop date (11 November 2026) on the codebase remediation effort? | **Yes** |
| Buy Vercel Pro now ($20/month, about ₹1,900) to get off the GitHub Actions scheduler? | **Yes — buy it now, rather than build a workaround** |
| Stand up staging (N-87) right after the bug fixes, before the next schema migration? | **Yes — one day and two free accounts; the conformance work everything else rests on cannot start without it** |
| Studio self-registration (already open) — should signing up need approval? | **Keep it open**, per D-39's "suspend after"; still unanswered in `docs/NEXT.md` |

Three more questions need Sandeep specifically, regardless of the above: **where he is actually
based** (gates the registered-office state and every state grant), **one written question to the
accountant covering GST and DPDP** — does the Bunny/Vercel/Supabase reverse-charge liability already
force GST registration, what does a direct-to-individual SKU require given that an unregistered
supplier cannot charge GST at all, and what do DPDP's consent and deletion obligations require of a
company holding guests' wedding photographs (all three unresolved here; send them together, this
week) — and **whether a studio will actually offer the Keep upgrade at day 60, and at what markup**
(ask one real studio owner — no amount of internal reasoning substitutes for one real answer).

---

## What happens next, once Sandeep decides

**N-89 is closed, both parts** — the titles list gate (17 September) and the playback-token route
one layer up (18 September, `app/api/playback/token/route.ts`), which needed a real design
decision rather than a line: a guest is gated on `live_at`, an operator whose session owns the
catalogue is not, so the customizer's own preview — which calls this same endpoint for real —
keeps working. Nothing is waiting on a decision any more; this section is kept for the record.

Once the nine decisions above are confirmed, [06-what-changes-next.md](06-what-changes-next.md) has
23 tickets (N-89–N-111) ready to run, in the backlog's own order: unretired risk first — the live
bug, a shadow-read to catch its twin, moving the six background jobs off the GitHub Actions
scheduler, pinning the org-scoping rule that has held perfectly so far — then whatever would
embarrass Mehfilbox in front of a studio — the unenforced 4K cap, locking attribution, routing a
couple's money requests to their own studio — then debt and optionality, priced and ready but not
urgent. In parallel, on its own dated track that needs no code at all,
[06 §4](06-what-changes-next.md#4-company-and-startup-india-actions) turns the Startup India plan
into calendar dates running from 22 September to 8 December, starting with the accountant question
on GST and the trademark search, both due this week regardless of anything else. Only once the
studio-safety tickets and Razorpay are live does the zero-build invite form go out, to test whether
a direct client channel is worth building at all.

Nothing above needs Sandeep to write code or review a diff. It needs nine yes/no answers, the state
he's actually registered in, and one written question to his accountant.
