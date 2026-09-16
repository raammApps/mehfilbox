# Startup India for Mehfilbox

Related: [00-README.md](00-README.md) for how this set of documents fits together,
[01-master-project.md](01-master-project.md) for what Mehfilbox is,
[02-codebase-assessment.md](02-codebase-assessment.md) for the code,
[03-port-and-build-vs-buy.md](03-port-and-build-vs-buy.md) for the rewrite and transcoding
questions this document deliberately stays out of, [05-market-and-differentiation.md](05-market-and-differentiation.md)
for competitors, and [06-what-changes-next.md](06-what-changes-next.md) for the combined plan.

Written 16 September 2026 from six research passes and one adversarial fact-check, all in
`scratchpad/15-sep/research-*.json` and `scratchpad/15-sep/factcheck.json`. Every number below was
checked against a primary source where one exists — the DPIIT gazette notification, the Startup
India portal, the SISFS guidelines PDF, a Budget or Finance Bill memorandum, or a state
government's own page — and corrected where the primary text disagreed with what was first
reported. Where sources disagree and nothing primary settled it, this document says so rather than
picking the more convenient number.

**Starting point: nothing is incorporated yet.** A search of every file in `docs/` for "private
limited," "LLP," "incorporated," "company registration," "ROC" and "MCA" finds nothing describing
an existing legal entity. The only registered asset is the domain `heirloomfilms.in` (14 August
2026, `docs/PRODUCT.md:41`); the brand name **Mehfilbox** was decided 7 September 2026, but
nothing else — code, infrastructure, or a company — has caught up to it yet (`docs/PRODUCT.md:30`).
Everything below assumes Mehfilbox will be built on a company that does not exist today, because
that is the actual first step for every benefit in this document.

## 1. The short answer

What a pre-revenue SaaS like Mehfilbox can realistically get from "Startup India," sorted by how
sure we can be it's there and what it's actually worth:

| Benefit | Available to Mehfilbox today? | What it's worth | Effort |
|---|---|---|---|
| DPIIT Startup Recognition | Yes | No cash directly; the gate for everything below | Low — one free form, days |
| Udyam (MSME) registration | Yes, independent of DPIIT | No cash directly; unlocks a trademark-fee discount now and collateral-free credit later | Very low — free, same-day |
| Trademark filing fee discount | Yes, once Udyam- or DPIIT-registered | ₹9,000 saved across two classes (₹4,500/class instead of ₹9,000/class) | Low |
| IPR facilitator subsidy (SIPP) | **Unverified** — the official page still advertises it; legal-press sources report the scheme lapsed 31 March 2026 | Up to 80%/50% off patent/trademark fees, paid facilitator, if still live | Confirm before relying on it |
| Section 80-IAC / Section 140 tax holiday | Yes to apply; the benefit needs profit Mehfilbox doesn't have yet | 100% tax-free on any 3 of the first 10 **assessment** years (see §4 — the portal says "financial years," which shifts the window by one) — worth ₹0 until there is profit | Medium — a separate application |
| Angel tax exemption | Moot — angel tax was abolished for every company, not just recognised startups | Nothing to unlock | None |
| SISFS grant (up to ₹20 lakh) | **Unverified** whether the current cycle is even open | Real, non-repayable cash | High — competitive, incubator-scored |
| SISFS debt (up to ₹50 lakh) | Same uncertainty as above | Real money, but repayable | High |
| CGSS loan guarantee | Yes, once recognised | Not money — cheaper borrowing later, only if borrowing | Low, but only relevant if raising debt |
| Fund of Funds / FoF 2.0 | Not directly reachable | Indirect only, via a VC that already has this as an LP | None — not a founder action |
| A state scheme | Depends on the state and Mehfilbox's stage | Varies; most of what we found is gated to idea/proof-of-concept | Medium (§6) |

**The free, no-downside items — DPIIT recognition, Udyam registration, the trademark discount —
are worth doing in the first two weeks regardless of anything else.** The two items with real cash
attached, SISFS and the 80-IAC/140 tax holiday, both need real preparation, neither is guaranteed,
and one of them (SISFS) might not even be open right now. Treat those as a parallel project to run
alongside incorporation, not a funding plan to bank on this quarter. Sections 2–8 below explain
each row; §9 lists every source with its as-of date.

## 2. Entity choice and incorporation

### 2.1 Private Limited, LLP, or OPC

OPC is out first, and quickly: a One Person Company is not on DPIIT's own list of eligible entity
types (Private Limited Company, registered Partnership Firm, LLP, or a Multi-State/State
Cooperative Society — an OPC is none of these), so it cannot get DPIIT recognition, 80-IAC, or
SISFS at all. Separately, by the Companies Act's own definition, an OPC can only ever have one
shareholder — it must convert to a Private Limited Company before taking even a single outside
investor. Once Startup India or outside money is part of the plan, OPC isn't a real option. That
leaves Private Limited vs LLP:

| | Private Limited Company | LLP |
|---|---|---|
| DPIIT recognition, 80-IAC, SISFS | Eligible for all three | Eligible for all three |
| Can issue shares / take priced equity | Yes | No — no share capital |
| ESOP for future hires | Standard | Not really — only profit- or contribution-linked alternatives |
| MCA incorporation fee | Nil if authorised capital ≤ ₹15 lakh | N/A — different fee schedule |
| All-in setup cost (commonly quoted, 1–2 directors) | ~₹7,000–25,000 | Generally similar or somewhat cheaper |
| Setup time | ~7–15 working days for a clean filing | Similar |
| Annual ROC filing | AOC-4 + MGT-7/7A, plus DIR-3 KYC per director and an ITR | Just Form 8 and Form 11 |
| Statutory audit | Every year, regardless of turnover | Only if turnover > ₹40 lakh or capital contribution > ₹25 lakh |
| Commonly quoted annual compliance cost (small company) | ~₹25,000–55,000/year | Lighter, in line with the shorter filing list |
| Late ROC filing penalty | ₹100/day per form, uncapped | ₹25,000–₹5,00,000 fine under the LLP Act if a required audit is skipped |
| Corporate tax | Can opt into the 22% concessional rate (s.115BAA, ~25.17% effective with surcharge and cess) — whether this forecloses 80-IAC is **unconfirmed**, ask the CA | Flat 30% plus surcharge and cess, no concessional option |

Every cost figure in that table is a commonly quoted planning range from compliance-filing firms,
not a fetch of MCA's or the Income Tax Department's own fee schedule — confirm the exact number
with whoever actually files the paperwork.

**Recommendation: Private Limited Company.** It is the only structure that is both fully eligible
for every Startup India benefit here and fits what a future investor or ESOP pool needs. LLP
reaches the same three schemes but becomes an awkward fit the moment equity is on the table; OPC
is out from the first eligibility gate. Keep the first authorised capital at or under ₹15 lakh to
keep the MCA filing fee nil.

> **17 September 2026 — read this before acting on the recommendation above.** Sandeep shared two
> certificates for an entity called **Raamm Group Enterprises**: a Udyam (MSME) registration
> certificate and a Madhya Pradesh Shop & Establishment (Gumasta) certificate. What they actually
> show:
>
> | | |
> |---|---|
> | Type of organisation | **Proprietary** — a sole proprietorship, not a company |
> | Owner | **Asha Sharma** (PAN `BZSPS1955C`) — not Sandeep; the contact email on file is `sandeep.mummy.bh5@gmail.com`, which reads as a family member's address he manages, most likely his mother's, going by the pattern and the father's/husband's name on file (Ram Gopal Sharma) — **unconfirmed, worth stating plainly rather than guessing further** |
> | GST | Not registered (`Do you have GSTIN: No`) |
> | Registered office | Bhopal, **Madhya Pradesh** — a state this document's §6 never researched |
> | Business activity (NIC codes) | 66309 fund management, 68100 real estate, 70200 management consultancy — **no software, media or IT services code**, which is what Mehfilbox actually is |
> | Age, at 17 Sept 2026 | About five weeks old (incorporated 12 Aug 2025); Udyam registration followed 29 Oct 2025 |
> | Financials on file | Zero turnover, zero investment (FY2023-24 row, filed as a placeholder before the entity existed) |
>
> **The one fact that overrides everything else in this section: a sole proprietorship is not on
> DPIIT's eligible-entity list.** DPIIT Startup Recognition, Section 80-IAC and SISFS all require a
> Private Limited Company, a registered Partnership Firm, or an LLP (§3, §4, §5) — a proprietorship
> gets none of them, no matter how it is used. **MSME/Udyam registration and DPIIT Startup
> Recognition are separate systems that happen to share an acronym-adjacent name and nothing
> else** — Udyam is about lending priority, delayed-payment protection under the MSMED Act, and
> tender set-asides; DPIIT recognition is the tax-and-equity track this whole document is about.
> Having one says nothing about eligibility for the other, and this is worth being direct about
> because the phrasing "already have an MSME registered company... planning to use it for this"
> reads as if it might unlock what DPIIT recognition unlocks. It does not.
>
> **Decided (Sandeep, 17 Sept, D-52a): path 1.** Incorporate a fresh Private Limited Company for
> Mehfilbox; leave Raamm Group Enterprises exactly as it is, for whatever else it is for — no
> conversion, no reuse. Given the proprietorship is five weeks old with zero turnover and zero
> assets, there was nothing of substance to give up. The two paths not taken, for the record: a
> Part IX conversion of Raamm Group Enterprises into a Pvt Ltd (more paperwork than fresh
> incorporation, and little history in a five-week-old entity worth preserving anyway), or using it
> as-is and giving up DPIIT/80-IAC/SISFS permanently (cheapest, but abandons the entire point of
> this document).
>
> **Two follow-ups do not wait on that decision, and are not yet done:** **confirm who Asha Sharma
> is** — she is not part of Mehfilbox's new company, so this only matters for understanding what
> Raamm Group Enterprises actually is, not for anything Mehfilbox needs; and **the
> registered-office state is still open** — Karnataka was only ever provisional pending Sandeep's
> actual base, and Raamm Group Enterprises' Bhopal address is evidence worth weighing, not proof,
> since it belongs to a family member rather than being confirmed as Sandeep's own location. §6's
> state table has no Madhya Pradesh row and should get one before either state is chosen. The
> NIC-code mismatch noted below applies only to Raamm Group Enterprises, which is now out of scope
> for Mehfilbox — the new Pvt Ltd's own Udyam registration should simply be filed correctly under
> an IT/software/media code from the start.

> **Correction, 17 September 2026.** The paragraph below was written assuming nothing was
> registered. That was wrong: Sandeep has a sole proprietorship, **Raamm Group Enterprises**
> (Udyam `UDYAM-MP-10-0138268`, incorporated 12 Aug 2025, Bhopal, Madhya Pradesh), owned by a
> family member — see the box at the end of §2.1 for what it is. **Decided the same day (D-52a):
> Mehfilbox gets a fresh Private Limited Company; Raamm Group Enterprises stays untouched.** So the
> paragraph below is accurate as written — "nobody legally owns Mehfilbox today except Sandeep
> personally" was and remains true, since the proprietorship was never a candidate to own it.

### 2.2 Moving the existing code into the company

Nobody legally owns Mehfilbox today except Sandeep personally. As noted above, nothing in `docs/`
describes an existing company, LLP, or registered proprietorship, and the only registered asset is
the domain. That matters for how the code moves in: this reads as a **personal-to-company IP
assignment**, not a going-concern business transfer, because "Heirloom Films" itself was never a
separately registered entity — just a product name and a domain. Confirm that reading with the
accountant before drafting anything, since a going-concern transfer (GST-exempt under Notification
12/2017-Central Tax (Rate)) and a plain IP assignment are taxed and documented differently, and
"going concern" itself is not defined anywhere in GST law.

Once the company exists:

1. **Sign a written IP Assignment Deed** moving copyright in the Mehfilbox codebase — software is
   a "literary work" under the Copyright Act, 1957 — from Sandeep to the company. This is
   generally exempt from stamp duty (Copyright Act 1957 s.19, read with the conveyance exemption
   in the Indian Stamp Act 1899 s.23), except in Bihar, which has deleted that exemption, and Uttar
   Pradesh, which limits it to musical works — confirm the registered-office state isn't either.
2. **Copyright registration (Form XIV) is optional** — copyright exists automatically on
   creation — but it gives a clean, provable ownership chain, and needs the assignment deed plus a
   No-Objection Certificate from Sandeep as original author filed alongside it.
3. **Transfer the domain registrations** — `heirloomfilms.in`, and `mehfilbox.in`/`.com` once
   registered — to the company via the registrar. A separate, simple step from the deed.
4. **Decide how Sandeep is compensated**: cash, or shares in the new company. If shares (non-cash
   consideration), the Companies Act requires the price to be set by a registered valuer's report
   before the allotment (s.62(1)(c), with Rule 13 of the Companies (Share Capital and Debentures)
   Rules 2014), plus 21 clear days' notice and a special resolution for the preferential allotment.
   This is lower-risk than it used to be: the old angel-tax exposure on an over-generous valuation
   (Section 56(2)(viib)) no longer applies to any share issue from FY2025-26 onward (§4) — but the
   valuer's report is still legally required either way.
5. **A capital-gains question we cannot answer here.** An outright IP assignment (as opposed to a
   going-concern transfer) can create a personal capital-gains liability for Sandeep on the value
   of what he's assigning. One source floats an illustrative rate around 34% for a similar
   scenario, but it rests on no clear general statutory basis found in this research — **we do not
   know the real number.** It depends on the cost of acquisition of self-created IP and whether the
   gain is long- or short-term, which needs the CA's specific computation, not a rule of thumb.

### 2.3 Trademark: "Mehfilbox"

1. **Run the classes 41 and 42 search first**, before the company name or a filing locks
   "Mehfilbox" in anywhere expensive. This is already flagged as outstanding in the product's own
   documentation, budgeted at ₹3,000–8,000 with an agent (`docs/PRODUCT.md:56-60`,
   `docs/REQUIREMENTS.md:215`, `docs/ROADMAP.md:271`). A search engine finds brands, not registry
   records — the product doc's own cautionary example is Cinea, a registered Dolby Laboratories
   mark that a plain web search would not have surfaced (`docs/PRODUCT.md:48-49`).
2. **File after incorporation, in the company's name**, once the search is clean. The government
   e-filing fee (Form TM-A) is ₹9,000/class for an ordinary company or LLP applicant, but drops to
   ₹4,500/class for an individual, a DPIIT-recognised startup, **or** a Udyam-registered MSME
   (Trade Marks Rules 2017, First Schedule). Udyam registration is free, online, self-certified,
   and typically same-day, and does not need DPIIT recognition first — it's the fastest way to
   lock in the discount. Two classes at the discounted rate: ₹9,000 total instead of ₹18,000.
3. **Do not assume the bigger subsidy is still running.** DPIIT's own IPR page still advertises
   paying the filing facilitator's entire professional fee on top of the 50%/80% rebate, under a
   scheme called SIPP. Several legal-press sources report SIPP concluded 31 March 2026 with no
   confirmed renewal as of the most recent reporting found — a genuine, unresolved disagreement
   between an official page and independent legal reporting. Confirm current status with the
   Startup India helpline (1800-115-565) or DPIIT directly before budgeting a filing as free beyond
   the statutory fee.

## 3. DPIIT recognition

### Eligibility, under the framework DPIIT notified 4 February 2026

The notification is G.S.R. 108(E), superseding the 2019 notification (G.S.R. 127(E)) and, for the
first time, formally defining a "Deep Tech Startup" category. (One secondary source reported the
date as 6 February 2026 — that is wrong; the Gazette itself is dated 4 February 2026.) For
Mehfilbox, the ordinary track applies, not Deep Tech:

- **Entity:** Private Limited Company (also acceptable: registered Partnership Firm, LLP, or a
  Multi-State/State Cooperative Society — not a sole proprietorship or OPC).
- **Age:** under 10 years from incorporation (20 years only applies to Deep Tech Startups).
- **Turnover:** not more than ₹200 crore in any financial year since incorporation (₹300 crore only
  for Deep Tech). Mehfilbox's modelled revenue — ₹3.3 lakh over six months at 60 weddings
  (`docs/SCALE-PLAN.md:28`) — isn't remotely close.
- **The innovation-or-scalability test is a choice, not a combined requirement.** The gazette
  itself (para 1(a)(iv)) allows qualifying on *either* innovating, developing, or improving a
  product, process, or service, *or* running a scalable business model with high potential to
  generate employment or wealth — two independent doors, not one sentence both halves of which
  must be argued. The Startup India portal's own summary of this test reads as a single, combined
  requirement; the notification it links to does not.
- **Not formed by splitting or reconstructing an existing business.**
- **No Deep Tech track here.** That category needs novel scientific/engineering IP and long R&D
  cycles — it doesn't fit a Next.js/Supabase/Bunny wedding-streaming SaaS, and reaching for it
  would weaken the application rather than help it.

### Documents and process

Typical documents (drawn from consistently-reported guides, not an official DPIIT checklist — no
such page was found in this research): the Certificate of Incorporation, PAN, and a short write-up,
pitch deck, or product/website link evidencing the innovation or scalable-business-model claim.
Patents, other IP filings, or press coverage are optional supporting material, not required.

Applications are filed on the **National Single Window System** (nsws.gov.in) — not directly on
startupindia.gov.in. Create an NSWS account, then add the form "StartUp Recognition by DPIIT"
under "Central Approvals." It's free; the Ministry of Commerce and Industry charges no fee for the
Certificate of Recognition. Processing time is commonly reported at 2–10 working days for a
complete application (some sources claim 24–72 hours) — no official published turnaround
guarantee was found, so treat this as a planning range, not a promise.

One more timing fact worth knowing: the recognition window is reported to run from the date on the
Certificate of *Incorporation*, not from when the recognition certificate itself is issued — so
there's no advantage to delaying the application once incorporated. Apply promptly.

### The innovation narrative for this product

Because the test is innovation *or* scalability, Mehfilbox has two honest, independent ways in —
and should lead with the one that's actually true rather than inventing a technical novelty claim:

1. **Scalable business model (the stronger, better-evidenced case).** A white-label SaaS with 83%
   gross margin at its own modelled scale, infrastructure a near-fixed 17% of revenue with 30–80×
   headroom before any architecture change is needed (`docs/SCALE-PLAN.md:28,33,37,191,236`),
   selling into a large, underserved market — Indian wedding studios currently on Google Drive and
   a hard disk. This is a plain scalable-business-model argument, in the gazette's own sense of the
   term (above), and needs no invented technical claim.
2. **Product innovation, as a supporting case.** The specific, evidenced differentiators against
   the two closest competitors: an Indian wedding runs 10–15 hours across eight functions from
   both families' sides, and neither Pixieset (tops out at five hours on its most expensive plan,
   `docs/COMPETITORS.md:32-33`) nor OurStoria (caps at 10–15 files per project,
   `docs/COMPETITORS.md:60`) fits that at any price; Mehfilbox is a browsable, Netflix-shaped
   catalogue rather than a password-gated file grid; and the archive-not-delete model means a
   gallery survives even if the studio itself stops paying (`docs/COMPETITORS.md:58`).

**What to avoid:** writing the narrative around the technology stack ("we use Next.js and
Supabase") or a build-vs-buy choice like in-house video transcoding. Compliance-firm write-ups —
not DPIIT itself, so treat this as informed opinion rather than an official statistic — report that
a generic "we use the latest technology" paragraph, with no specific claim behind it, is the most
common reason an application gets sent back for clarification. Neither of the two real
differentiators above has anything to do with the tech stack; §8 says more about why an in-house
transcoder specifically would not help.

Recognition also carries a few near-zero-value items for Mehfilbox today, worth knowing exist but
not worth planning around: self-certification under 6 labour laws and 3 environmental laws (no
inspections for 3–5 years absent a credible written complaint), Government e-Marketplace access
and exemption from tender EMD/bid security, and a 90-day fast-track winding-up route under the
Insolvency and Bankruptcy Code. Mehfilbox sells to studios over WhatsApp, not to government buyers,
and is close to a one-person team — none of these save meaningful money or time yet.

## 4. Tax — 80-IAC, 54GB, angel tax, GST

| Provision | Who it's for | Key numbers | Status, 16 September 2026 |
|---|---|---|---|
| Section 80-IAC (now Section 140 of the new Act) | DPIIT-recognised Pvt Ltd or LLP **only** | Turnover < ₹100 crore in any FY — a different, narrower, unchanged cap from DPIIT recognition's ₹200 crore; incorporated 1 April 2016 – before 1 April 2030 | Current; needs a separate certificate on top of recognition |
| Angel tax (Section 56(2)(viib)) | Used to tax any closely-held company's share premium above fair value | N/A | **Abolished** for premium received on/after 1 April 2025 |
| Section 54GB | An individual/HUF investor, not the company | **We do not know** the current sunset date | Unresolved — see below |
| Section 79 relaxation | An "eligible start-up," same definition as 80-IAC/140 | Reported extended from 7 to 10 years | Reported, not independently confirmed |
| GST registration | Any business, entity-agnostic | ₹20 lakh turnover threshold, **or** immediate if reverse-charge liable | Reverse-charge trigger may already apply to Mehfilbox — see below |

**Section 80-IAC / Section 140.** Since 1 April 2026 the Income-tax Act, 2025 replaced the 1961
Act, and the same deduction — 100% of profits, for any 3 consecutive years chosen within the first
10 from incorporation — now sits at Section 140 in materially the same terms; most sources,
including the Startup India portal itself, still call it "80-IAC" out of habit.

**One wording difference worth carrying to the CA, because it moves the window by a year.** The
Startup India portal describes the benefit as "three consecutive **financial** years within their
first ten years of incorporation." The statute says "three consecutive **assessment** years out of
ten years, beginning from the year of incorporation, at the option of the assessee." An assessment
year follows the financial year it assesses, so the portal's phrasing is a loose paraphrase, not a
restatement, and the ten-year window it implies ends a year earlier than the statutory one. Since
the choice of which three years to claim is the assessee's and is worth the whole benefit, take the
statutory wording — and have the CA confirm it against the bare text rather than the portal page
(source: `form80iac` page, checked 16 Sep 2026, <https://www.startupindia.gov.in/content/sih/en/form80iac.html>). It needs its own
Form-1 application to DPIIT's Inter-Ministerial Board (IMB), reviewed within a reported 120 days.
112 startups were cleared at the 80th IMB meeting on 30 April 2025 — not 187; 187 is the combined
total of that meeting plus 75 more at the 79th. Cumulative approvals passed 3,700 since the scheme
began in 2016, per DPIIT's press release of 15 May 2025 (PIB PRID 2128860) — worth getting this
number right if it's ever quoted to anyone, since the 187 figure is the one that circulates.
Free to apply, and worth starting once recognised — but it exempts *profit*, and Mehfilbox does not
have any yet. Treat it as paperwork to start early and then forget about, not a near-term cash item.

**Angel tax.** Gone. The Finance (No. 2) Act 2024 made Section 56(2)(viib) stop applying to share
premium received on or after 1 April 2025 (AY 2025-26 onward) — for every closely-held Indian
company, any class of investor, DPIIT-recognised or not. The Income-tax Act, 2025 does not carry
the provision forward either. The Startup India recognition page still lists an angel-tax
exemption under Section 56 as a DPIIT benefit, with its own application link — that is the page
being stale, not the law changing back. Practically: an angel cheque at a premium valuation
carries no tax exposure on the premium any more, regardless of DPIIT status.

**Section 54GB.** This is Sandeep's personal relief, not the company's — it only matters if he
personally sells a residential house or plot and reinvests the proceeds as fresh equity in
Mehfilbox, and even then only if the company spends that money on new plant and machinery within a
year, holding the shares (and the assets) for 5 years, or 3 if the business is "technology-driven."
**We could not establish whether this provision is still available for a new transaction today.**
The traceable chain of Finance Act extensions found in this research runs 2017→2019→2021→2022, with
the last one moving the cut-off to 31 March 2022 and no further extension located — which would
mean it has lapsed for new investments. One other source's page title references a later
"upto 31.03.2026" date that could not be reconciled against that chain. If this is ever relevant,
it needs a CA checking the bare current text of the Act, not a blog post, before anyone plans
around it.

**Section 79 loss carry-forward relaxation.** Ordinarily a closely-held company loses the right to
carry forward a year's tax losses if the people holding 51% of its voting power change. An
"eligible start-up" (the same definition used for 80-IAC/140) gets a lighter test instead: losses
survive as long as everyone who held voting shares in the loss year still holds those same shares
later, even if new investors dilute the founders below 51%. This is reported — not independently
confirmed against the bare statute in this research — to have been extended from covering losses in
the first 7 years to the first 10, matching the 80-IAC/140 window. Relevant once Mehfilbox is
raising money and running at a loss before profitability; not an action item today.

**GST.** SaaS bills at 18% under SAC 998314 (Mehfilbox's own price list already uses this code,
`docs/PRICING.md:8`) or the narrower SAC 997331 — both carry the same rate, so this is a
classification question, not a tax-rate one. The registration threshold for a services business is
₹20 lakh aggregate turnover in a year (₹10 lakh in specified special-category states); Mehfilbox's
modelled revenue — ₹3.3 lakh over six months at 60 weddings (`docs/SCALE-PLAN.md:28`) — sits well
under that on its own, and selling to studios in other states doesn't by itself force early
registration (interstate *service* sales, unlike goods, stay inside the ₹20 lakh exemption).

**But there is a second, separate trigger that may already apply, regardless of turnover:** anyone
liable to pay GST under reverse charge must register, with no threshold at all (CGST Act Section
24(iii)) — and Mehfilbox already pays foreign vendors (Bunny, Vercel, Supabase) for services, which
makes it liable for reverse-charge IGST on those payments. Mehfilbox's own pricing document already
flags this exact issue and defers it to "an accountant... before quoting" (`docs/PRICING.md:333-337`).
It is a genuinely disputed question in the tax commentary found in this research, not a settled
one: does that reverse-charge liability force registration today, immediately, independent of
Mehfilbox's own outward revenue? **Get a specific, written answer from the accountant this month.**
This is arguably more urgent than the entity or DPIIT question, because it doesn't wait for
incorporation to bite — a sole proprietor can be liable under reverse charge too.

**And there is a second half to that question, which the go-to-market documents are already pricing
against.** [05](05-market-and-differentiation.md) and [06 D-50](06-what-changes-next.md) recommend a
direct-to-individual SKU at **"₹3,499 excl. GST."** That phrasing presumes an answer this section
explicitly declines to give: **an unregistered supplier cannot add GST to an invoice at all**, so
"excl. GST" is not a price a pre-registration Mehfilbox can quote — it is either ₹3,499 flat with no
tax line, or ₹4,129 inclusive once registered, and which one is legal depends on the reverse-charge
answer above. Selling to individuals also changes two things the studio-channel analysis never had
to consider: **place of supply** for a B2C service defaults to the recipient's location only where
it is on record, otherwise the supplier's, which affects whether IGST or CGST+SGST applies on a
couple in another state; and B2C invoicing has different requirements from the B2B invoices a studio
receives. Put both halves in the same written question to the accountant — the reverse-charge
trigger *and* what a direct-to-consumer SKU requires — rather than sending the first and discovering
the second when the door opens.

**DPDP: the one compliance item on this list with a code consequence.** A new company holding
wedding video and photographs of identifiable individuals — guests who never consented to anything,
since a guest has no account (01 Chapter 6) — falls under the Digital Personal Data Protection Act's
obligations on consent and deletion on request. Nothing in the product implements either today:
deletion is deliberately never automatic (D-11), the one route closest to a deletion request
(`POST /api/my/close`) writes no `deleted` state at all (01 §4.17), and DPDP consent and
deletion-on-request are tracked as **N-48, Phase 4** in `docs/NEXT.md` — i.e. not scheduled. That is
a defensible position for a studio-only product with 5 catalogues. It is a less defensible one for an
incorporated company with a direct-to-consumer channel, which is what [05](05-market-and-differentiation.md)
proposes opening. **This research did not establish the current DPDP rules' commencement dates or the
exact obligations that bite at Mehfilbox's size — treat that as unverified** and add it to the
accountant/CS conversation alongside GST, rather than assuming Phase 4 is soon enough.

## 5. Grants and funding — SISFS, CGSS, FFS, MAARG

DPIIT recognition itself unlocks status, not cash. These are the funding-shaped channels that sit
behind it, and they are not the same kind of thing — worth being precise, because the headline
numbers get quoted without this distinction constantly:

| Scheme | What it actually is | Amount | Route | Grant / debt / equity / guarantee |
|---|---|---|---|---|
| SISFS — first tranche | Non-repayable, milestone-based | Up to ₹20 lakh | Apply to up to 3 empanelled incubators; their committee scores and selects | **Grant** |
| SISFS — second tranche | Convertible debentures / debt | Up to ₹50 lakh | Same incubator route | **Debt** — repayable, interest capped at the repo rate, unsecured, ≤5-year tenure, ≤12-month moratorium |
| CGSS | A government guarantee on a bank/NBFC/AIF loan — not money DPIIT gives directly | Guarantees up to ₹20 crore per borrower | Apply to a lender as a DPIIT-recognised startup; the lender lends, DPIIT/NCGTC guarantees part of it | **Guarantee** — the loan itself is ordinary, repayable debt |
| Fund of Funds / FoF 2.0 | Government money committed as an LP into SEBI-registered AIFs, which then invest in startups | ₹10,000 crore (original, 2016) + another ₹10,000 crore (FoF 2.0, Budget 2025) | No direct application — reachable only if a VC that already holds FFS/FoF 2.0 money invests in Mehfilbox | **Equity** — indirect, via the AIF, never from government to founder |
| MAARG | Free AI-matched mentorship | N/A | DPIIT-recognition-gated, register on the portal | **Neither** — no funding component |

**SISFS in detail.** Eligibility is narrower than plain DPIIT recognition: incorporated no more
than 2 years before the application, at least 51% Indian promoter shareholding at the time of
applying, and no more than ₹10 lakh of prior Central/State monetary support already received
(prize money, subsidised space, founder allowance, and lab/prototyping access don't count against
this). Each tranche is usable once. A startup can apply to up to three empanelled incubators
simultaneously, ranked by preference; each incubator's own Incubator Seed Management Committee
(ISMC) scores applications on eight weighted criteria it sets itself — need/market gap, feasibility,
potential impact, novelty (USP and associated IP), team, fund-utilisation plan, incubator-specific
extras, and presentation. The committee must decide within 45 days, and a selected grant's first
instalment must land within 60 days of the incubator receiving the application. No fee is ever
charged at any stage, and a rejected applicant may reapply with no stated limit.

**We do not know whether SISFS is accepting applications right now.** Multiple 2026-dated secondary
sources report the current cycle closed 31 May 2026, with no successor cycle confirmed as of this
research (16 September 2026) — but this could not be verified directly against the live portal
(seedfund.startupindia.gov.in), which renders as a JavaScript application and returned no readable
content to the tools used here. **Check the portal directly in a browser, or call an incubator,
before spending time on a pitch deck for it.**

**Which incubator.** For a wedding-media SaaS specifically, **T-Hub (Hyderabad)** is the
best-verified match found — its own site, checked directly rather than via a roundup, names both
"SaaS & Enterprise-tech" and "Media-tech" as explicit sector focus areas and names SISFS as a
channel it runs. NSRCEL (IIM Bangalore) is commonly recommended by third-party "best incubators"
listicles, but its own site currently foregrounds fintech, climate, healthcare and impact work with
no SISFS mention — the recommendation didn't hold up when checked directly. CIIE.CO (IIM
Ahmedabad)'s seed fund targets financial-inclusion and livelihood work for lower-income customers,
a loose fit at best. Since up to three incubators can be named at once, a reasonable list is T-Hub
first, then a second and third chosen after directly checking their current sector focus and
confirming they're actually empanelled and running a live cohort — not from a listicle.

What a SISFS application should contain, per the official guidelines: team profile, problem
statement, product/service overview, business model, customer profile, market size, funds needed,
and a milestone-based utilisation plan. (This maps onto the 90-day plan in §7.)

**CGSS** is not something to chase now — only relevant once Mehfilbox actually wants to borrow, and
its own modelled economics don't currently need outside capital to run at the planned volume
(`docs/SCALE-PLAN.md`).

**FFS / FoF 2.0** is background context, not a founder action: more capital sitting in domestic VC
funds generally, reachable only if one of them invests in Mehfilbox. The Union Budget 2026-27
(1 February 2026) reportedly added a further "SME Growth Fund" — ₹10,000 crore of equity support for
early-stage startups and smaller enterprises — whether this is genuinely separate from FoF 2.0 or
the same initiative differently labelled is unresolved in the sources found; either way it sits in
the same "not directly reachable" bucket.

**MAARG** is free and worth registering for the mentor-matching alone, with no funding attached.

## 6. State schemes, and a recommendation on state

Every meaningful state benefit needs a registered office — or at least a working relationship with
an empanelled incubator — inside that state. That makes "which state" a real, actionable choice (a
virtual office is common practice for a young company chasing a specific state's incentives), not
free-floating paperwork. Seven states were checked directly against their own government pages
where those pages would load:

| State | Best-documented non-dilutive scheme | Headline amount | Fits Mehfilbox's stage now? | Confidence |
|---|---|---|---|---|
| Karnataka | ELEVATE (Idea2PoC) | Up to ₹50 lakh, one-time | **No** — proof-of-concept stage only; Mehfilbox already has a live product | Official for eligibility; the two-tranche structure some sources describe is **not confirmed** |
| Karnataka | SGST reimbursement | Reported 100%, turnover-banded | Maybe, once revenue starts | Secondary — primary PDF was unreadable |
| Karnataka | Patent-cost reimbursement | Up to ₹15 lakh/year | Only if patents are ever filed | Official |
| Kerala (KSUM) | Idea Grant | Up to ₹3 lakh | **No** — pre-product, tech-only stage | Official |
| Kerala (KSUM) | Product / Scale-Up Grant (same ladder as Idea Grant) | Reported up to ₹15–20 lakh combined | **Possibly** — the one ladder here with a genuine post-proof-of-concept tier | Secondary — components not independently confirmed |
| Kerala (KSUM) | Seed Fund Scheme | Soft loan up to ₹15 lakh at 6% p.a. | Yes, if debt is acceptable | Official |
| Telangana | SGST reimbursement | 100% for 3 years, capped at ₹1 crore turnover | Yes, once revenue starts | Official |
| Telangana | Performance Grant | 5% of turnover, capped ₹10 lakh | Needs a 15%+ year-on-year growth trend — not yet | Official |
| Telangana | T-Fund (via T-Hub) | ₹25 lakh – ₹1 crore | Possibly — and T-Hub is also the best-matched SISFS incubator found (§5) | Secondary |
| Maharashtra | CM Maha Fund (2025 policy) | ₹500 crore corpus; loans ~₹5–10 lakh | Unclear — whether SGST reimbursement survives into the 2025 policy is disputed between sources | Secondary — no primary Maharashtra page could be reached |
| Delhi | 2022 policy incentives | N/A | **No** — reportedly never formally notified; nothing currently collectible | Secondary |
| Gujarat | Scheme for Assistance to Startups | Reported up to ₹30 lakh | Unclear — component breakdown not confirmed | Secondary — primary PDF was unreadable |
| Uttar Pradesh | Prototype Grant + Seed Capital + Sustenance Allowance | Up to ~₹12.5 lakh, plus ₹17,500/month | Partial fit — ladder targets the MVP-launch stage | Official; 50% top-up for women/transgender/Divyangjan-led teams |

**Karnataka and Kerala come out strongest** for a bootstrapped SaaS founder — but the Karnataka
case has to be made on the reasons that survive scrutiny, and "the largest documented non-dilutive
ceiling" is not one of them. **ELEVATE's ₹50 lakh does not apply to Mehfilbox**, on two independent
grounds: it is gated to the proof-of-concept stage, which Mehfilbox has already passed (the honesty
check below), and its own eligibility page requires the entity be "Registered or Incorporated in
Karnataka," so it is a consequence of the registered-office choice rather than an argument for it.
The larger ELEVATE NxT 2026 grant (up to ₹1 crore under the LEAP programme) is **DeepTech-only** —
20-year / ₹300-crore eligibility — and a wedding-streaming SaaS does not qualify
(fact-check against <https://eitbt.karnataka.gov.in/101/elevate/en>, 16 Sep 2026). What actually
argues for Karnataka is narrower and still real: **by far the deepest software-engineering hiring
pool** (relevant only if D-46's trigger ever fires and a second engineer is hired), the convenience
of a registered office where the founder may already be, and **patent-cost reimbursement of up to
₹15 lakh a year** if patents are ever filed — official, and the one Karnataka line item with no
stage gate on it. Kerala (KSUM) for a founder-friendly reputation and the one grant ladder here with
an actual post-proof-of-concept tier. Telangana is close behind on how well-documented its own numbers are, and T-Hub — its
flagship incubator — is also the single best sector-matched SISFS incubator this research found
anywhere, which matters more than any state grant amount.

**An honesty check worth stating plainly:** most of the state grants above — Karnataka's ELEVATE,
Kerala's Idea Grant — are explicitly gated to the idea/proof-of-concept stage. Mehfilbox already
has a working, revenue-ready product. It does not fit those doors. The better state-level fits are
the ones with a market-entry or scale-up tier — Kerala's Product/Scale-Up grant, once its detail is
confirmed, or Telangana's Performance Grant, once there's a revenue trend to show — or simply
leaning on the central SISFS's ₹50 lakh second tranche (§5) instead of chasing a state
proof-of-concept grant Mehfilbox has already outgrown.

**We do not know where Sandeep is actually based.** Nothing in the repository names a city or
state for him, and that gates this whole section. **Recommended default: Karnataka** — for the
reasons above, and because it is the natural registered-office choice if Sandeep is already
Bangalore-based or open to being — but this should be confirmed, not assumed, before the SPICe+
filing locks in a registered-office address.

## 7. A 90-day plan

| When | Do this | Why / what it depends on |
|---|---|---|
| This week | Ask the accountant, in writing, **three questions in one message**: (a) does the existing Bunny/Vercel/Supabase reverse-charge liability already force GST registration; (b) what does a direct-to-individual SKU require on invoicing and place of supply, given an unregistered supplier cannot charge GST at all; (c) what do DPDP's consent and deletion-on-request obligations require of a company holding guests' wedding photographs? | (a) doesn't wait for incorporation; (b) is presumed by the ₹3,499 "excl. GST" price in [05](05-market-and-differentiation.md); (c) is unverified here and is the only compliance item with a code consequence (§4) |
| This week | Run the trademark search, classes 41 and 42, for "Mehfilbox" | Already budgeted, `docs/PRODUCT.md:56-60` (§2.3) |
| This week | Confirm Sandeep's actual base and pick the registered-office state | Default Karnataka (§6) — confirm, don't assume |
| This week | Confirm whether "Heirloom Films" was ever separately registered | Settles IP-assignment vs going-concern-transfer mechanics (§2.2) |
| Week 2–3 | Incorporate as a Private Limited Company (SPICe+, MCA), authorised capital ≤ ₹15 lakh | ~₹7,000–25,000, ~1–2 weeks (§2.1) |
| Week 2–3 | Register on Udyam (MSME) | Free, instant; unlocks the discounted trademark fee immediately, no need to wait for DPIIT |
| Week 3–4 | Execute the IP Assignment Deed and transfer both domains to the company | Registered-valuer report first if Sandeep is paid in shares (§2.2) |
| Week 3–4 | File the "Mehfilbox" trademark (Form TM-A, classes 41 and 42) in the company's name | ₹4,500/class once Udyam- or DPIIT-registered; confirm SIPP's status first (§2.3) |
| Week 3–4 | Apply for DPIIT recognition on NSWS (nsws.gov.in) | Free; write the case around the scalable-business-model argument, with the product differentiators as support (§3) — not the tech stack |
| Week 5–6 | Register for GST if the reverse-charge check (week 1) didn't already force it; file Form-1 for Section 80-IAC / 140 | Both free to start; no near-term cash expected from either |
| Week 5–6 | Register on MAARG for mentor matching | Free — use it to pressure-test the transcoder and Go/Java-port questions with someone outside the building; see [03-port-and-build-vs-buy.md](03-port-and-build-vs-buy.md) |
| Week 6 | Check seedfund.startupindia.gov.in directly, or call an incubator, to confirm whether SISFS is actually open | Multiple 2026 sources say the last cycle closed 31 May 2026 — unverified either way (§5) |
| Week 7–12 | If open: prepare and submit the SISFS application to up to three incubators, T-Hub first | Team profile, problem statement, product overview, business model, customer profile, market size, funds needed, utilisation plan — the guideline's own required fields (§5) |
| Ongoing | Reuse the numbers already in `docs/SCALE-PLAN.md` for any pitch, one-pager, or financials | Don't invent new projections; keep that document's own "reasoned, not measured" honesty about what's estimated versus counted |

**What to have prepared by week 6, concretely:** a one-to-two-page write-up for DPIIT (the
scalable-business-model and product-differentiator case from §3, in plain language, no tech-stack
talk); a SISFS one-pager built directly from the guideline's required fields above, self-scored
against the eight-criteria rubric in §5 before it's sent anywhere; and the existing
`docs/SCALE-PLAN.md` numbers — revenue, infrastructure cost, gross margin, headroom — as the
financials for both, rather than freshly modelled projections nobody has checked.

## 8. What does not help

**Building an in-house video transcoder does not help win any Startup India benefit, and would
actively hurt one path.** Three separate reasons, not one guess:

- The SISFS guideline explicitly bars using grant money to create facilities — an in-house
  pipeline is exactly that.
- SISFS's own novelty criterion scores the technology's USP and any associated IP (§5) —
  replicating what Bunny already gives away free is commodity engineering, not IP, and would not
  move that score.
- Mehfilbox's own code already treats the Bunny driver as a swappable default, not a limitation:
  `lib/video/provider.ts:4-5` says outright that moving off Bunny is a one-line change to a
  well-defined interface, not a rewrite, and `docs/SCALE-PLAN.md:191,197-198` prices commercial
  transcoding alternatives at roughly 3–5 times Bunny's cost for the same output, warning against
  ever routing video bytes through the application server. Building a transcoder to look innovative
  for a grant application would argue against the platform's own cost model, not with it — and
  [03-port-and-build-vs-buy.md](03-port-and-build-vs-buy.md)'s own adversarial review of this exact
  build-vs-buy question independently found the grants argument for building it worth nothing.
  Decide that question on its own engineering and cost merits, entirely separately from Startup
  India.

**DPIIT recognition is not a competitive process, so a flashier pitch doesn't buy anything there.**
It's a self-certified status check against the age/turnover/innovation-or-scalability test in §3.
Where competitive scoring genuinely happens is SISFS, at the incubator level (§5) — not at
recognition.

**A DPIIT certificate is not itself money, and doesn't automatically turn into 80-IAC or SISFS
money.** Both need separate applications, separate criteria, and — for 80-IAC/140 — a separate
Inter-Ministerial Board sign-off. Recognition is the gate, not the reward.

**Angel tax exemption is not a reason to seek DPIIT recognition any more.** Angel tax itself is
abolished for every company since 1 April 2025, recognised or not (§4). Any advice that frames
DPIIT status as protecting a future angel round from tax is out of date.

**The Section 80-IAC / 140 tax holiday is not near-term cash.** It exempts profit for 3 of the
first 10 years, and Mehfilbox does not have profit yet. It's worth the free paperwork, not a reason
to delay anything else while waiting on it.

**A patent is not the only way to score as "novel."** SISFS's own novelty criterion is the
technology's USP and any associated IP, and a documented product differentiator — the wedding-hour
capacity and archive-not-delete comparisons in §3 — is a legitimate answer to that criterion. It
does not have to be a patent filing, which would be a strange, slow, expensive thing to chase for a
wedding-media SaaS with no patentable invention in it.

**The Fund of Funds headline numbers (₹10,000 crore, plus another ₹10,000 crore) are not money
Mehfilbox, or any founder, can apply for directly.** They're a reason more VC capital exists in the
system generally, not a funding channel of their own (§5).

## 9. Sources

Every source a claim in this document rests on, with the date it was checked (or, where the source
itself is dated, that date). "Official" means a `.gov.in` page, a Gazette notification, or the
Startup India / SISFS-guidelines site itself; everything else is secondary and is flagged as such
in the text wherever it materially matters.

**DPIIT recognition and process**

- G.S.R. 108(E) gazette notification (official) — as of 16 Sep 2026 — <https://www.dpiit.gov.in/static/uploads/2026/02/119e52e2a36f652215a32c3ccc5f9c66.pdf>
- DPIIT recognition page (official) — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/startupgov/startup_recognition_page.html>
- NSWS filing route (official) — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/recognition-page.html>
- No-fee / self-filed (official) — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/recognition-application-detail.html>
- Typical documents (secondary) — as of 16 Sep 2026 — <https://incubateer.com/guides/dpiit-startup-recognition>
- Processing time (secondary) — as of 16 Sep 2026 — <https://www.setindiabiz.com/blog/dpiit-startup-recognition-complete-guide>
- Labour/environmental self-cert, IPR, GeM, IBC winding-up (official) — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/startup-scheme.html>
- The 6 labour laws (secondary) — as of 16 Sep 2026 — <https://blog.ipleaders.in/labour-law-compliances-for-indian-startups/>
- GeM / EMD exemption (secondary) — as of 16 Sep 2026 — <https://www.mondaq.com/india/tax-authorities/1824000/startup-india-scheme-legal-benefits-and-compliance-guide>
- Recognition window runs from incorporation date (secondary) — as of 16 Sep 2026 — <https://www.khuranaandkhurana.com/2025/01/29/dpiit-startup-registration>
- "First 100 days" official blog — as of 14 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/bloglist/blogs/your-firs-100-days-after-DPIIT-recognition.html>
- Generic-innovation rejection pattern (secondary) — as of 16 Sep 2026 — <https://www.patronaccounting.com/blog/dpiit-startup-recognition-what-it-is-who-qualifies-how-to-apply>
- Recognition vs. 80-IAC as separate tests (secondary) — as of 16 Sep 2026 — <https://treelife.in/startups/indias-revised-startup-recognition-framework-2026/>

**Entity choice, incorporation, compliance**

- Entity-type list (secondary) — as of 16 Sep 2026 — <https://www.taxmann.com/post/blog/faqs-dpiit-recognition-for-start-ups/>
- OPC's single-shareholder rule (secondary) — as of 16 Sep 2026 — <https://www.cashfree.com/blog/one-person-company-opc/>
- OPC conversion triggers, unverified — as of 16 Sep 2026 — <https://www.incorpx.io/blog/one-person-company-opc-india>
- Why VCs and ESOPs favour Pvt Ltd over LLP (secondary) — as of 16 Sep 2026 — <https://www.incorpx.io/blog/private-limited-vs-llp-india>
- SPICe+ fee, DSC and stamp-duty ranges (secondary) — as of 16 Sep 2026 — <https://khannaandassociates.com/blog/authorised-capital-2026/>
- Incorporation cost and timeline (secondary) — as of 16 Sep 2026 — <https://www.registerkaro.in/post/cost-of-company-registration-in-india-a-complete-breakdown>
- LLP's Form 8 / Form 11 filing (secondary) — as of 16 Sep 2026 — <https://www.kanakkupillai.com/learn/can-an-llp-raise-funding-from-investors-or-venture-capital-firms/>
- LLP audit threshold (secondary) — as of 16 Sep 2026 — <https://www.kanakkupillai.com/learn/llp-audit-applicability/>
- Pvt Ltd annual compliance cost (secondary) — as of 16 Sep 2026 — <https://www.kanakkupillai.com/learn/annual-compliance-cost-for-private-limited-company-in-india/>
- Section 115BAA / LLP flat 30% (secondary) — as of 16 Sep 2026 — <https://www.indiafilings.com/income-tax/domestic-company-tax-rate>
- Udyam registration mechanics (secondary) — as of 16 Sep 2026 — <https://blog.udyogsuvidhakendra.in/msme-startup/unlock-growth-udyam-registration-benefits-2026/>
- CGTMSE collateral-free credit (secondary) — as of 16 Sep 2026 — <https://khannaandassociates.com/blog/msme-udyam-registration-2026/>

**Trademark and IP**

- Trademark filing fee schedule, ₹4,500 vs ₹9,000/class (secondary) — as of 16 Sep 2026 — <https://www.intepat.com/blog/trademark-registration-fees-india>
- Startup India IPR page, 80%/50% rebate (official, flagged as showing stale statistics) — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/intellectual-property-rights.html>
- SIPP scheme reported lapsed 31 Mar 2026 (secondary) — as of 16 Sep 2026 — <https://www.mondaq.com/india/trademark/1813728/the-sipp-scheme-what-its-expiry-means-for-startups>
- Registered-valuer requirement, s.62(1)(c) (secondary) — as of 16 Sep 2026 — <https://npahilwani.com/valuation-issue-of-shares-non-cash-consideration/>
- Copyright-assignment stamp-duty exemption and state exceptions (secondary) — as of 16 Sep 2026 — <https://blog.ipleaders.in/assignment-of-intellectual-property-rights-in-india/>
- Copyright Form XIV (official) — as of 16 Sep 2026 — <https://www.copyright.gov.in/Documents/Form-XIV-Registration%20of%20Copyright.pdf>
- Going-concern transfer GST exemption (secondary) — as of 16 Sep 2026 — <https://taxguru.in/goods-and-service-tax/gst-implications-case-slump-sale-business-transfer.html>
- IP-assignment capital-gains treatment, unverified — as of 16 Sep 2026 — <https://www.maheshwariandco.com/faq/transfer-of-ip-rights-in-india/>

**Tax — 80-IAC/140, angel tax, 54GB, Section 79**

- Section 80-IAC official page — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/form80iac.html>
- Finance Bill 2025 memorandum, incorporation window to 2030 (official) — <https://www.indiabudget.gov.in/budget2025-26/doc/memo.pdf>
- PIB release, 80th IMB meeting figures (official release, 15 May 2025) — as of 16 Sep 2026 — <https://www.pib.gov.in/PressReleasePage.aspx?PRID=2128860&reg=48&lang=2>
- Section 140 of the Income-tax Act, 2025, text reproduction (secondary) — as of 16 Sep 2026 — <https://eztax.in/income-tax-act-2025/section-140>
- Claim that under 2% of recognised startups hold an IMB certificate, unverified single source — as of 16 Sep 2026 — <https://www.dugainadvisors.com/post/section-80-iac-in-july-2026-what-s-changed-who-still-qualifies-and-why-only-1-8-get-it>
- Angel tax abolition, Finance (No. 2) Act 2024 (secondary) — as of 16 Sep 2026 — <https://www.india-briefing.com/news/abolishing-the-angel-tax-in-india-applicable-for-fy-2025-26-35289.html/>
- Angel tax abolition, corroborating source (secondary) — as of 16 Sep 2026 — <https://treelife.in/legal/angel-tax-exemption/>
- Section 54GB mechanics (secondary) — as of 16 Sep 2026 — <https://www.taxbuddy.com/blog/tax-exemption-under-section-54gb-invest-in-startups>
- Section 54GB holding-period rule (secondary) — as of 16 Sep 2026 — <https://tax2win.in/guide/exemption-under-section-54gb-of-income-tax-act-1961>
- Section 54GB sunset-date dispute (secondary, unresolved) — as of 16 Sep 2026 — <https://carajput.com/blog/tax-benefit-on-investment-in-startups-u-s-54gb/>
- Section 79, general 51% rule (secondary) — as of 16 Sep 2026 — <https://www.indiafilings.com/learn/income-tax-section-79>
- Section 79, eligible-start-up relaxation (secondary) — as of 16 Sep 2026 — <https://taxguru.in/income-tax/section-79-carry-set-loss-case-ofeligible-startups-condition-relaxed.html>
- Section 79, reported 7→10-year extension (secondary) — as of 16 Sep 2026 — <https://www.argus-p.com/updates/updates/extended-set-off-and-carry-forward-period-under-section-79-of-the-it-act/>

**GST**

- Notification 10/2017-Integrated Tax, interstate services exemption (official) — as of 13 Oct 2017 — <https://keralataxes.gov.in/wp-content/uploads/2018/11/10_2017_IT.pdf>
- Section 24(iii), disputed how far reverse-charge registration reaches (secondary) — as of 16 Sep 2026 — <https://taxguru.in/goods-and-service-tax/provision-section-24-iii-cgst-act-compulsory-registration-wider.html>
- Section 24(iii), reverse-charge registration explainer (secondary) — as of 16 Sep 2026 — <https://www.taxscan.in/top-stories/reverse-charge-liability-triggers-mandatory-gst-registration-even-below-threshold-section-24-explained-1445161>
- GST registration threshold, ₹20 lakh services (secondary) — as of 16 Sep 2026 — <https://www.jordensky.com/blog/gst-registration-threshold-limits-for-services>
- Interstate supply of services vs. goods (secondary) — as of 16 Sep 2026 — <https://www.taxwink.com/blog/gst-on-inter-state-supply-of-services>
- SAC 9983, SaaS at 18% (secondary) — as of 16 Sep 2026 — <https://www.kanakkupillai.com/learn/gst-for-saas-companies-in-india/>
- SAC 998314 lookup (secondary) — as of 16 Sep 2026 — <https://munimo.in/tools/hsn-sac-code-finder/998314>

**Grants — SISFS, CGSS, FFS/FoF 2.0, MAARG**

- SISFS Guidelines PDF, the master source for §5 (official) — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/dam/invest-india/Templates/public/Guidelines%20for%20Startup%20India%20Seed%20Fund%20Scheme.pdf>
- CGSS mechanics (official) — as of 16 Sep 2026 — <https://www.startupindia.gov.in/content/sih/en/credit-guarantee-scheme-for-startups.html>
- CGSS May 2025 expansion to ₹20 crore (secondary) — as of May 2025 — <https://www.ibef.org/news/government-notifies-the-expansion-of-the-credit-guarantee-scheme-for-startups-cgss-to-increase-capital-mobilization-for-startups>
- Fund of Funds for Startups, SIDBI (secondary) — as of 2026 — <https://www.sidbi.in/annualreport/AnnualReport202122/fund-of-funds.php>
- Fund of Funds 2.0 operational guidelines (secondary) — as of 27 Apr 2026 — <https://www.biospectrumindia.com/news/16/27725/dpiit-releases-operational-guidelines-for-startup-india-fund-of-funds-2-0-of-rs-10000-cr.html>
- Budget 2026-27 "SME Growth Fund" (secondary) — as of Feb 2026 — <https://inc42.com/features/union-budget-2026-takeaways-key-points-highlights-indian-tech-startups/>
- MAARG mentorship portal (secondary) — as of 2025 — <https://www.kanakkupillai.com/learn/maarg-portal-by-startup-india/>
- SISFS cycle reported closed 31 May 2026, unverified against the live portal — as of 23 Aug 2026 — <https://certifykaro.com/blogs/startup-india-seed-fund-scheme-2026-latest-updates-eligibility-and-application-guide>
- T-Hub's own sector focus, fetched directly (secondary) — as of 16 Sep 2026 — <https://www.t-hub.co/startups>
- NSRCEL's own current focus, fetched directly (secondary) — as of 16 Sep 2026 — <https://nsrcel.org/about-us/>

**State schemes**

- Karnataka's working portal (official) — as of 16 Sep 2026 — <https://eitbt.karnataka.gov.in/startup/public/>
- Karnataka Startup Policy 2025-30, eligibility and patent reimbursement (official) — as of 16 Sep 2026 — <https://eitbt.karnataka.gov.in/startup/public/policy/en>
- Karnataka ELEVATE, official page — as of 16 Sep 2026 — <https://eitbt.karnataka.gov.in/101/elevate/en>
- Karnataka ELEVATE, secondary page corrected by the fact-check — as of 16 Sep 2026 — <https://k-tech.karnataka.gov.in/elevate-100/>
- Karnataka SGST reimbursement, primary PDF unreadable (secondary) — as of 16 Sep 2026 — <https://static.investindia.gov.in/s3fs-public/2023-06/Startup_Policy_Karnataka.pdf>
- Kerala Idea Grant (official) — as of 16 Sep 2026 — <https://startupmission.kerala.gov.in/schemes/idea-grant>
- Kerala Seed Fund Scheme (official) — as of 16 Sep 2026 — <https://startupmission.kerala.gov.in/schemes/seed-fund>
- Kerala's combined grant ladder total (secondary) — as of 16 Sep 2026 — <https://www.lendingkart.com/blog/kerala-startup-mission/>
- Telangana funding and incentives (official) — as of 16 Sep 2026 — <https://startup.telangana.gov.in/funding-incentives/>
- Telangana T-Fund (secondary) — as of 16 Sep 2026 — <https://it.telangana.gov.in/initiatives/t-hub/>
- Maharashtra 2025 policy headline figures (secondary) — as of 16 Sep 2026 — <https://www.patronaccounting.com/blog/state-startup-policies-2026-maharashtra-karnataka-delhi-telangana>
- Maharashtra SGST-reimbursement dispute (secondary) — as of 16 Sep 2026 — <https://www.roedl.com/en/insights/india-maharashtra-industry-investment-services-policy-analysis/>
- Delhi's 2022 policy reportedly never notified (secondary) — as of 16 Sep 2026 — <https://hoblix.com/delhi-startup-policy/>
- Gujarat's Scheme for Assistance to Startups (secondary) — as of 16 Sep 2026 — <https://www.startupgrantsindia.com/scheme-for-assistance-for-startupsinnovation-gujarat-industrial-policy-2020-34>
- Uttar Pradesh Startup Policy 2020, First Amendment 2022 (official) — as of 16 Sep 2026 — <https://startinup.up.gov.in/state-startup-policy/>
- Uttar Pradesh FAQ, women/transgender/Divyangjan top-up (secondary) — as of 16 Sep 2026 — <https://startinup.up.gov.in/faqs/>

## Decisions this asks of Sandeep

| Decision | Recommended default |
|---|---|
| Entity type: Pvt Ltd, LLP, or OPC? | **Private Limited Company** — the only structure fully eligible for every scheme here and fit for future investors or an ESOP pool (§2.1) |
| State of registered office? | **Karnataka**, provisionally — confirm Sandeep's actual base first; this is genuinely unconfirmed (§6) |
| How is Sandeep compensated for the existing code — cash or shares? | Get the accountant/CS to propose the mechanics once the entity exists; if shares, a registered-valuer report is mandatory before allotment either way (§2.2) |
| Does the Bunny/Vercel/Supabase reverse-charge exposure already force GST registration? | Ask the accountant for a specific written answer **this month** — don't wait for incorporation or the first invoice (§4) |
| In the same written question: what does a **direct-to-individual** SKU require? | Ask now, not when the door opens — an unregistered supplier cannot invoice "₹3,499 excl. GST" at all, and B2C place-of-supply and invoicing rules differ from the studio-channel B2B ones the model was built on (§4; the price is proposed in [05](05-market-and-differentiation.md) and [06 D-50](06-what-changes-next.md)) |
| What do DPDP's consent and deletion-on-request obligations require of a company holding guests' wedding photographs? | Ask the CS/CA alongside GST. **Unverified in this research** — commencement dates and size thresholds were not established. The product implements neither today (N-48, Phase 4), which is defensible for a studio-only product and less so once a direct-to-consumer channel opens (§4) |
| Chase SISFS this cycle? | Confirm the application window is actually open (seedfund.startupindia.gov.in, or call an incubator) before investing time in a full application; apply for DPIIT recognition regardless, since its 2-year eligibility clock is running either way (§5) |
| Budget for the SIPP free-facilitator subsidy? | **No** — budget for a paid trademark agent (₹3,000–8,000 search plus the statutory filing fee) and treat a live SIPP scheme as a pleasant surprise, not a plan (§2.3) |
| How much attention does the 80-IAC/140 tax holiday get right now? | File it once recognised — it's free — but don't let it compete with GST, DPIIT, or SISFS for attention; expect no cash from it until Mehfilbox is profitable (§4) |
