# Pricing

The plan, on one page. Three products, one axis, no hour counting.

Supersedes the working-out in [`PRICING-MODEL.md`](./PRICING-MODEL.md), which is kept because it
shows where every number came from and what was tried and rejected.

All prices **exclude 18% GST** (SAC 998314).

---

## The plans

| | Storage | Holds at 720p | 4K included | **1 year** | **3 years** |
|---|---|---|---|---|---|
| **Highlights** | 10 GB | ~4.5 hrs | — | **₹2,500** | **₹5,000** |
| **Wedding** | 40 GB | ~16.5 hrs | 20 min | **₹7,000** | **₹14,000** |
| **Cinema** | 80 GB | ~28 hrs | 90 min | **₹12,000** | **₹24,000** |

*Prices to the partner. With GST: ₹2,950 · ₹8,260 · ₹14,160.*

**Three years costs two.** Sell it that way — see [§4](#4-sell-three-years-not-one).

| Also | |
|---|---|
| Extra storage | **₹25 / GB / month**, for the months left on the plan |
| Extra 4K | **₹1,999** per 20 minutes |
| Renewal | **₹1,000 · ₹2,500 · ₹4,000** per year |
| Archive (storage only, restore on demand) — *proposed* | **₹499 · ₹999 · ₹1,499** per year; see §2 |
| Studio plan — *proposed* | **₹4,999–9,999 / yr**: custom domain served, presets, team seats, lapse dashboard. First three catalogues on any plan are free |
| Suggested retail | ₹6,000–8,000 · ₹18,000–25,000 · ₹30,000–40,000 |

The full list of what is sold, who pays and what each line needs built is `ROADMAP.md` §3.

### What each one is for

**Highlights** — a pre-wedding shoot, one function, or a highlights-only delivery. **It cannot
hold a whole wedding**, and should never be sold as one.

**Wedding** — every function from both sides, 10–15 hours, plus a 4K master of the highlights
film. **This is the normal purchase.**

**Cinema** — a multi-day wedding with a film per function, and an hour and a half in 4K.

I dropped the 20 GB tier. At 9.3 hours it cannot hold a wedding either, so its only job was to
make 40 GB look reasonable — and a partner *will* buy it for a full wedding and hit the cap at 80%
uploaded. Two plans that cannot do the job is one too many.

---

## 1. Quality is not a plan, and costs nothing up to 1080p

Bunny's standard encoding is free and covers everything to 1080p, so **720p and 1080p cost us
nothing to produce.** They differ only in the space they take:

| Quality | Per finished hour | 40 GB holds |
|---|---|---|
| **Standard — up to 720p** *(default)* | 2.15 GB | 18.6 hrs |
| **Full HD — up to 1080p** | 4.29 GB | 9.3 hrs |

**So the customer trades quality against runtime inside the space they bought, and you never count
hours.** Storage is the only meter, and the platform already measures it.

> "Everything is 1080p-capable at no extra cost. Keep the long functions at 720p and eighteen
> hours fits; put the films people rewatch in Full HD."

**2K and 4K are different** — they need premium encoding at **$0.15 per minute**, which is why they
come as a minute allowance rather than a setting. A whole wedding in 4K would cost ₹12,892 to
encode; twenty minutes costs ₹286.

**Set Standard as the default ladder.** At Full HD everywhere, a 15-hour wedding needs 64 GB and
fits nothing on the list.

---

## 2. What happens at the end

This is the part your three changes rewrote, and they rewrote it well.

### At handover, the couple is told they own it

When a partner hands the catalogue over, **the couple gets an email that says so**: this is yours
now, here is your login, here is the date it renews, here is what happens if you do not.

That one email fixes the biggest weakness in the old model. Previously a couple who had paid their
studio ₹20,000 would get an invoice a year later from a company they had never heard of. Now the
relationship transfers *explicitly*, while they are still delighted.

**Optionally, they can hand it back** — for a re-skin, an update, a new film. Good for the partner,
good for you, and it keeps the studio in the couple's life without owing them anything.

### The partner earns nothing on renewal — but keeps the page

Their work ended at handover, and they were paid for it. **This is cleaner than the 15% share I
proposed earlier** — ₹375 a year was never going to buy anyone's attention, and a revenue share
that small is just an accounting chore that also implies an obligation you do not want.

What the studio keeps instead, permanently and through every renewal: a **"Filmed by" credit**
the couple cannot remove, and a **referral link** on the catalogue that routes new enquiries to
them. Two hundred guests a year seeing their name is worth more than ₹375, and it gives them a
reason to nudge the couple to renew. (`ROADMAP.md` §3, stream R9.)

### Nothing is deleted. It goes cold instead.

> **Revised 6 September 2026.** This section previously specified *lapse → 30 days' grace →
> deleted*, on the argument that storage was the only compounding cost. Sandeep's decision is
> **no hard delete**; the archive tier below is what stops the cost compounding instead.
> `ROADMAP.md` §4 records the change.

Renewal lapses → **90 days' grace** (everything still plays, read-only for the couple, download
offered throughout) → **Archive**: streaming paused, every file retained, a one-click restore the
moment a renewal or archive fee is paid. `deleted` exists in the state machine only for an
explicit, recorded request from the couple.

**What it does for cost.** Bunny standard storage is about ₹0.95/GB/month, so a 40 GB Wedding
catalogue kept in archive costs ₹458 a year, a Cinema catalogue ₹917, a Highlights ₹115. The
archive tier is priced to cover that twice:

| | Highlights | Wedding | Cinema |
|---|---|---|---|
| **Archive** (storage only, restore on demand) | **₹499 / yr** | **₹999 / yr** | **₹1,499 / yr** |
| **Long-term archive**, prepaid | ₹1,999 / 5 yrs | **₹3,999 / 5 yrs · ₹6,999 / 10 yrs** | ₹5,999 / 5 yrs |

A lapsed catalogue that nobody pays for is archived at our cost for **twelve months after grace**,
then reminded again; the fee only starts once a couple chooses archive over renewal. The storage
bill still stops climbing — an archived catalogue is a fixed ₹115–917 a year, not a growing
Stream library — but it stops climbing because couples are paying to keep their wedding, not
because we removed it.

### The rules that make lapse safe

- **Say it at handover**, in the migration email, in plain words. Not in terms of service.
- **Warn at 60, 30, 7 and 1 days before expiry**, and at 30, 60 and 89 days into grace — on
  **WhatsApp, email and SMS**, to both partners. The studio's console prompts a phone call for
  couples on Cinema.
- **Show it in the console** — a banner the moment the catalogue lapses, not just an email.
- **Download everything, always** — before expiry, during grace, and from archive. Nobody is ever
  held to ransom for their own wedding.
- **Never archive silently.** Log it, keep the record, be able to say exactly what was sent and
  when. Deletion happens only on request, and the request is kept.

---

## 3. Adding storage, upgrading, downgrading

**Extra storage: ₹25/GB/month, charged only for the months remaining.** It expires with the plan,
so there is one renewal date forever.

> +5 GB with 9 months left = **₹1,125**

Deliberately dearer per GB than upgrading a tier, which makes the right choice obvious: **top up
for a few GB, upgrade past about five.** Say that out loud rather than letting them find it.

**Upgrading:** the difference, prorated by months remaining, no fee. Never delay it — it always
happens mid-delivery with a couple waiting.

**Downgrading:** at renewal only, and only if the content fits.

> "You are using 27 GB. To renew on Highlights, remove 17 GB — or renew on Wedding."

Mid-term downgrades are refused because the capacity has already been used. A second-year couple
deleting the long functions to keep the highlights film **is a save, not a loss** — the alternative
was not a full-price renewal, it was cancellation.

---

## 4. Sell three years, not one

**Three years for the price of two**, and it is the single best change available to you.

| | 1 year | 3 years | Effective |
|---|---|---|---|
| Highlights | ₹2,500 | **₹5,000** | ₹1,667/yr |
| Wedding | ₹7,000 | **₹14,000** | ₹4,667/yr |
| Cinema | ₹12,000 | **₹24,000** | ₹8,000/yr |

Margins barely move — 85% on a three-year Wedding against 84% on one year — because storage is
₹458 a year and nothing else recurs.

**Why it is worth more than the discount costs:**

- The partner sells it **once**, while the couple is happy and already spending on the wedding.
- **No renewal conversation with a stranger** for three years — the thing most likely to fail.
- **Cash up front**, which matters far more at 60 weddings than at 600.
- **The 30-day deletion rule never comes near a customer** in their emotional first year.

Lead with three years. Quote one year as the alternative, not the default.

---

## 5. The economics

Per wedding, year one, at typical traffic (300 guests × 20 minutes):

| Plan | Price | Storage | 4K encoding | Delivery | Cost | **Contribution** | Break-even |
|---|---|---|---|---|---|---|---|
| Highlights | ₹2,500 | ₹115 | — | ₹227 | ₹341 | **₹2,159 (86%)** | 23.9 |
| **Wedding** | ₹7,000 | ₹458 | ₹286 | ₹341 | ₹1,086 | **₹5,914 (84%)** | **8.7** |
| Cinema | ₹12,000 | ₹917 | ₹1,289 | ₹341 | ₹2,547 | **₹9,453 (79%)** | **5.5** |

Renewals, where the encoding is already paid and the traffic has passed:

| Plan | Renewal | Cost | Margin |
|---|---|---|---|
| Highlights | ₹1,000 | ₹149 | 85% |
| Wedding | ₹2,500 | ₹492 | 80% |
| Cinema | ₹4,000 | ₹951 | 76% |

**Break-even is against ₹51,570/year of Supabase Pro and Vercel Pro — and that is optional today.**
On the free tiers you are in profit on wedding #1. See [`SCALE-PLAN.md`](./SCALE-PLAN.md).

### At your projected volume

60 weddings in six months, 10 of them Cinema: **roughly 83% gross margin**, with infrastructure at
about 17% of revenue — over half of which is that fixed ₹45/month.

---

## 6. What is still unresolved

**Two things, and neither is arithmetic.**

### Your market says ₹5,000. This says ₹18,000–25,000.

You told me partners currently sell at ₹5,000 for four months. The suggested retail for Wedding is
**3.6–5×** that.

Either the ₹5,000 product is genuinely lesser — four months, no 4K, no custom domain, fewer
functions — or **your market is more price-sensitive than value-based logic assumes.**

**This is the biggest untested assumption here.** Ask the studio owner what a couple would actually
pay for "every function, three years, a 4K highlights film, their own address". **If the answer is
₹10,000, halve the ladder** — at 84% margins you can, and the model still works. What you must not
do is guess.

[`COMPETITORS.md`](./COMPETITORS.md) §3 is the evidence that this question is real: per wedding we
are **3–18× dearer** than Pixieset, ShootProof or OurStoria, because they sell the studio a
subscription and we sell the couple a product. Which frame the studio is in decides whether that
gap is irrelevant or fatal.

### GST

Prices above are **exclusive**, and the price list must say so. Your Bunny, Vercel and Supabase
bills are imports of service and attract reverse-charge GST, reclaimable as input credit **only if
registered**. An accountant, not me — but decide it before quoting.

---

## 7. Before you sell

1. **Set the encoding ladder to 360p–720p** by default. Without this, nothing on this list holds a
   wedding.
2. **Confirm Keep Original Files and MP4 Fallback are off** — each roughly doubles storage.
3. **Upload one real 15-hour wedding** and read the actual GB off the catalogue overview. Correct
   §1 with the measurement.
4. **Decide GST treatment**, and print it on the price list.
5. **Ask the studio owner the retail question** in §6.

Then build, in order: the **migration email at handover**, the **expiry warnings and download
offer**, **delivery metering**, the **archive transition**, and **billing**. That is Phases 1 and
2 of [`ROADMAP.md`](./ROADMAP.md); none of it exists yet.

**Until it does, sell three-year terms and invoice manually.** Three years is also the version that
needs the least software — no renewal flow, no lapse handling, no archive conversation for
thirty-six months.

---

## What changed from the earlier model

| | Before | **Now** |
|---|---|---|
| Plans | 5 | **3** |
| Tiers that cannot hold a wedding | 2 | **1, named honestly** |
| Grace before deletion | 12 months | 30 days + download → **(Sept 2026) 90 days, then archive; no deletion** |
| Partner renewal share | 15% | **None** — credit and referral link instead |
| Couple learns they own it | Never | **Email at handover** |
| Default term | 1 year | **3 years** |
| GST | Ignored | **Stated, exclusive** |
| Storage bill, year 5 | ₹1,14,939 | **₹75,429** |
