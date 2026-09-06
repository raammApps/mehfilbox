# The studio-only model — proposal

**Status: proposed by Sandeep, 6 September 2026; argued for here; not yet decided (P-1, P-2).**
If adopted, §5 is the list of document and code changes.

## 1. The rule

**Mehfilbox sells to studios only.** Every rupee — first delivery, upgrade, renewal,
archive, long-term archive, storage, 4K — is invoiced to the studio at a base price, which the
studio marks up to the couple as they see fit. The couple is never Mehfilbox's billing customer.

The one exception (P-1, recommended): **the escape hatch.** When a studio is *gone* — account
closed, Studio plan unpaid past its own grace, or no response 90 days after a catalogue lapsed —
the couple may pay Mehfilbox directly, at list price, to renew or archive. It is not a channel; it
is what makes "your wedding survives your studio" true.

## 2. Why it is the better model

- **One customer, one invoice shape, one payment flow.** B2B, GST on both sides in most cases
  (the studio claims input credit), Razorpay collapses from two flows to one. No consumer
  billing: no UPI failure handling, refunds, chargebacks, consumer complaints.
- **No online price comparison.** A couple cannot find "₹2,500" next to their studio's ₹8,000.
  The studio's markup is invisible to Mehfilbox and to the couple, which is how every other
  wedding vendor already works.
- **Accounting is honest and simple.** Mehfilbox's revenue is exactly what studios pay. The markup
  is the studio's revenue and never touches Mehfilbox's books; there is no agency, commission or
  pass-through arithmetic to explain.
- **The studio stays the relationship owner** for the life of the catalogue, which is what makes
  them sell it (spec doc 15 §7 already assumed this).

## 3. The weakness, and how it is contained

**Renewals become the studio's job, and studios are bad at collecting ₹2,500 three years after
a wedding.** Some close, change hands, or stop caring. Left alone, this makes Mehfilbox exactly
what its own `COMPETITORS.md` §4 positioned against: a gallery that goes dark when the studio
stops paying.

Containment, in order of effect:

1. **Sell three years up front** (already the default in `PRICING.md` §4). Most catalogues then
   never reach a renewal conversation in the studio's lifetime.
2. **Long-term archive sold through the studio** at delivery ("keep it for ten years" as a line
   on their quote).
3. **The lapse dashboard (N-37)** makes renewals a list the studio works through each season,
   with one-click renew-on-behalf.
4. **The escape hatch** for the studio that is gone.
5. **Archive is free for twelve months after grace and nothing is ever deleted** (D-11, D-20), so
   the worst case for a couple is a paused catalogue they can restore later — not a lost one.

## 4. Accounting, records and tax — what to set up

*An accountant should confirm all of this; it is a checklist, not advice.*

- **Invoices:** to the studio, ex-GST with 18% shown (SAC 998314), studio GSTIN on the invoice
  where they have one. Unregistered small studios pay the inclusive figure.
- **TDS:** some studios will deduct TDS on payments to Mehfilbox; keep 26AS reconciliation in the
  bookkeeping from the first invoice.
- **Revenue recognition:** a Deliver (90 days), Keep (12 months) or 3-year purchase is earned over
  its term — deferred revenue, released monthly. **Prepaid credit packs are a liability until each
  credit is used**, which is the reason to expire credits at 24 months (P-2) rather than never.
- **The Studio plan** is a 12-month subscription, deferred the same way; the three included
  credits are recognised as they are consumed.
- **Records per catalogue:** payer org (`origin_org_id`), plan, term start/end, every invoice and
  payment, every state transition, every notification sent. The `notifications` table (N-50) and
  the lifecycle log (N-24) already require most of this; add an `invoices` table in N-20.
- **Markup:** never recorded. Mehfilbox does not know and does not need to know what the couple
  paid the studio.

## 5. What changes if adopted

### Documents

| Document | Change |
|---|---|
| `PRICING.md` | "Who is billed when" becomes "**Who is billed: the studio.**" Renewal, archive and long-term archive rows change payer to *Studio (marks up)*; add the escape-hatch paragraph; drop "couple, directly, from year two". |
| `ROADMAP.md` §3 | R2, R3, R4 payer column → studio; R10 unchanged; add R11 escape-hatch renewals (expected to be rare). §4 add the decision. §1 destination paragraph: "the studio renews it with us, and the couple's page keeps the studio's name". |
| `ROADMAP.md` §2 / `PRODUCT.md` §1.3 | "Renewal" row for the couple → "Renewal, via studio; direct only under the escape hatch". "Told they own it" → "Told what they have and who manages it". |
| `NEXT.md` N-20 | One Razorpay flow, not two. Escape-hatch checkout is a variant of the same flow with `payer = couple`, gated by the studio-gone rule. |
| `NEXT.md` N-21 | Migration email → "handover email": this is yours to watch, download and share; your studio manages the plan; here is the end date. Expiry warnings go to the **studio first**, couple copy says "contact your studio". |
| `NEXT.md` N-24 | Lifecycle unchanged; add the `studio_gone` predicate that unlocks the escape hatch. |
| `NEXT.md` N-37 | Lapse dashboard becomes core, not Phase 3 — move to Phase 2, it is now the renewal mechanism. |
| `NEXT.md` N-39 | Anniversary moment goes to the couple (it is content), with the renewal nudge to the studio. |
| `COMPETITORS.md` §4 | "The couple owns it" → "The wedding survives the studio": control transfers to the couple; billing stays with the studio; the escape hatch is the guarantee. |
| `docs/reference/00-decision-log.md` | D-11 to D-22, then D-23 (this model) once decided. |
| spec doc 15 §4 | Superseded banner: one payer. |

### Code (nothing to do until Phase 2, but it shapes N-20 and N-24)

- `catalogues.origin_org_id` is the **payer** for life; a `payer_org_id` is not needed.
- Handover moves control (`org_id`) but not billing; the couple org has no billing methods unless
  the escape hatch is open for that catalogue.
- Escape hatch predicate: origin org `status ∈ {closed, suspended}` **or** plan lapsed past its
  grace **or** catalogue lapsed ≥ 90 days with the studio's last warning unanswered. Computed, not
  stored; logged when it unlocks a purchase.
- Invoices table with studio GSTIN, TDS field, term start/end for deferral.

## 6. What it does *not* change

The guest experience, the customizer, the module registry, handover as a control transfer, the
credit and referral link (D-13), the ladder (D-17), the lifecycle (D-11), notifications (D-12),
the Studio plan (D-18). The product is the same; only the invoice's addressee is fixed.
