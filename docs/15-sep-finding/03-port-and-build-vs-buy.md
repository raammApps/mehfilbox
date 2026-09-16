# Port and Build vs. Buy

Two architecture decisions, written up as ADRs: **(A)** should Mehfilbox's backend be decomposed and rewritten in Go or Java, keeping React and Tailwind for the front end; **(B)** should Mehfilbox write its own video transcoding and delivery pipeline instead of paying Bunny. Both were investigated the same way — three independent positions argued their case in full, in writing, against the actual codebase, then an adversarial judge scored them against each other and against the code. Nothing here is one person's opinion; it's a decision made on paper, checkable against numbers and file paths.

The full panel transcripts live in the research scratchpad this document was built from and are cited below where it matters; every codebase claim is checked against the repository as it stood at `HEAD 7730633` on 16 September 2026, and **every external price or policy fact is listed with its URL and check date in [Sources for §B](#sources-for-b)** — the scratchpad is session-local, so nothing here should depend on it being readable later. Related: [02-codebase-assessment.md](02-codebase-assessment.md) for the confirmed defects both questions keep returning to, and the remediation plan neither decision changes; [04-startup-india.md](04-startup-india.md) for the grants angle both questions touch and neither should be decided on.

---

## A. Should the backend be rewritten in Go or Java?

### A1. Context

The stack today is already **Next.js 15.5, React 19.0, TypeScript 5.7 strict, and Tailwind v4** (`package.json`). Every theme is already nothing but a validated set of CSS custom properties (`themes/contract.ts`), and 64 of the 75 files under `components/` already carry `'use client'` (measured 16 Sep 2026). "Port to React and Tailwind" isn't really on the table — it's already true. What's actually being asked is narrower: should the **server** — `app/` and `lib/`, roughly 19,300 lines — be rewritten in Go or Java, behind the React front end left exactly as it is?

The question comes from a real feeling, not a checklist: the repository "feels unmanageable." That's worth sizing against the code before answering it. Measured 15–16 September 2026:

| | |
|---|---|
| Total source | ~35,250 lines, 296 files ([02 §1](02-codebase-assessment.md)) |
| Server-side (`app/` + `lib/` + `middleware.ts`) — what a backend port replaces | 19,332 lines |
| React/Tailwind (`components/` + `modules/` + `themes/`) — unchanged by any of these options | 15,921 lines, 55% of all source |
| Confirmed findings, four independent reviews, re-verified against the code | 49 verdicts, all real; 26 matter within 12 months. Merging six duplicate pairs gives **43 distinct entries: 2 high, 18 medium, 23 low** ([02 §3](02-codebase-assessment.md)) |
| Production scale | 6 orgs, 5 catalogues, pre-revenue, targeting ~10 weddings/month over the next six months |
| Team | One founder plus an agent — 179 commits, 8 Aug – 13 Sep 2026 |

One fact ends up deciding most of what follows: Mehfilbox is pre-revenue with no payment code anywhere in the tree. `grep -rli razorpay` across the whole repository returns nothing; the `plans` table has zero rows and no reader (map-commerce.md §7.1–2). Every option below either leaves that gap alone for months, or doesn't.

Three positions argued this: **stay** on TypeScript and pay down the confirmed debt; **port to Go**, one binary in two roles; **port to Java 21 / Spring Boot**, for the hiring pool. Each wrote a full case — architecture, honest costs, benefits, losses, risks, a migration path, and evidence citations — then two independent judges scored all three against the code and against each other, separately, and reached the same verdict.

### A2. The options, compared

| | Stay (scoped refactor) | Port to Go | Port to Java 21 / Spring Boot |
|---|---|---|---|
| Engineer-months | 3.5 | 13 | 18 (judges: honest range 14–22, and "the wide end is more likely than the narrow one" by the position's own admission) |
| Calendar time | ~4 months; first slice (the worst bug) ships week 1 | 8 months; first customer-visible value at month 2, if the team stops there | 11 months; nothing ships before month 11 unless the work is deliberately split |
| New infra, at 10 weddings/month | ~₹11,800/month (+₹4,300 over today — mainly Vercel Pro and a Supabase staging branch) | ~₹15,800/month | ~₹23,300/month |
| Commerce (Razorpay etc.) built in parallel? | Yes — leaves roughly 8 of the next 12 months free | Only if the team splits, and the estimate grows toward 18 months | Needs a second engineer who does not exist yet |
| Test suite | Keeps all 659 unit/component tests and 212 E2E tests; adds a driver-conformance suite | Loses the hermetic, no-Docker suite; a Postgres-container harness is standard but new | Same loss as Go, plus JUnit/Testcontainers rewrite of 9,312 lines of tests |

The three infrastructure figures aren't fully comparable as quoted — Java's number alone budgets a log/metrics retention line (the other two options have none today) and a larger instance size, so treat the spread as roughly ₹4,000–11,000/month over today rather than a precise ranking. **And note that Stay's ~₹11,800/month is the same figure §B2 quotes for the transcoding question's Buy option**, because both describe the same thing — today's platform plus Vercel Pro plus a staging Supabase — not two independent estimates that happen to agree. The judge's finding in §B4 applies to both: it doesn't reconcile to any single scenario in `cost.json`. Treat it as "today's bill plus roughly ₹4,300," which is derivable, rather than as a costed total.

| Option | Strongest benefit | Real cost or loss | Sharpest risk |
|---|---|---|---|
| **Stay** | Every slice ships independently — the worst confirmed bug is fixed in week 1, and about a week of the plan (a shadow-read, generated Supabase types, a conformance suite — 5–7 days, sized in A4) buys most of what the ports are selling, without 9–18 months to get there | The codebase gets bigger, not smaller (+3,000–4,000 lines of tests); does nothing for the one-person bus factor or the comparatively thin Next.js/RSC hiring pool | The plan has no end date named in advance — a debt sprint with no stop condition can quietly become a permanent state |
| **Go** | Collapses four scattered schedulers — Vercel crons, GitHub Actions, PostgREST, per-process memory — into one long-lived process; `sqlc`-generated queries make the driver-drift bug that already shipped to production (see A3) structurally impossible rather than merely tested against | Touches none of the 13,326 lines of React at 17% test coverage, none of the 15 documentation findings, and no commerce work; the hermetic, no-database test suite CLAUDE.md argues for by name is the casualty | Its own author concedes roughly 80% of the port's value is banked in month 2 for 1.5 of its 13 engineer-months — the remaining 11.5 buy the last 20%, and nothing else ships while they're spent |
| **Java** | A build-time guarantee (ArchUnit) that every admin route carries the org-scoping guard, where today it's a convention with no automated check; by a wide margin the deepest backend hiring pool in India, which matters at a bus factor of one | Its own opening, most urgent defect claim was already fixed in the codebase five minutes before the document was written (A3); the minimum viable team after the port is *two* language specialists, not one generalist — it raises the hiring bar it was meant to lower | Stated as conditional on a hire that has not happened: the position's own words are that if a backend engineer isn't being hired in the next two quarters, "the correct decision is to not start" |

### A3. What the judges found

Two judges scored the same three positions independently, reading each against the actual repository. Both reached the same ranking and the same winner:

| Position | Judge 1 | Judge 2 |
|---|---|---|
| Stay | 8 / 10 | 8 / 10 |
| Go | 5 / 10 | 5 / 10 |
| Java | 4 / 10 | 4 / 10 |

Both judges credit Go with the sharpest engineering diagnosis of the three — the runtime really is scattered across Vercel crons, GitHub Actions, PostgREST, and per-process memory, and that's verified, not asserted. Both credit Java as the most intellectually honest document of the three: it argues, correctly, that Startup India's grant criteria never score backend language, and states outright that its own case defeats itself on timing. Both mark Java's central urgency claim false. What each judge specifically disbelieved:

- **Java's opening claim was stale by one commit.** The document states `listPhotosForCatalogue` "takes no options parameter at all" and that "every photograph is visible to guests... in production, right now." At the commit that was actually HEAD (`7730633`, "Guests saw unpublished photographs on the Supabase driver"), the method already takes `options?: { liveOnly?: boolean }` and applies the filter — fixed roughly five minutes before the document was written. The *titles* half of the same bug is still live today (`lib/db/supabase-repository.ts:1390–1392` filters on `published`/`status`, never `live_at`) — so a real defect remains — but Java's most urgent sentence, the one its whole opening argument rests on, was not true when written.
- **Stay undercounted severity in its own favour.** It claimed "exactly two [findings] are high severity, and they are the same root cause." Counted directly against the severity field in the four underlying review files, **three** verdicts carry high severity, not two — and they are not one root cause: two of them are the publish-gate bug, caught independently by the maintainability and scalability lenses, and the third is the GitHub Actions scheduler that disables itself after 60 days without a commit, which is the finding both rival ports lead their case with. Merging the duplicate pair is what produces the "2 high" figure [02](02-codebase-assessment.md) reports, and that merge is legitimate — but Stay quoted the merged number while also claiming a single root cause, which is the part that is wrong. (The full reconciliation: 49 raw verdicts at 3 high / 21 medium / 25 low, six duplicate pairs merged, giving 43 distinct entries at 2 high / 18 medium / 23 low.) Stay's plan does fix the scheduler (its item R5), so the recommendation survives the correction; the tally offered as supporting evidence does not.
- **Stay's caching claim doesn't hold.** Its plan proposed making the guest page "actually cached" in six days. The codebase's own comment (`lib/catalogue-cache.ts:13–17`) already explains why not: whether a guest may see a catalogue depends on a passcode-grant cookie, and "a page cached across guests could not answer" that. Moving locale off a cookie gets *non-passcode* catalogues to static rendering; it does not get "the guest page," as claimed, there. Go's correction — not ISR-cached today, and not fully reachable — is the accurate one, and both judges adopted it.
- **Go's headline number was never priced against its cheap alternative.** Go prices its month-2 step — moving all six background jobs off the two-cron-limited GitHub Actions dependency — at "about 80% of the port's value" for 1.5 of its 13 engineer-months. Neither judge disputes the value; both note Go never prices the far cheaper route to the same result: Vercel Pro is $20/month (roughly ₹1,900) and six lines in `vercel.json`, an afternoon, not a person-quarter.<sup>[S12](#sources-for-b)</sup>
- **Component and file counts were off in both port documents.** Go says "64 of 70 components are client-rendered"; Java says "59 of 70." The denominator is 75 in both. Neither error changes a conclusion, but both are the kind of number a diligence reader checks first, and Java's is further off.

### A4. Decision

**Stay on TypeScript. Do not rewrite in Go or Java, now.**

Rationale, following the judges' own weighting:

- Time-to-revenue and 12-month delivery risk carry the most weight, and both point the same way. Stay's first slice ships in week one; the cost of being wrong is one sprint. Both rewrites concede this against themselves — Go's own words are that a stalled port "finishes in month 8 exactly where month 0 was... minus the Razorpay integration that would have made the thing a business." Java states outright: "nobody should do this at 6 orgs and 5 catalogues pre-revenue."
- On 3-year maintainability the rewrites score real points, but the specific guarantee they're selling — a compiler that cannot let a driver bug reach production — is buyable inside TypeScript in **about a week**: a shadow-read (1–2 days, and it needs staging to exist first), generated Supabase types against the ~20 hand-written column maps (1–1.5 days, [02 M1](02-codebase-assessment.md)), and a conformance suite run against both drivers (2–3 days, [02 §3 H1](02-codebase-assessment.md)) — **5–7 days summed from 02's own per-item estimates**. The panel argued this as "about 10 days"; that is the outside end of the same range with slack, and the reconciled figure used throughout this folder and in [06 N-90](06-what-changes-next.md) is *about a week*. Either way, paying 9–18 months for a guarantee available in under two weeks doesn't clear the bar.
- On hiring, Java's point is real and Stay has no answer to it: the bus factor is one, and Next.js App Router / RSC / a hand-rolled repository is a narrower hiring pool in India than Spring. But it's the lowest-weighted criterion here, and Java's own cost section undercuts its own case — the team the port needs afterward is *two* specialists, not the one generalist it was meant to replace.
- On grants, it's a wash, settled by primary sources rather than argument (see [04-startup-india.md](04-startup-india.md)): DPIIT recognition tests entity type, age and turnover; the Startup India Seed Fund Scheme scores eight criteria set by the incubator. Backend language appears in none of them.

**One caveat on adopting this uncritically.** The winning position is also the most self-flattering of the three in its own framing — it understated the severity count (A3), and its six-day caching claim doesn't survive contact with the codebase's own design comment. Adopt the plan; don't adopt its account of how finished the codebase already is. Both judges independently proposed the same correction: run Go's *shadow-read* (call both drivers on every read, log every divergence, change nothing user-facing) before building a full conformance suite — it's the cheapest possible test of whether the two-driver design is still producing real bugs, and it is exactly the technique that would have caught the `live_at` bug before a guest saw it.

**In practice.** The refactor itself — which findings, in what order, at what cost — is [02 §7's remediation plan](02-codebase-assessment.md); it is not repeated here. What both judges add on top of that plan, worth folding in rather than treating as optional:

1. Run the shadow-read before the conformance suite — cheap, and it's the actual test of whether Stay's diagnosis of the codebase is correct. **It has a prerequisite neither judge priced: it runs in staging, and staging does not exist** ([02 M9](02-codebase-assessment.md), already tracked as N-87 — one day plus two free accounts). Build that first or the sequence cannot start.
2. Generate the Supabase column-map types (`supabase gen types typescript`) before hand-writing tests for them — about 2 days, and it closes the exact class of bug both rewrites are asking 9–18 months to fix.
3. Make the org-scoping rule in `lib/admin/session.ts` a structural check across every `app/api/admin/**` handler, not a hand-picked list of guard names grepped from a subset of routes. Java's instinct here (compile-time enforcement) is right even though the language change it comes wrapped in is not needed to act on it.
4. Name a stop date. Both judges flag that the refactor plan has no end condition. If its most urgent items aren't landed inside roughly 8 weeks, stop the sprint and move whatever's left onto the normal backlog, rather than letting a "debt sprint" quietly become the new steady state.

### A5. Triggers that would reopen this decision

Numbers, not feelings — pulled from the rewrite positions' own trigger lists, since they thought hardest about when they'd be proven right:

| Trigger | Why it would flip the decision |
|---|---|
| Sustained volume above ~150 weddings/month | The 10-second progress heartbeat and the nightly usage rollup both scale with concurrent guests; the Go case puts the point where a rented long-lived process beats metered invocations around here |
| Approaching ~300 weddings/month | `docs/SCALE-PLAN.md §3`'s modelled Vercel function-invocation ceiling. Even then, the judges' own grafted advice is a small Go or Rust service for the two hot paths (the heartbeat, the playback-token mint) behind the interfaces that already exist — not a whole-app port |
| A second confirmed driver-parity bug reaches production after the conformance suite is in CI | One bug is a mistake, already shipped and fixed; a second, after a suite exists specifically to catch it, means the seam design itself — not its instrumentation — is unsafe, and the rewrite case stops being merely strong |
| A second and third engineer join who are Go- or Java-native and cannot become productive in this codebase after a two-week onboarding | Today the population is one founder plus an agent, and both are productive in it — untested claim either way, not a refuted one |
| The refactor completes, `pnpm verify` is honestly green, staging exists, and shipping a normal feature still takes longer than a week | That falsifies the "it's debt, not architecture" diagnosis this whole decision rests on |
| Vercel or Supabase pricing or platform terms move materially against today's numbers | The infra arithmetic in A2 is a few thousand rupees a month apart between options and isn't robust to a 2× move in either platform's pricing |

### A6. Migration path, if this is ever reversed

This decision is cheap to get wrong because the port's own specification already exists in the code today, independent of which language is eventually chosen:

1. `lib/db/repository.ts` is a 404-line interface with the semantics written as doc comments — the contract a Go or Java service would have to satisfy, already on paper.
2. Freeze it: generate an OpenAPI contract from the 61 route files under `app/api`, generate a TypeScript client from that contract, and introduce a third `Repository` implementation that speaks HTTP to a new service with zero methods implemented yet. Nothing in `app/` or `components/` changes at this step.
3. Shadow the read path first, before anything routes to the new implementation — the same shadow-read technique from A4, reused here as migration step one rather than a one-off diagnostic.
4. Move the six background jobs (`lib/jobs/run.ts:49–55`) behind the new service first, if at all — it's the one boundary every position agreed is structurally real, because Publish and Handover each touch five-plus tables in one transaction and nothing else in the app cuts as cleanly. See §C below for why this is the only service seam worth drawing.
5. Everything after that follows the losing positions' own migration paths unchanged: admin routes behind a per-route flag, the guest read path and signed URLs last, `lib/db` removed from Next only once the new service passes the same test suite it's replacing.

None of this is scheduled — it's recorded here so that if a trigger in A5 fires, the answer to "how long would this take" is a costed plan already on file, not a fresh estimate made under pressure.

---

## B. Should Mehfilbox build its own video transcoding and delivery?

### B1. Context

All video today goes through Bunny Stream behind one seam, `lib/video/provider.ts` — five methods (`createUpload`, `getPlaybackToken`, `getStatus`, `getAssetUrl`/`getDownloadUrl`, `getUsage`, `verifyWebhook`), 151 lines, and its own header states the intent plainly: "Switching from Bunny to Cloudflare is a new implementation of this interface and one line in `lib/video/index.ts`." That sentence is what makes this a genuine build-vs-buy question rather than a lock-in question — the seam to swap through already exists, and it's already exercised by a second, complete implementation (`lib/video/fake.ts`) that CI runs against on every commit.

The question has a sharper shape than "should we self-host video," because Bunny is actually three separable things: ingest (TUS uploads), transcode-and-storage (the encoding ladder, thumbnails, and where the bytes sit), and delivery (the CDN that gets bytes to a guest's phone in India). Every position argued below agrees on delivery: Bunny's Standard tier — 119 PoPs with real India presence, at $0.030/GB for Asia & Oceania — is not beaten by any self-serve alternative researched.<sup>[S1](#sources-for-b)</sup> Cloudflare's own policy restricts self-serve video delivery through its CDN to its paid Stream product;<sup>[S3](#sources-for-b)</sup> AWS CloudFront's India rate is roughly 3.6× Bunny's ($0.109/GB in the first paid tier, against $0.030).<sup>[S5](#sources-for-b)</sup> So the real question is narrower: **ingest, transcode and storage — own them, or keep paying Bunny for all of it, and keep Bunny as the CDN either way?**

| | |
|---|---|
| Today's Bunny bill | ₹7,534/month at 10 weddings/month, list price |
| Bunny as a share of revenue at the 6-month target | 9.0% of ₹3,30,000 — smaller than the Vercel Pro + Supabase Pro line in the same table, **₹25,785 over six months** (≈₹4,300/month), inside a ₹55,474 six-month infrastructure total (`docs/SCALE-PLAN.md:26-36`; the column header there is "Six months," and the ₹4,300/month is also where §A2's "+₹4,300 over today" comes from). Read as a monthly figure, ₹25,785 overstates the fixed floor six-fold. |
| What "build" would actually replace | Ingest (TUS), the encoding ladder, object storage, signed-URL minting, usage metering — never delivery, which stays on Bunny's CDN in every position argued |
| Two Bunny *settings* already costing more than the pipeline's language | Keep-originals + MP4 fallback are ON, library-wide (`lib/video/bunny.ts:198-201`), inflating stored bytes roughly 3–4× a ladder-only model; the Cinema plan's 4K allowance is unenforced in code — nothing under `lib/`, `app/`, or `components/` references `2160`, `1440`, or `enabledResolutions` (grepped 16 Sep 2026) |

**Photographs are the same vendor, and are outside every number below.** Bunny carries four separate dependencies for Mehfilbox, not one: video transcode, video CDN, **photo origin** (Edge Storage, written through the app because the zone's write password cannot go to the browser — `lib/photos/provider.ts`, `app/api/admin/catalogues/[id]/photos/route.ts:19-31`) and **photo CDN** (a public pull zone, `lib/photos/bunny.ts:34`). B2's vendor-concentration row counts all four; the shared cost model, the option table, the scale table in B3 and the reversal path in B7 all price **video only**. Three consequences, stated rather than buried: (1) "falls from four Bunny dependencies to one" in B2 is the *architectural* claim, not a claim the costed build replaces the photo halves — it does not; (2) the photo zone is small relative to video (4 MB per photograph, capped) so excluding it barely moves the arithmetic, which is why it was excluded, but it means no figure here is a whole-vendor figure; (3) the one live production problem on the photo path — the pull zone has no token authentication at all, so a photo URL copied out of a passcode-protected wedding returns 200 forever (N-83, [01 §12.6](01-master-project.md)) — **is a Bunny dashboard setting plus a signing call, not a build-vs-buy question**, and is not solved, worsened or touched by anything decided in this section. Fix it independently of B5.

Two positions argued this — **buy** (stay on Bunny, harden the seam) and **build** (own the origin, keep Bunny as the edge) — against a shared cost model (`cost.json`) that both cite and neither disputes.

### B2. The options, compared

| | Buy (harden the seam) | Build (own origin, borrowed edge) |
|---|---|---|
| Engineer-months | 1.5 | 5 |
| Calendar time | ~3 months | ~4 months |
| New infra, as quoted | ~₹11,800/month | ~₹48,900/month, quoted **at 60 weddings/month** |
| What it removes from the Bunny bill | Nothing — it caps the two costly settings at the source instead of switching vendor | Storage and 4K-encoding; delivery stays on Bunny in both options |
| Vendor concentration | Unchanged — Bunny stays transcode + CDN + photo origin + photo CDN at once | Falls from four Bunny dependencies to one (delivery only) |

Neither infra figure is apples-to-apples as quoted, and that matters more than the numbers themselves. Buy's ₹11,800 does not reconcile to any single scenario in `cost.json` (flagged by the judge as unexplained). Build's ₹48,900 is quoted at 60 weddings/month — six times today's actual ~10/month target — and the position concedes in its own words: "below about 40 weddings/month this decision is straightforwardly wrong." Both figures also omit the cost that actually decides the question: people (B3).

| Option | Strongest benefit | Real cost or loss | Sharpest risk |
|---|---|---|---|
| **Buy** | Zero build cost, zero new ops headcount — the existing reconcile cron and hourly synthetic probe already cover Bunny's failure modes; the seam is proven, not asserted, since a complete second driver (`lib/video/fake.ts`) already exists and runs in CI on every commit | Per-catalogue delivered bytes stay an estimate forever — `watchSeconds × 2.15 GB/hr`, a constant marked a placeholder in the code itself (`lib/entitlements.ts:119-131`). Bunny reports bandwidth only per pull zone, never per video, so this loss is permanent regardless of how the seam is hardened | The Bunny webhook target is an account-key-gated dashboard field nothing in the repository can read, verify, or change — it already caused one real production incident at the second-pass domain switchover |
| **Build** | Makes per-plan storage retention possible — Bunny's keep-originals is one library-wide toggle, not a per-plan one — and makes delivered-GB genuinely measured instead of estimated; turns the webhook from an unverifiable dashboard field into an env var `preflight` can assert | Loses the ladder-only comparison outright — ₹48,900 vs Bunny's ₹45,207 at 60/month, a ₹3,700 *loss* — and wins only if keep-originals is confirmed on and the stored-bytes multiplier is real rather than assumed | Neither storage candidate (Backblaze B2 or Hetzner) has an Indian origin — a cold-cache first play could be *slower* than Bunny's Singapore origin, directly threatening the Phase 0 "1.5 seconds on 4G" bar the whole product is defined by |

### B3. The cost model across scale

One shared model (`cost.json`; FX ₹95.72/USD and ₹110.94/EUR, priced 14–15 Sep 2026)<sup>[S11](#sources-for-b)</sup> both positions cite and neither disputes. Every vendor price feeding it is listed with its URL under [Sources for §B](#sources-for-b) below, because that model file lives in a session-local scratchpad and this document has to stay checkable without it:

| Weddings/month | Bunny (list) | Self-hosted infra only | + realistic people cost | Self-hosted total |
|---:|---:|---:|---:|---:|
| 10 (today's actual target) | ₹7,534 | ₹17,044 – 19,971 | +₹35,000 | ₹52,044 – 54,971 — **7.3× Bunny** |
| 60 | ₹45,207 | ₹36,944 – 54,508 | +₹70,000 | ₹1,06,944 – 1,24,508 — **2.4–2.8× Bunny** |
| 300 | ₹2,26,034 | ₹1,61,593 – 2,49,416 | +₹2,00,000 | ₹3,61,593 – 4,49,416 — **1.6–2.0× Bunny** |
| 1,000 | ₹7,53,446 | ₹3,85,908 – 6,78,654 | +₹4,00,000 | ₹7,85,908 – 10,78,654 — Bunny still cheaper, by ₹32,000 to ₹3.25 lakh |

**No breakeven exists inside this range once people are counted.** Infra-only crossing needs roughly 900–1,000 weddings/month on the cheaper storage stack (Cloudflare R2). A widely quotable "~50–60 weddings/month" breakeven, using Backblaze B2 storage plus Cloudflare's CDN, turns out to rest on Cloudflare's own self-serve terms permitting video delivery — which its policy page says they do not. Price delivery honestly at Bunny's own rate instead, and that breakeven moves from ₹36,944 to roughly ₹48,900 — *above* Bunny's ₹45,207 at the same 60/month scale. This is the single most important correction made to the numbers either side quotes; treat any "self-hosting breaks even around 50–60 weddings/month" claim as this error resurfacing.

Per-wedding unit economics at list price: Bunny's marginal cost is $7.87 (≈₹753) — roughly $3.80 storage, $2.57 delivery, $1.50 4K encoding. Delivery is the one line no self-hosted alternative beats. 4K encoding is the one line self-hosting removes cleanly — and it's also the one line that is currently unenforced and uncapped in the product today, regardless of which side of this question wins.

### B4. What the judge found

One judge scored both positions against the code:

| Position | Score |
|---|---|
| Buy (harden the seam) | 8 / 10 |
| Build (own origin, borrowed edge) | 5 / 10 |

The judge calls Build "much the better-argued of the two, and the only honest version of 'build' on the table" — it leads with its own loss at the ladder-only comparison, concedes the grants argument is worth zero outright, and refuses to also fight for owning the CDN, which no self-serve alternative wins on price. But the verdict is Buy, and the winning write-up is explicitly a hybrid: harden the seam now, and design it toward Build's target architecture — per-plan retention, measured delivery, a webhook Mehfilbox controls — so the option to build later stays open and gets cheaper if it's ever exercised. What the judge specifically disbelieved:

- **Build's central number is quoted at six times today's actual volume.** It repeatedly frames 60 weddings/month as "the scale the six-month plan actually targets," when `docs/SCALE-PLAN.md` states the six-month plan is 60 weddings *over* six months — about 10/month. At the volume that actually exists, Build loses 2.6× on infrastructure alone and 7.3× including the cheapest honest ops cover, and the position's own text concedes as much elsewhere: "below about 40 weddings/month this decision is straightforwardly wrong."
- **Build's strongest financial leg is self-defeating.** Its own risk section admits the ₹25,000/month storage argument can be tested for free — read the real stored bytes from the Bunny account API, an afternoon's work — and that the trade-off it claims this forces (breaking the "originals downloadable untouched" promise) is weaker than argued, since the code already anticipates that setting being turned off.
- **Both headline infra figures are unreliable as quoted** — see B2's caveat. Buy's ₹11,841/month doesn't reconcile to any single number in `cost.json`. Build's ₹48,900/month omits the ₹70,000/month of headcount the same document calls decisive elsewhere: the number presented as "the cost" is not the cost.
- **A widely quotable breakeven figure (~50–60 weddings/month) is an artefact of an assumption the source itself rules out** — see B3. Both positions and the underlying cost model repeat this before the fact-check catches it.
- **Buy's "zero ops headcount" claim rests on a probe that stops one step short by design.** `app/api/cron/synthetic/route.ts:29-31` deliberately checks only that a playback token mints, not that a guest can actually watch a segment — so a Bunny edge fault on a wedding evening is invisible to Mehfilbox's own alerting today. That's a choice, not the absence of a risk, and the judge credits Build for finding it.

### B5. Decision

**Stay on Bunny. Do not build a transcoding pipeline now.** Harden the `VideoProvider` seam and fix the two Bunny settings already costing more per month than a provider change would save — but design the hardening toward Build's target architecture, so the option isn't foreclosed if the numbers move.

Rationale:

- The volume argument is decisive on its own. Build's entire financial case is built at 60 weddings/month; the actual target for the next six months is ~10/month, a volume at which the position's own document calls the decision "straightforwardly wrong."
- The headcount argument is decisive independently of volume. No scenario in the shared cost model breaks even once one on-call person is priced, anywhere from 10 to 1,000 weddings/month (B3). If an SRE is ever hired for reasons that exist regardless of this decision — and the Supabase, Vercel, six-cron, and wedding-night on-call surface suggests one eventually will be — their first project should be the confirmed production defects in [02](02-codebase-assessment.md), not an FFmpeg pipeline.
- Every real benefit Build claims is reachable from the existing seam at a fraction of the cost. Per-plan retention is an object-storage archive step behind `getDownloadUrl`, no transcoder required. The 4K allowance is one `enabledResolutions` parameter set at upload time from the catalogue's plan, not a vendor replacement. Measured delivery is a genuine, permanent gap that only owning the origin closes — but it's worth roughly one engineer-month of client-side instrumentation and waiting for an actual billing dispute, not five engineer-months of pipeline, to address.
- The Startup India grants angle argues against building, not for it — see [04-startup-india.md](04-startup-india.md). Build's own research supplies the most useful sentence on this question in either document: an in-house transcoder scores zero on all eight of the Seed Fund Scheme's evaluation criteria, and the Scheme's own guidelines bar using seed funding to build in-house infrastructure at all.

**What to do now**, adapted from both positions' migration paths:

1. **This week — measure, don't assume.** Sum `storageSize` across the live Bunny library (a field `getUsage` already returns) and compare it against the ladder-only model. The entire ₹25,000/month "keep-originals is costing you" argument depends on this number, and nobody has read it yet.
2. **Wire the exit ramp that's already half-built.** `titles.provider` is persisted per row (`lib/schema.ts:436`) and seed data already writes `'fake'` to it, but `getVideoProvider()` in `lib/video/index.ts` takes no argument — nothing dispatches on it. Roughly ten lines turns any future migration from a big-bang cutover into a per-upload one, where old films keep serving from Bunny indefinitely. Worth doing regardless of how B5 is decided, because it's what keeps the decision cheap to reverse.
3. **De-leak the two provider assumptions that have already escaped the seam.** `modules/curated-row/Guest.tsx:27-29` hard-codes `'preview.webp'` because Bunny happens to write one; `components/streaming/useHlsPlayback.ts:123-136` re-appends a token to child URLs in a way coupled to Bunny's specific signing shape. Both are small fixes now and a two-week debug later.
4. **Cap the 4K allowance, and decide keep-originals** in whichever direction the week-1 measurement supports. These two items are worth more per month than the entire build-vs-buy question either way.
5. **Make `scripts/verify-bunny-playback.ts` driver-agnostic** and run it against `FakeVideoProvider` in CI, so "a self-hosted driver is a new implementation and one line" stays a tested claim rather than an asserted one, whether or not it's ever exercised.

### B6. Triggers that would reopen this decision

| Trigger | Why it would flip the decision |
|---|---|
| Sustained volume above ~40–60 weddings/month, **and** a decision to hire an SRE for reasons independent of this project | Below ~40/month the fixed floor of even a two-box pipeline exceeds the whole Bunny bill; without a hire already justified on other grounds, the headcount line alone eats any saving |
| The week-1 measurement (B5, item 1) shows real stored bytes near 100–130 GB/wedding, not the ~32 GB ladder-only figure | Confirms the storage argument is real rather than assumed, and moves per-plan retention from "worth doing eventually" to the largest single cost lever available |
| Premium 4K encoding spend exceeds roughly ₹50,000/month | The one line self-hosting removes cleanly — but only once it's actually enforced and metered, so the figure is real rather than a policy estimate |
| A studio or guest disputes a delivered-GB figure, or a plan is ever priced on delivered bytes | Bunny structurally cannot supply real per-catalogue bandwidth; a self-hosted origin can. Until a bill is disputed, this is a correctness nicety, not a commercial one |
| Bunny raises storage pricing above ₹1.14/GB-month (a 20% rise) | `docs/PRICING.md` states this erases the long-term Cinema plan's margin outright — revisit on the announcement, not after the invoice |
| A contract or regulation requires video origin storage inside India, or DRM / forensic watermarking | Neither is buyable from Bunny today at any price |
| Two consecutive Bunny incidents reach a wedding audience | The trigger is customer-visible impact, not an uptime dashboard's colour |

### B7. Migration path, if this is ever reversed

Because step 2 in B5 (wiring `titles.provider` dispatch) is being done regardless of this decision, the reversal path is short and already de-risked:

1. Build `SelfHostedVideoProvider` against the unchanged `VideoProvider` interface — own origin (TUS ingest, FFmpeg ladder, object storage), Bunny kept as the CDN pull zone in front of it, exactly as Build's architecture proposed. Run the now-driver-agnostic playback-verification suite against it until green.
2. Prove it on the demo catalogue first: point the demo slug at the new provider and measure first-play time on an actual 4G handset against the 1.5-second Phase 0 bar, before anything guest-facing routes to it.
3. Route new uploads only — `titles.provider = 'self'` per catalogue — while every existing film keeps serving from Bunny. No flag day, no bulk migration on the critical path.
4. Backfill the existing archive only once egress-out-of-Bunny is cheaper than the Bunny storage bill remaining on it — a calculation that gets *more* favourable the longer this is deferred, since exit cost scales with however much has accumulated by then (roughly ₹11,000 today; roughly ₹3.3 lakh at 300 weddings/month, per Build's own estimate).
5. Keep the Bunny library live and paid for 60 clean days after cutover as the rollback, then decommission it.

---

## C. Decomposition without a rewrite

Both ADRs above land on the same conclusion for a different reason: not "never change the architecture," but "the codebase is already built as swappable pieces behind narrow interfaces, and that gets almost everything a rewrite promises at a fraction of the price." Seven such seams already exist, each already selected by one environment variable, each already with at least two real implementations:

| Seam | Interface file | Size | Drivers today | Selected by |
|---|---|---:|---|---|
| Persistence | `lib/db/repository.ts` | 404 lines, 103 methods | `memory`, `file`, `supabase` | `DATA_DRIVER` (`lib/env.ts:48`) |
| Video | `lib/video/provider.ts` | 151 lines, 5 methods | `fake`, `bunny` | `VIDEO_DRIVER` (`lib/env.ts:64`) |
| Notifications | `lib/notify/provider.ts` | 62 lines, 1 method | `fake`, `resend` | `NOTIFY_DRIVER` (`lib/env.ts:100`) |
| Photos | `lib/photos/provider.ts` | 39 lines, 3 methods | `bunny`, `fake` | `PHOTO_DRIVER` (`lib/env.ts:105`) |
| Custom domains | `lib/domains/provider.ts` | 83 lines, 2 methods | `none`, `fake`, `vercel` | `DOMAIN_DRIVER` (`lib/env.ts:127`) |
| Authentication | `lib/admin/auth-provider.ts` | interface at line 24 | `local`, `supabase` | `AUTH_DRIVER` (`lib/env.ts:161`) |
| Captcha | `lib/captcha/config.ts` + `verify.ts` | 61 lines (`verify.ts`) | `none`, `fake`, `turnstile` | `CAPTCHA_DRIVER` (`lib/env.ts:170`) |

Every one of these headers states the same intent in nearly the same words — the current provider is "a default, not a lock-in," and a new driver is "a new implementation of this interface and one line" in that seam's own `index.ts`. That claim is already exercised, not just written down: `lib/video/fake.ts` and `lib/db/memory-repository.ts` are complete, non-trivial second implementations that CI, the Playwright suite, and an offline planner demo all run against today. This is what decomposition already looks like in this codebase — by interface, not by network hop.

Module types follow the identical pattern one layer up. `modules/registry.ts` is the one place a module (billboard, timeline, letter, and six others) is wired in — one import and one map entry per module — and `tests/unit/registry.test.ts` enforces that nothing outside `modules/` ever names a module type. Adding a module is "one folder plus one registry line," which is the premise the `add-module` skill is built on, and the reason the Java port position (A2) named splitting this specific contract across two languages as the single largest architectural loss a rewrite would cause.

### If a real service boundary is ever needed

Both port positions in Part A looked hard for a seam worth pulling into an actual second process, and converged on the same answer from opposite directions: there is exactly **one** boundary in this codebase that is structurally real, and it is neither "front end vs back end" nor "guest reads vs admin writes" — the guest read path is just a cache over the admin write path's own rows (`lib/catalogue-cache.ts`), and splitting the two means inventing a cache-invalidation protocol to replace what is currently a function call.

The boundary that is real is **request-driven work vs. scheduled work** — API handlers on one side, the six background jobs already registered in one place on the other:

```
lib/jobs/run.ts:49-55
  notify      — drain the notification queue, every 15 min
  synthetic   — hourly guest-path health check
  reconcile   — daily, settle anything a Bunny webhook missed
  usage       — daily usage rollup
  lifecycle   — daily lapse ladder
  warnings    — daily expiry warnings
```

Why this split is real and the others aren't: the two operations that touch the most tables in one transaction — Publish (`publishCatalogueContent`, `lib/db/repository.ts:116`, which moves catalogues, titles, photos and notifications together) and Handover (orgs, operators, catalogues and transfers together) — both belong entirely to the request-driven side. Any boundary drawn *through* either operation turns one database transaction into a distributed one, with a saga and a compensating-write story that a product with 5 catalogues does not need. A boundary drawn *around* the six scheduled jobs cuts through nothing.

If this is ever worth doing — the triggers are the same ones named in A5 and B6, roughly the point where Vercel's function-invocation ceiling or the GitHub Actions scheduling dependency actually costs a customer something — it would look like:

- A second long-lived process, not a second codebase, importing the same `Repository`, `VideoProvider`, and `NotificationProvider` seams listed above, doing nothing but running the six jobs on its own internal scheduler behind a Postgres advisory lock, so two replicas can't double-drain the same queue.
- No new interface to design — the seven seams above are already the contract; a worker process consumes them exactly as `app/api/cron/*` does today, from a process that simply doesn't disappear at the end of a request.
- A cheaper first step, worth naming because [02 §7](02-codebase-assessment.md) already recommends it independent of this question: Vercel Pro removes the two-cron ceiling that pushed four of these six jobs onto a GitHub Actions schedule that disables itself after 60 days of repository inactivity — for $20/month (about ₹1,900) and an afternoon,<sup>[S12](#sources-for-b)</sup> against the Go position's own estimate of 1.5 engineer-months to reach the same outcome by porting (A3).

None of this argues for building a worker service now. It argues that the seams which would make one possible already exist, are already tested, and need neither Go nor Java nor a rewrite to use.

### The third branch of the original question: leaving Vercel and Supabase entirely

Sandeep's question included "decompose and build everything ourselves," and §A answers the language half, §B the video half, §C the service-boundary half. The remaining branch — **self-hosting the application itself, off Vercel and off Supabase** — is closed here, briefly, because the answer is short.

The exit exists on paper and is untested. `Dockerfile` is the documented anti-lock-in story and **is never built in CI**; it was last touched on 2026-08-14 and has drifted roughly eighteen migrations behind head ([02 §3](02-codebase-assessment.md), Deployability table). More importantly, the platform's value here is not the Node process — it is the **six scheduled jobs and four GitHub Actions workflows** wrapped around it, and a container deploy replaces none of them: `docs/DEPLOYMENT.md §10` names only the two Vercel crons as "what you lose and must replace," so a literal Docker deploy following that section would never drain notifications, never run the lapse ladder, never queue warnings and never fire the synthetic check, with no error anywhere pointing at the gap (`map-media-infra.md` §7 item 7). The cost side does not rescue it either: the fixed floor being escaped is Vercel Pro plus Supabase Pro at roughly ₹4,300/month combined (B1), against an engineer's time to build and then operate a replacement for managed Postgres, managed TLS, edge routing and preview deploys — for a product that has 5 catalogues and no revenue. **Recommendation: don't, this year.** Keep the Dockerfile as insurance and make it honest by building and health-checking it in CI once (3 hours, already on 02's low-severity list); revisit only at the trigger 02 names — an actual PaaS migration decision, not before.

---

## Decisions this asks of Sandeep

| Decision | Recommended default | Why |
|---|---|---|
| Approve "stay on TypeScript, no Go or Java rewrite" as the backend architecture for at least the next 12 months? | Yes | Both independent judges scored this 8/10 against 5/10 and 4/10 for the two rewrites, on the same evidence; the rewrites' own advocates each conceded their case loses on timing at this scale (A4) |
| Approve "stay on Bunny, no in-house transcoding pipeline" for the same period? | Yes | No scenario in the shared cost model breaks even once one on-call person is priced, at any volume from 10 to 1,000 weddings/month; the build case's own numbers are quoted at six times today's actual target (B5) |
| Run the one-afternoon measurement of real stored bytes on the live Bunny library this week, before any retention or pricing decision is made? | Yes, this week | The entire ₹25,000/month "keep-originals is costing you" argument depends on a number nobody has actually read yet (B5, B6) |
| Is "originals downloadable untouched" a load-bearing promise for the Keep and Cinema plans, or can `keep-originals` simply be switched off on Bunny for an immediate saving? | We do not know — this is Sandeep's call, not a technical one | It's already stated as a promise on the landing page and in `PRICING.md`; treat it as load-bearing by default and solve storage cost through the B2 archive path (B5, item 4) rather than quietly withdrawing it |
| Fold the judges' grafted items — the shadow-read, generated Supabase types, a structural org-scoping check, the already-half-built per-row video-provider dispatch, and de-leaking the two provider assumptions in `curated-row` and `useHlsPlayback` — into the near-term backlog now, rather than leaving them as someday items? | Yes | Each is a day or two of work, each closes a gap a 9-to-18-month rewrite or a 5-engineer-month pipeline was being proposed to close instead (A4, B5) |
| Set an explicit stop date on both hardening efforts, so neither becomes a permanent, un-ending "sprint"? | Yes — roughly 8 weeks for the refactor items in [02 §7](02-codebase-assessment.md); the video-seam list in B5 is 5 items, sized in days | Both judges flagged the same failure mode independently: a debt sprint with no stated end condition is how a codebase starts feeling unmanageable in the first place |

---

## Sources for §B

Every external price and policy fact §A and §B rest on, with the date it was checked. These were carried by the shared cost model (`cost.json`, 35 entries); they are reproduced here because that file is session-local and this folder has to stay checkable on its own. Anything not listed here is a claim about this repository, cited to a file path in the text.

**Bunny — the incumbent**

- **S1** — Bunny CDN Standard tier: **119 PoPs**, Asia & Oceania **$0.030/GB**; Volume tier (10 PoPs) $0.005/GB — checked 15 Sep 2026 — <https://bunny.net/pricing/>
- **S2** — Bunny Stream: storage $0.01/GB-month, standard encoding free, premium 2160p/1440p $0.150/min, $1 minimum; Edge Storage $0.01/GB HDD, $0.02/GB SSD, **Mumbai region listed as "planned"** (which is why B2's cold-cache risk is real) — checked 15 Sep 2026 — <https://bunny.net/docs/stream/pricing> · <https://bunny.net/pricing/storage/> · <https://bunny.net/stream/premium-encoding/>

**Cloudflare — the assumption the "~50–60 weddings" breakeven rested on**

- **S3** — Cloudflare's own policy page: delivering video through the CDN on a self-serve plan is restricted to Stream / Stream Delivery — checked 15 Sep 2026 — <https://developers.cloudflare.com/fundamentals/reference/policies-compliances/delivering-videos-with-cloudflare/> (background, May 2023 ToS change: <https://blog.cloudflare.com/updated-tos>)
- **S4** — Cloudflare Stream at $5/1,000 min stored and $1/1,000 min delivered — rejected in the model at roughly ₹67 per wedding-month in storage alone — checked 15 Sep 2026 — <https://www.cloudflare.com/plans/>; R2 Standard $0.015/GB-month, egress free — <https://developers.cloudflare.com/r2/pricing/>

**The alternatives priced against Bunny**

- **S5** — AWS CloudFront India: first 1 TB free, then **$0.109/GB**, $0.085, $0.082 by tier — checked 15 Sep 2026 — <https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/>; AWS Elemental MediaConvert rates — <https://aws.amazon.com/mediaconvert/pricing/>
- **S6** — Backblaze B2 at **$6.95/TB-month**, egress free to Cloudflare and bunny.net under the Bandwidth Alliance — checked 15 Sep 2026 — <https://www.backblaze.com/cloud-storage/pricing>
- **S7** — Hetzner Object Storage €6.49/month base including ~1 TB, ~€6.47/TB-month thereafter, €1/TB egress, **EU regions only** — checked 15 Sep 2026 — <https://bex.co/blog/2026/09/11/hetzner-object-storage-tenant-backup-backend> · traffic terms <https://docs.hetzner.com/robot/general/traffic/> · compute pricing <https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/> · GPU (GEX44 €184/month) <https://bex.co/blog/2026/07/13/hetzner-gex44-gpu-pricing-break-even>
- **S8** — DigitalOcean (Bangalore region) droplets and Spaces — checked 15 Sep 2026 — <https://www.digitalocean.com/pricing/droplets> · <https://www.digitalocean.com/pricing/spaces-object-storage>; AWS S3 Mumbai ≈ ₹2.1/GB-month — <https://www.itforsme.in/pricing/aws-s3-india>
- **S9** — `tusd`, the reference TUS server a self-hosted ingest would use (open source, no licence cost) — <https://github.com/tus/tusd>

**The people line, which decides §B**

- **S10** — India 2026 salary ranges behind the ₹35,000–4,00,000/month on-call figures in B3: SRE average ₹11–14 LPA, mid-level DevOps ₹18–35 LPA at product companies — checked 15 Sep 2026 — <https://www.novelvista.com/blogs/devops/sre-engineer-salary-revealed> · <https://resources.instahyre.com/blog/devops-engineer-salary-in-india/>; monitoring floor (Grafana Cloud free tier, Better Stack from $29/month) — <https://monitoringcost.com/grafana-cloud-pricing> · <https://betterstack.com/pricing>

**Platform and FX**

- **S11** — USD/INR **95.72** on 14 Sep 2026 — <https://wise.com/us/currency-converter/usd-to-inr-rate/history>; EUR/INR 110.94 on 12 Sep 2026 — <https://www.exchangerates.org.uk/EUR-INR-spot-exchange-rates-history-2026.html>
- **S12** — Vercel Pro **$20/month**, and the cron-job limits that make it the fix for H2 (Hobby: 2 jobs per project, once daily; Pro: up to 100 per project, per-minute) — checked 16 Sep 2026 — <https://vercel.com/pricing> · <https://vercel.com/docs/cron-jobs/usage-and-pricing>

**Internal, for completeness** — the model also draws on `docs/SCALE-PLAN.md` §1–§3 and §5, `docs/PRICING-MODEL.md` §6, `docs/PRICING.md` §5, and the repository files cited inline throughout §B.
