# Evidence and Provenance

Every other document in this folder cites research files — `map-*.md`, `verify-*.json`,
`port-judge-1.json`, `port-judge-2.json`, `transcode-judge.json`, `cost.json`,
`strategy-*.json`, `factcheck.json` — that lived in a **session-local scratchpad** at
`scratchpad/15-sep/`. That directory is not part of this repository and will not survive the
session it was made in. This file exists so the conclusions stay checkable after it is gone.

**Two things to do before anything else in this folder is relied on.**

1. **Commit `docs/15-sep-finding/`.** As of 16 September 2026 the folder is untracked — it shows up
   under `git status` as `?? docs/15-sep-finding/` and nothing has been committed. Two decisions
   (D-45, D-47) are proposed for the decision log on the authority of files nobody will be able to
   open next week; the write-ups have to be in the repository before the decisions citing them are.
2. **Copy or re-derive anything from the scratchpad that a decision rests on.** The vendor prices
   and policy pages behind §B of [03](03-port-and-build-vs-buy.md) are already inlined there, under
   [Sources for §B](03-port-and-build-vs-buy.md#sources-for-b). The judges' scorecards and the
   verification tally are reproduced below. Nothing else in the scratchpad is load-bearing for a
   decision.

---

## 1. The three scored panels

Each panel worked the same way: independent written positions argued a case in full against the
actual repository, then one or more adversarial judges scored them against each other and against
the code. Scores are out of 10.

### Panel A — backend language (behind D-45)

**The strongest evidence in this set: three positions, two independent judges, same verdict by
different reasoning.**

| Position | Judge 1 | Judge 2 |
|---|---:|---:|
| **Stay** on Next.js/TypeScript, pay down the confirmed debt with a scoped refactor | **8** | **8** |
| Port the backend to **Go** — one binary in two roles (api, worker), same Postgres, as a strangler | 5 | 5 |
| Port the backend to **Java 21 / Spring Boot** behind the existing React front end, as a strangler | 4 | 4 |

Both judges' declared winner: *"STAY on Next.js/TypeScript and pay down the confirmed debt with a
scoped, shippable refactor."* Judge 2 adds a note worth keeping with the Go score: *"I score the
whole position, not its month-2 step. The month-2 step is the best idea in the pack and I have
grafted it"* — that step is moving the six background jobs off the GitHub Actions scheduler, which
is N-91.

What each judge independently reproduced against the repository, rather than taking on trust: the
four `no-restricted-properties` violations in `middleware.ts` that `pnpm lint` never sees; the
coverage figures to the decimal; **49 verdicts across the four `verify-*.json` files, all
`real: true`, exactly 26 carrying `matters_next_12_months: true`**; 14 runtime dependencies, 9
module types, 40 pages, `lib/catalogue-access.ts` at 88 lines, `lib/video/provider.ts` at 151.
What both disbelieved is in [03 §A3](03-port-and-build-vs-buy.md#a3-what-the-judges-found).

### Panel B — video transcoding (behind D-47)

**One judge, not two. Still a scored adversarial contest, but a single reading of it** — weigh it
below D-45 accordingly.

| Position | Judge |
|---|---:|
| **Buy** — stay on Bunny, harden the `VideoProvider` seam | **8** |
| **Build** — own the origin (tusd ingest, FFmpeg ladder, B2 storage, own metering), keep Bunny as a dumb CDN pull zone | 5 |

The judge's own summary of the loser is worth preserving, because it is unusually generous:
Build is *"much the better-argued of the two, and the only honest version of 'build' on the
table."* The verdict is still Buy, and the winning write-up in
[03 §B5](03-port-and-build-vs-buy.md#b5-decision) is explicitly a hybrid — harden the seam now,
shape it toward Build's architecture.

### Panel C — go-to-market (behind D-49, D-50, D-51)

**No judge at all.** Two of the three positions returned (studio-first and hybrid); the
client-direct position and both judges did not. The recommendation in
[05](05-market-and-differentiation.md) is the agent's own judgement, labelled as such in that
document. **Give D-49–D-51 the most of your own scrutiny** — they are a considered opinion, not a
verified verdict, and this is the one asymmetry in the folder that no amount of citation fixes.

---

## 2. The code-review tally, reconciled

Four adversarial review passes — maintainability, scalability, deployability, documentation — each
re-verified line by line by a second, skeptical pass. **Every one of the 49 verdicts came back
`real: true`.** Two counts are quoted in these documents and they are not the same count:

| | High | Medium | Low | Total |
|---|---:|---:|---:|---:|
| **Raw verdicts** (`corrected_severity` where the verifier gave one, the reviewer's otherwise) | 3 | 21 | 25 | **49** |
| **Distinct entries**, after merging six pairs that two lenses caught independently | 2 | 18 | 23 | **43** |

26 of the 49 carry `matters_next_12_months: true`. The high-severity pair that merges is the
publish gate (H1), raised by both the maintainability and scalability lenses; the third high is the
GitHub Actions scheduler (H2). Whenever one of these numbers appears, say which one it is — "49
findings, 2 high" is the error to avoid, because 49 cannot sum to 43.

**Security was not one of the four lenses**, so no number in this table covers N-83, N-85 or N-86.
See [02 §3a](02-codebase-assessment.md).

---

## 3. What the maps were, and what they are good for

Nine subsystem maps (`map-auth-security`, `map-client`, `map-commerce`, `map-guest`,
`map-media-infra`, `map-notifications`, `map-platform`, `map-studio`, `map-themes-customizer`) read
the whole product surface by surface against the code on `main`. They are the source for
[01](01-master-project.md) and for most of the gap items the code reviews did not raise, because
they asked a different question: *what does this actually do*, rather than *what is wrong with it*.

Where a map and the code disagree at `HEAD 7730633`, **the code wins and the disagreement is noted
in place** — there are two such cases, both recorded where they matter:

- `map-platform.md` §7 item 12 says a couple org can come from "a couple registering themselves at
  `/my`." It cannot: there is no self-registration anywhere. Corrected in
  [01 §3.11 and §5.1](01-master-project.md).
- Every map read the photograph publish gate as broken, which it was until 11:27 on 16 September.
  Corrected in [01 §9.6](01-master-project.md) and [02 §3 H1](02-codebase-assessment.md).

---

## 4. Facts this research could not establish

Carried here in one place so they are not quietly upgraded to facts by repetition. Each is marked
unverified where it appears in the body text too.

| Claim | Status |
|---|---|
| Whether the SISFS application cycle is currently open | **Unverified.** Multiple 2026-dated sources report the last cycle closed 31 May 2026; the live portal renders as a JavaScript app this research could not read ([04 §5](04-startup-india.md)) |
| Whether the SIPP free-facilitator subsidy is still live | **Unverified** — the official page still advertises it; legal press reports it lapsed 31 March 2026 ([04 §1, §2.3](04-startup-india.md)) |
| Whether Section 54GB is available for a new transaction today | **Unverified** — the traceable extension chain ends 31 March 2022 ([04 §4](04-startup-india.md)) |
| DPDP's commencement dates and the obligations that bite at Mehfilbox's size | **Unverified** ([04 §4](04-startup-india.md)) |
| "73% of viewing is mobile-first, 60% of growth from Tier 2 and 3" | **Unverified.** Cited to `docs/COMPETITORS.md` §7, whose own Sources block (`:342-348`) covers competitor pricing pages only; no source exists anywhere in the chain ([05 §2](05-market-and-differentiation.md)) |
| Real stored bytes on the live Bunny library | **Unmeasured.** The whole ₹25,000/month keep-originals argument depends on it; it is an afternoon's work to read (N-99, [03 §B5](03-port-and-build-vs-buy.md)) |
| Playback start time against the product's own 1.5s-on-4G bar | **Unmeasured.** The beacon exists and writes to a log nothing reads ([02 §1](02-codebase-assessment.md), N-81/N-14) |
| Where Sandeep is actually based | **Unknown.** Nothing in the repository says, and it gates the registered-office state and every state scheme ([04 §6](04-startup-india.md)) |
