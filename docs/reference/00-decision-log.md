# Decision Log

Why the documented product differs from `original-business-case.pdf`. Kept so nobody — human
or agent — reopens a settled question without seeing the reasoning first.

## D-1 · Full streaming design, own name and mark

**Original:** Netflix-styled sites at `subdomain.flixinvite.com`, per-couple names like
"SharmaFlix", plus Prime Video and Spotify-Wrapped theme packs.

**Decided:** Build the streaming design at **full fidelity** — near-black surface, hot red
accent, profile gate, poster rows, hero with scrim, episode framing, title-detail modal
(all ten mechanics in `docs/04 §1b`). Keep our own product name, our own wordmark, and
`#d11a2a` rather than `#E50914`.

**Why the line sits there and not somewhere else.** The design and the marks are two
different exposures. Trade dress requires the look to identify a *source* and cause
confusion, and nobody on a page headed "Aanya & Vikram" with the couple's photographs thinks
they are on a video-streaming service; the same grammar is used by Disney+, Prime Video,
JioHotstar and countless dashboards. Netflix-themed wedding content is an openly commercial
Etsy category that has coexisted with Netflix for years. Enforcement concentrates on
**names and marks**, where a lawyer can act cleanly without arguing about confusion — and a
`-flix` suffix is exactly that.

So the trade is: give up the suffix and the exact hex, keep 100% of the experience. The name
contributes nothing to a guest's two-second reaction. Additionally, a planner reselling this
under their own brand cannot have a third party's brand on it — white-label and `-flix` are
structurally incompatible.

**Cost of the decision:** zero experientially. Per-couple naming becomes `SharmaStream` or
`Sharma Originals` instead of `SharmaFlix` — same joke, different word.

**Superseded:** an earlier draft of this document specified a gold accent on aubergine and
treated the palette as equally risky as the name. That was over-cautious and has been
reversed. The design is the product; the name was never the point.

## D-2 · D2C freemium → B2B white-label

**Original:** free branded subdomain for couples, monetised through ₹149–999 add-ons.

**Decided:** sell per-wedding licences to wedding management companies at ₹3.5k/6k/12k; they
resell at ₹8–25k inside packages already costing lakhs.

**Why:** every add-on in the original stack (multi-event ₹999, multilingual ₹499, WhatsApp
RSVP ₹799) is already free on India-focused builders — The Curated Knot, Wedd.ai, DesiWeds —
and a complete site with a custom domain sells at ₹999 one-time elsewhere. The original doc's
own insight was "the base site is a commodity, monetise the novelty", then it priced the
commodity. Sandeep had already dropped a ₹2,000 D2C wedding app for exactly this reason.

**Cost:** strategic dependence on the planner, who owns the customer. Accepted for now; Phase
0's job is revenue and proof, not a moat.

## D-3 · Registry / Shagun payments → cancelled

Handling guest money invokes RBI payment-aggregator rules and settlement obligations for
negligible revenue. Link out to the couple's own UPI instead. See `docs/12 §4`.

## D-4 · Automated WhatsApp invites → manual `wa.me` links

Automated business messaging needs the WhatsApp Business Cloud API with an approved business
and pre-approved templates; unofficial libraries risk the number being banned mid-season, and
messaging people who never opted in to *us* is a DPDP problem. Generating links the family
sends from their own number is also simply more effective — an invite from a cousin gets
opened, one from an unknown business number does not. See `docs/12 §3`.

## D-5 · No database in Phase 0

The original architecture assumed a full multi-tenant SaaS build. Phase 0's only job is to get one
planner to say yes; a database adds hosting, auth, migrations, backups and a privacy surface
before anyone has agreed to anything. The multi-tenant *middleware* is still built in Phase 0
(with one tenant), because retrofitting tenancy later means touching every component.

## D-6 · Financial model restated

The original table put 2,000 paying couples as a "base case" on zero acquisition spend, with
organic Reels as the channel. Reels virality is a lottery ticket, not a planning assumption.

Replaced with a channel-based model: one signed planner = 20–80 weddings/season. Three
planners at 25 weddings each at ₹5k average = ~₹37.5 lakh season revenue with a sales process
that is five meetings rather than a viral hit. Lower ceiling, vastly higher probability.

## D-7 · Scope explicitly bounded to Phase 0

~50 hours to a deployable demo plus five pitch meetings. Phase 1 is conditional on a signed
pilot. If no planner commits by end of September, the season is gone and stopping is the
correct outcome. This is stated in `docs/12 §7` because the binding constraint is not
technical — it is that this competes for the same hours as an already-committed consulting
practice in the same months.

## D-8 · Invite/RSVP site → white-label streaming platform (Aug 2026)

**Decided:** the product is a white-label, streaming-style **experience platform** for wedding
films and personal content. An operator at a wedding management company logs in, creates a
catalogue, uploads films, arranges modules in a customizer, and publishes a branded site.
The invite/RSVP work is archived to `archive/invite-site/` and returns later as an `rsvp`
module, not as a product.

**Why the pivot is commercially better, not just different:**

- Wedding films are already paid for and already exist. We are not creating a new line item,
  we are upgrading the delivery of one worth lakhs — which is a much easier sell than adding
  a website nobody budgeted for.
- Google Drive links, WeTransfer expiries and pen drives are the incumbent, and they are
  genuinely bad. Free wedding-website builders were a much stronger incumbent.
- It creates recurring revenue (doc 01 §7), which fixes the Nov–Jan seasonality that the
  original business case flagged as structural.
- The unit economics hold: ~₹320/wedding/year in hosting against a ₹4,000+ licence (doc 05 §2).

**Retention:** 3 months included with the planner's licence, then ₹249/month or ₹1,999/year
paid by the couple. Grace 60 days, then cold storage, then a final notice. Never silent
deletion.

## D-9 · The customizer is the differentiator

After reviewing the reference reel (`reference/reference-reel.mp4`), the product is not a
video player with decoration — it is a streaming **shell wrapping personal modules**, several
of which contain no video at all (letter, memory vault, bucket list, date-night planner).

Sites like it exist today as one-off builds: 6–20 hours of developer time, unresellable. The
module registry plus a non-technical customizer turns that into 30 minutes of an operator's
time, forty times a season. The streaming UI is copyable in a weekend; a module system with a
safe theming layer, validated content and a working multi-gigabyte upload pipeline is months.

Spec: `docs/spec/14-modules-and-customizer.md`. It is why the customizer is P0 and not Phase 2 —
a demo where Sandeep edits JSON demonstrates a bespoke service, which is exactly what the
planner can already buy elsewhere.

## D-10 · A curated keepsake, not a media library (Aug 2026)

**Clarified:** this holds **6–15 items** — the pieces worth flaunting and cherishing. It is
explicitly **not** where all 40GB of footage and 2,000 photos go; those stay wherever they
live today.

**What that changed, concretely:**

- **Cut** `trending` (ranks the billboard first, every time, across eight items),
  `new_releases` (the whole catalogue publishes at once), search, and My List. All of them
  solve *abundance*, and there is no abundance.
- **Demoted** Continue Watching to P1 — most items are under five minutes and get finished.
- **Rows are curated, not computed.** Auto-grouping by category at this scale produces six
  rows of one card. Rows are now hand-picked lists with operator-written headings, which is
  also what the reference reel actually does ("TOP 5 HITS OF HEART LIST").
- **Promoted** per-title share to P0 (it is the *flaunt* mechanic) and chapters to P1 (the one
  long film needs them).
- **Added a 15-title / 60-photo soft cap** in the admin. This is the rare limit that is a
  feature: past roughly forty items it stops being a keepsake and becomes a folder with
  better fonts.
- **A 2–3 card row is now a designed state**, not an edge case — no arrows, no peeking card,
  cards sized up. Rendering three cards at library scale looks like a loading error.
- **Costs fell to ~₹150/catalogue/year** (from ~₹320), which makes hosting a rounding error
  and reopens the lifetime-hosting question — see doc 11 §3.
- **Effort moved** from managing many items to making few items beautiful: poster art,
  billboard weight, the letter's typography.

**The naming that should drive review decisions:** *flaunt* (would the couple send this?) and
*cherish* (would they open it on their own, a year later?). A feature that serves neither is
out, however standard it looks in a real streaming app.

## Still open

Carried in `docs/01 §8` — whether planners will accept us holding guest data; per-wedding vs
season pricing; whether a streaming aesthetic reads as premium or irreverent to older
families; which regional language ships after Hindi; whether the profile gate helps or costs
conversion.

## D-11 · No hard delete — archive instead (Sept 2026)

**Was:** `PRICING.md` §2, August: renewal lapses → 30 days' grace → the catalogue is deleted,
justified as the only way to stop storage compounding (`SCALE-PLAN.md` §4.1).

**Decided:** lapse → **90 days' grace** (plays read-only for the couple, download offered) →
**archive**: streaming paused, files retained, restore on payment. Automatic deletion is removed
from the product; `deleted` is reachable only by an explicit, recorded request.

**Why:** "we deleted your wedding" is the one review the product cannot absorb, and the ₹40,000 a
year deletion saved is smaller than what the archive fee earns. The compounding cost is stopped by
charging for archive (₹999 / ₹1,499 a year), free for the first twelve months after grace, and by
holding only the best rendition once the paid term ends (D-15).

**Cost:** storage for lapsed catalogues that nobody ever pays for — bounded at ≈₹340–1,000 a year
each once originals are gone. Measure the archive take-up after the first renewal season.

## D-12 · Notifications on every channel, behind one seam (Sept 2026)

**Was:** email only; "SMTP" (N-17) as the blocker. N-17 shipped Resend through Supabase Auth for
registration and reset; the application itself still sends nothing.

**Decided:** a `NotificationProvider` seam like `VideoProvider` — `fake` driver for the suite,
`resend` for email, **MSG91** for WhatsApp and SMS. Every lifecycle message goes on every channel
the recipient has. A `notifications` table records every send. Ticket N-50, first in Phase 1.

**Why:** Indian families live on WhatsApp; an email-only expiry warning is a warning nobody
reads. MSG91 covers three channels on one rupee-billed account.

**Re-examined 7 September against Gupshup, and MSG91 stands — but not for the reason a feature
table would give.** The deciding number is our own volume. From §5's matrix, an active wedding
sends roughly **20 WhatsApp messages in its first year** (delivery ×2, handover ×2, four expiry
warnings ×3, anniversary ×3). At 60 weddings that is **~100 messages a month**, which at Meta's
utility rate is **under ₹20**.

Per-message markup is therefore irrelevant, and **any fixed platform or subscription fee dominates
the entire bill** — a ₹2,000/month platform fee would be a hundred times the message cost. Gupshup
is the larger BSP and its economics are built for enterprise volume with a platform layer and a
sales-led contract; MSG91 is self-serve and developer-first. At a hundred messages a month that
difference decides it on its own.

Two things make this a low-stakes decision rather than a bet:

- **The BSP does not set the price of the thing being bought.** Meta charges per conversation;
  the BSP adds a markup or a fee. The floor is the same whoever we use.
- **N-50 puts every provider behind `NotificationProvider` with a `fake` driver**, exactly as
  `VideoProvider` is. Changing BSP is a driver, not a migration — which is the argument for not
  over-researching this before there is any volume to research with.

**What actually gates the choice is neither vendor**: WhatsApp Business API **template approval is
Meta's process** and takes days. Whichever BSP is used, start that queue first.

**The number that was unknown is now known, and it is a fee.** MSG91's WhatsApp plan is **₹500 a
month** (Titan, first two months free), plus Meta's own rates passed through at cost — utility and
authentication **₹0.115**, marketing **₹0.8631**, all ex-GST.

The per-message half is exactly as negligible as predicted, and the fee is exactly as dominant:

| | Messages/month | Message cost | Platform | Fee vs traffic |
|---|---|---|---|---|
| 10 weddings | 17 | ₹1.92 | ₹500 | **261×** |
| **60 weddings** | 100 | ₹11.50 | ₹500 | **44×** |
| 200 weddings | 333 | ₹38 | ₹500 | 13× |
| 600 weddings | 1,000 | ₹115 | ₹500 | 4× |

The fee only stops dominating at roughly **2,600 weddings a month**, which is not a number this
business will see soon. So ₹500/month is not a per-message decision at all — it is a **₹6,000/year
subscription for the right to send about a hundred messages**.

**That is still the right answer, and the seam is why.** MSG91 passes Meta's rates at cost, so
once volume exists the economics are the best available; a BSP that marks messages up would be
worse at scale even if it were free today. What changes is the *timing*: N-50 ships with `fake`
and `resend`, which costs nothing and unblocks N-21 and N-36. The `msg91` driver is added when the
first real wedding needs a delivery message — the fee then starts against revenue rather than
against a build. The two free months cover the build itself.

Start Meta's template approval **now** regardless: it is free, it is the long pole, and it is the
one part no seam defers.

## D-13 · The studio's credit survives every renewal; no revenue share (Sept 2026)

**Was:** `presentedBy` snapshotted at handover — an editable field. No renewal share (August).

**Decided:** a permanent **"Filmed by"** credit rendered from `origin_org_id`, which the couple
cannot edit, plus an enquiry link routed to the studio, which the couple may hide but not
redirect. Both survive every renewal. Still no revenue share.

**Why:** a studio with no stake in renewals will not nudge them; two hundred guests a year seeing
their name is the stake. It is the "distribution, not delivery" argument (`COMPETITORS.md` §7)
extended to every year after the first.

## D-14 · Deliver replaces Highlights (Sept 2026)

**Was:** Highlights — 10 GB, ₹2,500, 12 months — which `PRICING.md` admitted could not hold a
wedding.

**Decided:** **Deliver** — 100 GB, **90 days** (180 for two credits), originals downloadable,
studio-branded, ₹1,999 or five for ₹7,999. At day 60 the studio is offered Keep for the couple.
At day 90 the catalogue archives; nothing is deleted.

**Why:** viddrop sells exactly this at $25 and is the price a studio will compare against. Our
cost for it is ≈₹500 (75% margin) and we keep what viddrop gave up — adaptive playback on 4G,
Hindi, a catalogue rather than a grid. Their deletion at day 90 becomes our upgrade offer.

## D-15 · Originals kept for the paid term, best rendition after (Sept 2026)

**Was:** Keep Original Files off; renditions only (August, to keep storage at ₹458 a year).

**Decided:** originals are stored and downloadable for the whole paid term. From the first renewal
the archive holds the best rendition only; 4K films keep their originals. The 100 GB cap counts
originals plus renditions.

**Why:** "original quality download" is the claim the per-wedding competitors lead with and the
thing a studio judges delivery by. Keeping originals forever would push renewal to ₹2,999 and
archive to ₹1,499 with thin margins; keeping them for the term the couple has already had a year
of *download everything* in is the honest middle. Cost: Keep year-one margin falls from 84% to
≈65%.

## D-16 · All year-one money goes through the studio (Sept 2026)

**Was:** couple pays renewal and storage directly after the included months (doc 15 §4).

**Decided:** for twelve months after delivery, every purchase — including the day-60 Deliver →
Keep upgrade at a ₹2,500 base — is the studio's, at a base they mark up. Direct billing, if it
exists at all (P-1), begins no earlier than the first renewal.

**Why:** a couple who paid their studio must never get an invoice from a company they have not
heard of inside the first year; it costs the studio their trust, and the studio is the channel.

## D-17 · The ladder: Deliver ₹1,999 · Keep ₹6,000 · Cinema ₹12,000 (Sept 2026)

Keep at ₹6,000 (was Wedding ₹7,000) — three times Deliver, a clean step; 3 years ₹12,000. Cinema
unchanged at ₹12,000 / ₹24,000 but 200 GB now that originals count. Renewal ₹2,500 / ₹4,000.
Archive ₹999 / ₹1,499; long-term ₹3,999 / 5 yrs, ₹6,999 / 10 yrs (Keep), ₹5,999 / 5 yrs (Cinema).
Extra storage ₹25/GB/month; extra 4K ₹1,999 per 20 min.

## D-18 · Studios buy credits; the Studio plan includes three (Sept 2026)

**Was:** partner credit packs (doc 15 §4); an integration fee mentioned in conversation.

**Decided:** prepaid credit packs, plus a **₹4,999/yr Studio plan** (registration, branding,
presets, team seats, custom domain served, lapse dashboard) that **includes three Deliver credits
in its first year**. Renewal of the plan carries no credits.

**Why:** Sandeep wants a studio fee, because a studio registers and manages branding and that is
worth something; charging before a studio has delivered a wedding is also the thing most likely
to lose them. A fee that pays for itself with three deliveries reconciles the two.

## D-19 · Prices shown GST-inclusive first, with the split (Sept 2026)

Studios think in inclusive numbers; invoices need the split. `PRICING.md` lists ex-GST with the
inclusive figure beside it; anything a studio reads shows inclusive first. Registration itself is
the accountant's call and is not yet made.

## D-20 · Archive free for twelve months after grace, then the fee (Sept 2026)

A wedding never disappears within about two years of being filmed. Cost ≈₹340–1,000 per lapsed
wedding per year, bounded by D-15.

## D-21 · The landing page comes after real footage (Sept 2026)

Rebuild `heirloomfilms.in` in viddrop's shape — price in the hero, With/Without Drive table, three
template screenshots, one-sentence FAQ on "what happens after 90 days", public demo — as the last
item of Phase 1 (N-51), after N-6/N-14 put real frames in the demo. Never claim "no compression";
say *originals always downloadable, streaming tuned for 4G*.

## D-22 · The roadmap has five phases, each sellable (Sept 2026)

`docs/ROADMAP.md`. Phase 1 deliverable-and-honest (N-50, N-21, N-22, N-23, N-29, N-35, N-36,
N-24a, footage, N-51); Phase 2 money and time (N-20, N-24, N-25, N-27); Phase 3 the studio's
reasons to sell (N-26, N-36b, N-37, N-38, N-39, N-34); Phase 4 the catalogue earns more (N-40 to
N-44, N-48, store module); Phase 5 on demand. Marketplace, photo proofing/CRM, native TV apps and
a renewal revenue share are deliberately off the roadmap.

## D-23 · The platform is renamed to Mehfilbox (Sept 2026)

**Was:** **Heirloom Films**, chosen 14 August 2026 over Trove, Cinea, Aveya and others, with
`heirloomfilms.in` registered, live, Resend-verified and serving. Before that, **Mehfil**.

**Decided:** the platform is **Mehfilbox**. Documents are renamed now; **code and infrastructure
are not** — the domain, the Vercel project, the Bunny zones, the package, the repository and the
sending address all still read `heirloomfilms`.

**Why the split:** the previous rename is the argument. Renaming documents to match a name the
infrastructure does not have produces documents that describe a system nobody can reach, and this
repo has spent a session already on docs that claimed things that were not true. The brand moves
when it is decided; the identifiers move when they are actually changed.

**Cost:** every document now says Mehfilbox while every URL in it says `heirloomfilms.in`. That
reads as an inconsistency and is instead the honest state, called out at the top of `PRODUCT.md`.
It resolves when the rename ticket lands.

**Resolved 7 September:** `mehfilbox.com` and `mehfilbox.in` are both registered. **`.com` is
canonical**, `.in` redirects — a studio types `.com` from memory, and it does not tie the brand to
one country. `heirloomfilms.in` keeps resolving and redirects; it is in guests' phones.

## D-24 · One deployable, with seams — not microservices (Sept 2026)

**Asked:** should the product be rebuilt as microservices with micro-frontends, a service mesh and
observability baked in?

**Decided: no to the first three, yes to the fourth**, and the fourth is instrumentation rather
than architecture.

**Why:** microservices solve *organisational* problems — independent teams shipping on independent
cadences without coordinating a release. There is one developer here. Every cost of that
architecture (network calls where function calls were, distributed transactions, a mesh to make
service-to-service traffic safe, eventual consistency in place of a foreign key) is paid in full,
and the benefit it buys does not exist.

The numbers say the same thing. **19,700 lines across 180 files**, and `SCALE-PLAN.md` puts the
break at ~333 weddings a month against a plan of 60 in six months — **33× headroom on the
monolith**. The app is a control plane: guest bytes never pass through it, Bunny serves video and
photographs directly, so it handles small JSON and will not become CPU-bound at any volume this
business plans for.

Micro-frontends would actively break the product. The customizer renders **the real guest
components** so the preview cannot drift from the page (CLAUDE.md, deviation 1). Splitting the
guest surface from the admin means two implementations of the module tree, and the one that drifts
is the one nobody is looking at.

**What was right in the question is modularity, and it is already here.** `Repository`,
`VideoProvider`, `PhotoProvider`, `AuthProvider` and the module registry are seams with real
alternative implementations behind them — which is why the suite runs offline, why the demo works
without a database, and why swapping Postgres for an in-memory store is an environment variable.
`NotificationProvider` (N-50) is the next one, and it is the same pattern rather than a new
service.

**Observability is the genuinely missing piece**, and it is missing as *instrumentation*, not as
topology: error tracking, structured logs that survive a serverless invocation, and an alert when
a webhook stops arriving. This product's failures are silent ones — a transcode webhook pointed at
a dead URL, a storage column nothing wrote, an SMTP credential that authenticates but cannot send.
None of those are visible in a dashboard today, and none of them would have been made visible by
splitting the app into services.

**Revisit when:** a second team exists, or one part of the system needs to scale or deploy on a
genuinely different cadence. Not before.

## D-25 · Do not restart the repository — carry it (Sept 2026)

**Asked:** start afresh on the configs and the git project, keeping only the learnings, and
architect the product and the repository properly from scratch.

**Decided: no.** Rename in place and continue.

**Why, from the audit rather than from principle:**

- **Two-thirds of the test suite is a paid-for lesson.** 23 of 35 test files encode a *specific*
  past failure: the webhook that answered from a stale build, the column the driver never wrote,
  the router cache that said "No weddings here yet", the passcode gate, token auth, the suite
  contention. Those are learnings in executable form, and **they are the ones that cannot be
  carried to a blank repository** — a lesson you can restate in a document is one you will
  restate again after re-breaking it. A test that goes red is the only kind that stops you.
- **Nothing is architecturally wrong.** D-24 established the shape three commits ago: one
  deployable with driver seams, which is right for 19,700 lines and one developer. A rewrite would
  arrive at the same architecture with fewer tests.
- **The code is clean by measurement, not by opinion.** `knip` finds no dead code, there are zero
  `TODO`s, TypeScript is strict with no `any`, and the config surface is twelve standard files.
  There is no mess to escape.
- **The live infrastructure is not in the repository.** Eight migrations with RLS, two Bunny zones,
  a verified Resend domain, three domains on Vercel, a webhook that took two attempts to point
  correctly. A new repository does not reset any of it, and re-pointing it all is the risk without
  the benefit.

**What would have justified it:** a wrong domain model, an architecture that fought the product,
or an untested codebase. None of the three holds, and each was checked rather than assumed.

**What the impulse was right about:** the repository should feel deliberate rather than accreted.
That is served by the rename (N-52) and by the seams already in place — not by starting again.

**Cost of being wrong:** if the architecture does turn out to fight the product later, the seams
are where it would show, and replacing one driver is a contained change. That is the insurance a
rewrite would be buying, and it is already paid for.

## D-26 · Studio-only, with an escape hatch (Sept 2026) — was P-1

**Decided:** Mehfilbox invoices **studios only**. Every rupee — delivery, upgrade, renewal,
archive, long-term archive, storage, 4K — is billed to the studio at a base price they mark up.
The couple is never Mehfilbox's billing customer.

**The escape hatch exists.** When a studio is *gone* — account closed, Studio plan unpaid past its
own grace, or unresponsive 90 days after a catalogue lapsed — the couple may pay directly, at list
price, to renew or archive. Computed, never stored; logged when it unlocks a purchase.

**Why:** one customer, one invoice shape, one payment flow, and no couple can find our ₹2,500 next
to their studio's ₹8,000. The escape hatch is what keeps *"your wedding survives your studio"*
true, which is the one line no competitor can say. Without it the model's weakness — studios are
bad at collecting a renewal three years after a wedding — becomes the thing `COMPETITORS.md` §4
positions against.

**Cost:** renewals depend on studios doing them. Contained by selling three years up front, the
lapse dashboard (N-37, now Phase 2 because it *is* the renewal mechanism), long-term archive sold
at delivery, and D-11/D-20 — nothing is ever deleted, so the worst case is a paused catalogue.

## D-27 · Credits expire at 24 months (Sept 2026) — was P-2

**Decided:** prepaid credits expire **24 months** after purchase.

**Why:** an unused credit is a liability on the books that otherwise never clears, and revenue
recognition needs a horizon. viddrop says never; either is defensible commercially, and the
accounting is the tiebreaker. Two years is long enough that no working studio loses one.

## D-28 · Originals live in Edge Storage, not Bunny Stream (Sept 2026) — was P-3

**Decided:** originals are copied to **Bunny Edge Storage** with signed download URLs, rather than
enabling Stream's "Keep Original Files".

**Why, and it is the lifecycle that decides it:** D-15 drops originals **per catalogue** when it
archives, keeping 4K. "Keep Original Files" is a *library* setting — it cannot express "this
wedding's originals go, that one's stay", so the cheaper option cannot implement the policy that
was already decided. Edge Storage also gives N-22 exactly what it needs: a per-file signed URL,
which is how "download everything" works without a server-built zip.

**Cost:** a second write path and the bytes stored twice during upload. Both are known; a policy
the storage layer cannot express is not.

## D-29 · Handover transfers control, not billing (Sept 2026) — was P-4

**Decided:** handover moves the passcode, family links, downloads and the couple's own login. It
does **not** move billing, which stays with the origin studio for life (D-26).

**Why:** it is simpler than what is built, and it is what the studio-only model implies. The
couple's org holds no billing method unless the escape hatch is open for that catalogue.

## D-30 · The Studio plan is mandatory (Sept 2026) — was P-5

**Decided:** the ₹4,999/yr Studio plan is how a studio registers — mandatory from the first paid
wedding. Its three included Deliver credits in year one are the free trial.

**Why:** D-18's reconciliation only holds if the plan is the entry point. Optional means most
studios skip it and the fee earns nothing, which leaves the argument for charging a registration
fee unsupported. Three included credits mean it pays for itself before a studio is out of pocket.

---

# Open — a question to ask, not a decision to make

## P-6 · The day-60 question

Not a decision but a fact to obtain: **will a studio offer their couple Keep at day 60, and at
what markup?** Ask one studio owner. It gates the Phase 2 price rows, and no amount of reasoning
here substitutes for one person's answer.
