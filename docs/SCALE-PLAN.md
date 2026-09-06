# Will this stack hold?

You asked whether Vercel, Bunny and Supabase survive scaling, whether the pricing works given
delivery costs, and whether **60 weddings in six months — 10 of them 4K** — is supportable.

**Short answer: comfortably, with ~80× headroom on the tightest limit.** Delivery is a big number
but a *constant* share of revenue, so it never becomes the problem. The things that will actually
bite are elsewhere, and none of them are capacity.

Costs from live provider pages, August 2026. `docs/PRICING-MODEL.md` has the per-plan economics.

---

## 1. Your 60 weddings, costed

Assuming a realistic mix and 300 guests × 20 minutes each:

| | Weddings | Allocated |
|---|---|---|
| Highlights 10 GB | 10 | 100 GB |
| Signature 20 GB | 20 | 400 GB |
| Full Wedding 40 GB | 20 | 800 GB |
| Cinema 60 GB (4K) | 10 | 600 GB |
| **Total** | **60** | **1,900 GB** |

| | Six months |
|---|---|
| **Revenue** | **₹3,30,000** |
| Bunny — storage (ramping to 1.9 TB) | ₹6,351 |
| Bunny — delivery (5,146 GB) | ₹14,743 |
| Bunny — 4K encoding (600 min) | ₹8,595 |
| Vercel Pro + Supabase Pro | ₹25,785 |
| **Total infrastructure** | **₹55,474** |
| | |
| **Gross margin** | **₹2,74,526 — 83.2%** |

**Infrastructure is 16.8% of revenue, and more than half of that is the fixed ₹45/month you would
pay with one wedding or a hundred.**

---

## 2. Delivery is not the problem you think it is

You said delivery is a big cost. In absolute terms yes — ₹14,743 over six months, the largest
variable line. But watch what it does as you grow:

| | Weddings | Delivery | Revenue | **Share** |
|---|---|---|---|---|
| Six months | 60 | ₹14,743 | ₹3,30,000 | **4.5%** |
| Year one | 120 | ₹29,487 | ₹6,60,000 | **4.5%** |
| At scale | 500 | ₹1,22,861 | ₹27,50,000 | **4.5%** |

**It is a fixed percentage.** Every wedding brings its own guests and its own revenue, so delivery
scales *with* the thing paying for it. It never compounds, never surprises you, and at 4.5% it is
smaller than payment-gateway fees will be.

**The one case that does bite is concentration** — a single wedding going viral. That is bounded
by the per-plan allowances in the pricing doc, and one such wedding costs ₹1,133 against a plan
that contributes ₹5,815. You can absorb it and should, because a wedding being watched 2,000 times
is the best sales story you will ever get.

---

## 3. Where each provider actually breaks

You are planning ~10 weddings a month. Here is the ceiling on each:

| | Included | Your usage | **Breaks at** | Headroom |
|---|---|---|---|---|
| **Vercel** edge requests | 10M/month | 120,000/mo (1.2%) | ~833 weddings/mo | **83×** |
| **Vercel** function invocations | 1M/month | 30,000/mo (3.0%) | ~333 weddings/mo | **33×** |
| **Vercel** fast data transfer | 1 TB/month | ~1 GB/mo | far beyond | — |
| **Supabase** database | 8 GB | 0.16 GB (2%) | ~2,900 weddings lifetime | **48×** |
| **Supabase** MAU | 100,000 | a handful | never | — |
| **Bunny** | pay as you go | — | no ceiling | — |

**The binding constraint is Vercel function invocations, at roughly 333 weddings a month.** That is
33× your plan. You would need a very good year to get there, and Vercel's next tier is a credit-card
change rather than a migration.

**Why so much headroom:** the guest page is ISR-cached (`revalidate = 3600`, invalidated on
publish), so 300 guests hitting one link mostly hit the edge cache, not a function. Posters
**redirect** to the CDN rather than proxying bytes. Photographs are served straight from a Bunny
pull zone. Video never touches Vercel at all — upload goes browser→Bunny over TUS, and playback is
a signed redirect. **Almost no bytes flow through your application**, which is why Vercel stays
cheap.

The deployment is already pinned to `bom1` (Mumbai), which is the right region for this market.

> **Verify rather than trust this.** My per-session estimates — ~40 edge requests, ~10 function
> invocations — are reasoned, not measured. After three or four real weddings, read the actual
> numbers off the Vercel dashboard and correct this table. If I am wrong by 3×, you still have 10×
> headroom; but you should know which.

---

## 4. The four things that will actually bite

None of these are capacity. All are cheaper to fix now than later.

### 4.1 Storage accumulates forever, and nothing deletes it

This is the real cost curve, and the only one that compounds.

| | If nothing is ever deleted |
|---|---|
| End of year 1 | 3,800 GB — ₹43,548/year |
| End of year 3 | 11,400 GB — ₹1,30,644/year |
| End of year 5 | 19,000 GB — **₹2,17,740/year** |

Every wedding you have ever hosted keeps costing you, forever, whether or not anyone renewed.

**With deletion 12 months after a subscription lapses, and a 40% renewal rate, it plateaus:**

| | With a deletion policy |
|---|---|
| End of year 1 | 3,800 GB — ₹43,548/year |
| End of year 3 | 5,928 GB — ₹67,935/year |
| End of year 5 | 6,268 GB — **₹71,837/year** |

**₹2.18 lakh a year versus ₹72,000, by year five.** The difference is one scheduled job.

**Today nothing reclaims anything.** `subStatus` has `lapsed` and `cold` states and the guest
surface honours them — a lapsed catalogue shows a renewal screen — but no code acts on `cold`, and
the films stay in Bunny indefinitely. The retention policy is *stated* in the product and *not
enforced* anywhere.

**What to do:** decide the grace period, tell couples at handover, and build the job. Twelve months
after lapse is generous and defensible; anything shorter needs to be very clearly communicated,
because deleting a wedding is not a mistake you can undo.

> **Revised 6 September 2026 — nothing is deleted.** The decision is an **archive tier** rather
> than a deletion job (`PRICING.md` §2, `ROADMAP.md` §4). The curve above still applies to the
> *unpaid* portion: a lapsed catalogue is archived at our cost for twelve months after grace, then
> either the couple pays ₹499–1,499 a year to keep it or it stays archived at our cost. The
> honest worst case is therefore the "never deleted" column with archive-priced revenue set
> against it — at a 40% archive take-up on lapsed catalogues, the year-five storage bill is
> covered roughly twice over. Measure the real take-up after the first renewal season and revisit
> this section with the number.

### 4.2 Delivery is not metered per catalogue

`getUsage` returns real stored bytes and **`deliveredGb: 0`**. The nightly usage job records a
number that is always zero.

Consequences, in order of how soon they hurt:

- **The allowances in the pricing doc cannot be enforced.** You would find out from the Bunny bill,
  in aggregate, a month late.
- **You cannot attribute cost to a catalogue**, so you cannot tell a profitable partner from an
  expensive one.
- **You cannot ever bill for overage**, should you want to.

At 60 weddings you can eyeball the Bunny dashboard. At 300 you cannot. **Build this before you need
it** — it is a provider API call and a column that already exists.

### 4.3 Upload time is the studio's bottleneck, not yours

Nobody plans for this and it is the thing that will make a studio complain:

| Wedding size | 20 Mbps upload | 50 Mbps | 100 Mbps |
|---|---|---|---|
| 40 GB | **4.6 hours** | 1.8 hrs | 0.9 hrs |
| 60 GB (Cinema) | 6.8 hours | 2.7 hrs | 1.4 hrs |

**At 10 weddings a month on typical Indian business broadband, that is ~46 hours of uploading.**

The product already handles this as well as it can — uploads are resumable, survive a dropped
connection, resume on reconnect, and keep running while the operator works elsewhere. But you
should **say the number out loud during onboarding**, because a studio that discovers it alone at
2am concludes the platform is broken.

It is also an argument for the 720p default: half the ladder is half the upload.

### 4.4 Play events are kept forever

Every play writes a row and nothing prunes them. It is small now — 0.16 GB across 60 weddings — and
Supabase Pro includes 8 GB, so this is a *year three* problem rather than a year one problem.

`0006_entitlements.sql` already has a `retention_months` column. Use it before the database is the
thing you are paying to grow.

---

## 5. Is the stack right?

**Yes, and I would not change it for this scale.** Each piece is doing something specific:

| | Why it is right | When to reconsider |
|---|---|---|
| **Bunny** | Free transcoding, $0.01/GB storage, India PoPs, TUS resumable upload, token auth. The commercial alternatives are 3–5× the cost for identical output. | Not soon. Delivery volume large enough for a committed contract — talk to them past ~10 TB/month. |
| **Vercel** | ISR, edge caching, `bom1`, zero ops. 33× headroom on the tightest limit. | Past ~300 weddings/month, or if function cost ever exceeds the value of not running servers. |
| **Supabase** | Postgres with RLS, auth, 48× headroom. The `Repository` seam means it is swappable anyway. | If you outgrow 8 GB, which is a plan change, not a migration. |

**The architecture is doing the heavy lifting, not the plans.** Because video never passes through
your application, your compute bill is unrelated to how much video you host. That is the property
that makes this scale, and it is worth protecting: **if you ever find yourself proxying video bytes
through Vercel, stop.**

---

## 6. What to do, in order

**Before the 60 weddings:**

1. **Set the encoding ladder** to 360p–720p by default (pricing doc §1). Without it a 15-hour
   wedding needs 64 GB and fits nothing you sell — and every upload takes twice as long.
2. **Confirm Keep Original Files and MP4 Fallback are off.** Each roughly doubles storage.
3. **Measure one real wedding** — stored GB off the catalogue overview, and the Vercel dashboard
   after the guests arrive. Correct §1 and §3 with real numbers.

**During:**

4. **Metering delivery** (§4.2). You need it before you can enforce anything.
5. **Enforce the 4K minute allowance at upload.** Bunny needs resolutions chosen before the file is
   sent, so this is a choice in the upload flow. Without it a studio marks everything 4K and the
   Cinema tier's margin falls from 80% to 47% — worse, but not a loss. See `PRICING-MODEL.md` §8.

**Within the year:**

6. **The deletion policy** (§4.1). One job, and it is the difference between ₹72,000 and ₹2.18 lakh
   a year by year five.
7. **Play-event retention** (§4.4).

Items 4–7 are all N-20 territory in `docs/NEXT.md` and none of them exist yet.

---

## 7. The honest summary

| Question | Answer |
|---|---|
| Will the stack support 60 weddings in 6 months? | **Yes — you will use 1–3% of what you are paying for.** |
| Will it support 10 in 4K? | **Yes.** 4K is stored and encoded once, and rarely delivered — adaptive streaming hands phones the 720p rung. |
| Is delivery going to hurt? | **No.** It is a constant 4.5% of revenue at every volume. |
| Are the prices good enough? | **83% gross margin at your projected mix.** |
| What will actually hurt? | **Storage you never delete**, and **not knowing which catalogue costs what**. |
| Do we need to change providers? | **No.** Revisit Vercel past ~300 weddings/month, Bunny for a committed contract past ~10 TB/month. |

The number I would watch is not delivery. It is **live gigabytes** — because it is the only one
that grows whether or not anyone pays you.

---

## Sources

Provider rates and the per-plan economics are in [`PRICING-MODEL.md`](./PRICING-MODEL.md), with
sources. Capacity figures are from [Vercel](https://vercel.com/pricing) and
[Supabase](https://supabase.com/pricing) pricing pages, August 2026.
