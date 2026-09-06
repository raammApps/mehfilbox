# ROADMAP — from what is built to what is proposed

**The bridge between `PRODUCT.md` (what exists today) and the product Heirloom Films is meant to
become.** Written 6 September 2026 from three inputs: the codebase and its documents as they
stand, the competitor and feature review of the same date (`reference/competitor-and-feature-plan-2026-09.docx`),
and Sandeep's decisions on lifecycle and branding recorded in §4.

`PRODUCT.md` stays the canonical surface-by-surface map and `NEXT.md` stays the ordered backlog.
This file does what neither of them does: it names the **destination**, groups the work into
phases that each leave the product sellable, and ties every feature to the money it earns.

Read this once when planning. Read `NEXT.md` when picking up work.

---

## 0. Where the product stands, in one paragraph

Phase 0 is built, deployed on `heirloomfilms.in`, and verified against the real services: a guest
catalogue that reads as a streaming product on a 375px phone, a player that starts in under 1.5 s
on 4G, an admin console with a customizer and module registry, resumable multi-gigabyte upload to
Bunny, English and Hindi on the guest surface, passcodes, a working partner → couple handover, and
an entitlements resolver that nothing yet writes to. **What does not exist is everything that
touches money or the passage of time**: application email, payment, renewal, lapse, archive, metering, plan
assignment. The demo catalogue on production has no real footage. `PRODUCT.md` §7 has the
dependency order; it is unchanged by this document, only extended.

---

## 1. The destination

A studio in any Indian city films a wedding, uploads every function from both sides in an
afternoon, publishes a catalogue with their own brand on it, and sends the couple one WhatsApp
message. Two hundred guests open it without an account. After twelve months the couple renews
directly with Heirloom at a price that is an impulse, the studio's name stays on the page, and
nothing is ever deleted — a lapsed catalogue goes cold, not away. The studio sees which couples
are due, which films were watched, and gets a lead from every catalogue that carries their credit.

Everything below is the distance between §0 and that paragraph.

---

## 2. The proposed product, against what exists

Status uses the `PRODUCT.md` vocabulary — **Built**, **Partial**, **Missing** — and each row names
the ticket in `NEXT.md` that closes it. Rows marked *(new)* are not in `PRODUCT.md` yet; they are
added there in the same commit as this file.

### 2.1 Couple and family

| | Status | Ticket | Phase |
|---|---|---|---|
| Streaming catalogue: billboard, rows, letter, timeline, player, resume, deep links | **Built** | — | 0 |
| No-login viewing with profile gate and optional passcode | **Built** | — | 0 |
| Multi-event structure (a row per function, both sides) | **Built** — rows are modules; nothing forces a "season" model | — | 0 |
| Adaptive playback tuned for 4G; 360p–720p ladder as default | **Partial** — ladder not yet set on the library | N-24a | 1 |
| Share a film to WhatsApp with poster preview | **Built** (`ShareButton`, OG image) | — | 0 |
| Share a photograph; photograph captions | **Missing** | N-34 | 3 |
| Likes on films and photographs | **Built** (N-31; migration 0008 pending on production) | held by Sandeep | 1 |
| Guest surface in Hindi, default chosen by the studio | **Partial** — toggle exists, no org-level default | N-29 | 1 |
| Told they own it, with renewal date and terms | **Missing** | N-21 | 1 |
| Download everything, at any time | **Missing** | N-22 | 1 |
| Renew, upgrade, add storage, self-service | **Missing** | N-20 | 2 |
| Family circles *(new)* — scoped links per side, "who watched" | **Missing** | N-38 | 3 |
| Cast to TV (Chromecast / AirPlay) *(new)* | **Missing** | N-40 | 4 |
| Subtitles for speeches and rituals *(new)* | **Missing** | N-41 | 4 |
| Anniversary moment *(new)* — a clip and a message on the date, doubling as the renewal nudge | **Missing** | N-39 | 3 |
| Hand back to the studio for a re-skin or an update | **Missing** | N-42 | 4 |
| Guest uploads on the day; guestbook *(new)* | **Missing** | N-45 | 5 |

### 2.2 Studio (partner)

| | Status | Ticket | Phase |
|---|---|---|---|
| Wizard, customizer, templates, branding, publish checklist | **Built** | — | 0 |
| Resumable upload proven against a network drop | **Built** | — | 0 |
| Plan capacity shown before and during upload ("holds ~9 hrs", warn at 80%) | **Missing** | N-23 | 1 |
| Every save legible (film list saves silently today) | **Partial** | N-35 | 1 |
| Saved branding presets, more templates | **Missing** | N-26 | 3 |
| Delivery message *(new)* — one-click WhatsApp/email launch to the couple from the overview | **Missing** | N-36 | 1 |
| Delivery tracking *(new)* — opened, watched, watch-time; "not opened in 7 days" | **Partial** — play events are stored, nothing reads them per catalogue | N-37 | 3 |
| Lapse dashboard *(new)* — which couples are due; renew on their behalf | **Missing** | N-37 | 3 |
| Client premiere *(new)* — scheduled reveal with countdown | **Missing** | N-43 | 4 |
| Custom domain served, not just stored | **Partial** | N-44 | 4 |
| Team seats and roles | **Partial** — `admin` / `uploader` exist; no invite flow | N-27 | 2 |
| Studio portfolio page on their subdomain | **Missing** | N-46 | 5 |
| Timestamped feedback on a draft cut | **Missing** | N-47 | 5 |

### 2.3 Platform (us)

| | Status | Ticket | Phase |
|---|---|---|---|
| Notification provider seam *(new)* — email, WhatsApp, SMS behind one interface, fake driver for tests | **Missing** — Supabase Auth mail (registration, reset) is live via Resend since N-17; the application itself sends nothing | N-50 | 1 |
| Razorpay: credits for partners, renewal and storage for couples | **Missing** | N-20 | 2 |
| Entitlements written by payment, plan assignment in the console | **Partial** — resolver built, nothing writes | N-20, N-27 | 2 |
| Lifecycle: included → active → grace → **archive**; never `deleted` automatically | **Partial** — state machine exists with a `cold` state; nothing drives it | N-24 | 2 |
| Delivery metering | **Missing** | N-25 | 2 |
| Revenue and usage view | **Missing** | N-27 | 2 |
| Platform admin writes with an audit trail | **Missing** | N-27 | 2 |
| Data residency and DPDP consent / deletion-on-request | **Partial** — Mumbai region; no consent record, no request flow | N-48 | 4 |
| Public API / webhooks for studio CRMs | **Missing** | N-49 | 5 |

### 2.4 Deliberately not on the roadmap

- **A theme marketplace.** `PRODUCT.md` §6 still holds: build presets first, a marketplace when a
  third party asks to publish into one.
- **Photo proofing, print sales, contracts, CRM.** That is Pixieset's product. Our customer is a
  videographer; `COMPETITORS.md` §5 says why chasing photographers is fatal.
- **Native TV apps.** Casting from the phone covers the living-room case at a fraction of the cost.
  Revisit when a Cinema-tier customer asks for the app by name.
- **A revenue share to the studio on renewals.** Decided against (§4). The studio gets brand
  continuity and a lead, not a cheque.

---

## 3. Revenue streams

What is sold, who pays, what it needs built, and where it stands. Prices are the current
`PRICING.md` ladder where one exists; new lines carry proposed prices and are marked so.

| # | Stream | Who pays | Price | Needs | Status |
|---|---|---|---|---|---|
| R1 | **Catalogue plan, year one** — Highlights / Wedding / Cinema | Studio (resold to the couple in their package) | ₹2,500 / ₹7,000 / ₹12,000; three years for the price of two | Manual invoice today; N-20 for self-service | **Sellable now, invoiced by hand** |
| R2 | **Couple renewal** (streaming) | Couple, directly | ₹1,000 / ₹2,500 / ₹4,000 per year | N-50, N-21, N-20, N-24 | Missing |
| R3 | **Archive tier** *(new)* — storage only, streaming paused, one-click restore | Couple | *proposed* ₹499 / ₹999 / ₹1,499 per year by plan size | N-24 (archive state), N-20 | Missing |
| R4 | **Long-term prepaid archive** *(new)* — 5 or 10 years | Couple, or a relative as a gift | *proposed* ₹3,999 / ₹6,999 (Wedding size) | N-24, N-20 | Missing |
| R5 | **Extra storage** | Studio or couple | ₹25 / GB / month for the months left | N-20, N-23 | Missing |
| R6 | **Extra 4K** | Studio | ₹1,999 per 20 minutes | N-20; premium-encoding flag on the library | Missing |
| R7 | **Studio plan** *(new)* — custom domain served, presets, team seats, portfolio page, lapse dashboard, analytics | Studio, yearly | *proposed* ₹4,999–9,999 per year; first three catalogues on any plan free | N-26, N-27, N-37, N-44 | Missing |
| R8 | **In-catalogue upsell** *(new)* — studio offers extended cut, raw download, album, USB; we take a commission | Couple, via the studio | *proposed* 10% of the item | N-20, a `store` module | Missing — Phase 4 |
| R9 | **Referral lead** *(new)* — "Get your wedding on Heirloom" on every catalogue, routed to the delivering studio | Nobody, directly | Free; it is the studio's reason to promote renewals | N-36 | Missing — Phase 3 |

Three notes on the table.

**R3 replaces deletion.** `PRICING.md` §2 priced a 30-day deletion policy on the grounds that
storage was the only compounding cost. Archive keeps the cost from compounding *without* deleting:
Bunny standard storage is about ₹0.95/GB/month, so a 40 GB Wedding catalogue costs ₹458 a year to
keep, which the archive price covers twice over. The saving deletion bought (≈₹40,000/year at
year five) is instead bought by the archive fee — with the difference that the couple pays it
gladly, and nobody ever posts that we deleted their wedding. `PRICING.md` §2 is rewritten in the
same commit as this file.

**R7 is where the studio's money goes once R1 is free-to-start.** The competitor review found the
per-wedding market at ₹1,900–9,500 (viddrop, WeddingFilmHub) and the subscription market at
₹800–2,300 per wedding for a 30-wedding studio. Charging a studio anything *before* they have
delivered a wedding on the platform is the thing most likely to lose them. "First three free, then
per catalogue" costs at most ₹3,000 of contribution per studio and removes the objection entirely.

**R9 is the answer to "no cut on renewals".** A studio that earns nothing when a couple renews
will not remind them to. A studio whose credit and enquiry link stay on the page for as long as
the couple keeps renewing has a reason to — every renewal is another year of their name in front
of two hundred guests. This is the same "distribution, not delivery" argument `COMPETITORS.md` §7
makes for the first sale, extended to every year after.

---

## 4. Decisions that change existing documents

Each of these is Sandeep's call, made 6 September 2026, and each contradicts something written
earlier. The earlier text is edited in place with a note; this list is the record.

| Decision | Was | Now | Documents touched |
|---|---|---|---|
| **No hard delete** | Lapse → 30 days' grace → deleted (`PRICING.md` §2, `NEXT.md` N-24) | Lapse → 90 days' grace (read-only, download offered) → **archive** (storage only, restore on payment). `deleted` is reachable only by an explicit request from the couple, recorded. | `PRICING.md`, `PRODUCT.md`, `NEXT.md`, `SCALE-PLAN.md` §4.1 |
| **Multi-channel notifications** | Email only (N-17 wired Resend into Supabase Auth; the app sends nothing itself) | A notification seam with email, WhatsApp Business API and SMS drivers; every lifecycle message goes on all channels the couple has; the studio is prompted to phone high-value couples from their dashboard | `NEXT.md` N-50, N-21; `PRODUCT.md` §2 |
| **Studio branding survives renewal** | `presentedBy` snapshotted at handover — a field, not a promise | A permanent "Filmed by" credit and the studio's referral link on the couple's page, for as long as the catalogue exists, on every renewal; couple cannot remove the credit, can hide the link | `PRODUCT.md` §1.3, spec doc 15 §2 (banner) |
| **No revenue share to the studio** | Already decided in `PRICING.md` §2 | Unchanged — restated here because R9 is what replaces it | — |
| **Studio pays to integrate; couple pays year one via the studio; couple renews with us** | Doc 01 §7 had the planner's licence covering three months, then the couple paying monthly | Twelve months included in the studio's purchase (already in `PRICING.md`); the "integration" fee becomes the Studio plan (R7), optional, with the first three catalogues free | `PRICING.md` §1 |

---

## 5. Phases

Each phase leaves the product sellable and does not depend on a later one. Estimates are in
Claude-Code sessions of the kind `NEXT.md` sizes against, not calendar time; at 5–10 hours a week
each phase is roughly a month.

### Phase 1 — Deliverable and honest  *(what a studio needs before they hand a couple the link)*

The catalogue can be delivered, the couple is told what they own, nothing can be lost, and the
demo is real.

| Ticket | Item | Why here |
|---|---|---|
| N-50 | Notification seam — email first (Resend, already the auth mailer), WhatsApp and SMS drivers behind the same interface, fake driver in tests | Blocks the migration email, the delivery message, every warning |
| N-21 | Migration email and the warning schedule (60 / 30 / 7 / 1 before; 30 / 60 / 89 into grace), on every channel | The biggest hole in the commercial model |
| N-22 | Download everything | Gates any lapse behaviour, archive included |
| N-23 | Plan capacity in the console | Pricing depends on it; two hours |
| N-29 | Locale at account creation | A Hindi-first studio should not operate in English |
| N-35 | Legible saves everywhere | Embarrassing in front of a planner |
| N-36 | Delivery message — one-click launch to the couple with poster, names and "now streaming" | The moment the product gets forwarded |
| N-24a | Encoding ladder set to 360p–720p; Keep Original and MP4 Fallback confirmed off | Nothing on the price list holds a wedding otherwise |
| N-6 / N-14 | Real footage in the demo; publish `swarit-and-smriti-2026` as the public demo | The pitch. Sandeep, not an agent |
| held | Migration 0008, `platform_admins` row, three key rotations | Listed in `NEXT.md`; do them first |

**Exit test:** a studio uploads a real wedding, publishes, sends the delivery message from the
console, and the couple receives it on WhatsApp and email with a working link. Invoice by hand.

### Phase 2 — Money and time  *(the platform can be paid, and catalogues age correctly)*

| Ticket | Item |
|---|---|
| N-20 | Razorpay: partner credits, couple renewal, storage and 4K add-ons; webhook verified and reconciled like the Bunny one |
| N-24 | Lifecycle driver: included → active → grace → archive; restore on payment; explicit-request deletion only, logged. Archive moves renditions to storage and releases the Stream entry, or keeps them in place if the cost difference is negligible — measure first |
| N-25 | Delivery metering |
| N-27 | Platform admin writes: create tenant, assign plan, suspend, revenue and usage view, audit trail |
| R3, R4 | Archive and long-term archive as purchasable plans (rows in `plans`) |

**Exit test:** a couple whose year has ended renews on their phone with UPI without anyone at
Heirloom touching a database; a couple who does not renew is archived, not deleted, and can
restore.

### Phase 3 — The studio's reasons to sell it  *(brand, leads, and knowing what is happening)*

| Ticket | Item |
|---|---|
| N-26 | Branding presets and more templates |
| N-36b | Permanent "Filmed by" credit and referral link, surviving handover and every renewal |
| N-37 | Delivery tracking and the lapse dashboard; renew on the couple's behalf |
| N-38 | Family circles — scoped links per side, "who watched" |
| N-39 | Anniversary moment |
| N-34 | Photograph sharing and captions |
| R7 | Studio plan as a purchasable entitlement |

**Exit test:** a studio owner can say, from their console, which of last season's couples are due,
how many guests watched each film, and how many enquiries the credit link sent them.

### Phase 4 — The catalogue earns more  *(and the platform grows up)*

| Ticket | Item |
|---|---|
| N-40 | Cast to TV |
| N-41 | Subtitles (AI-generated, operator-corrected) |
| N-42 | Hand back to the studio |
| N-43 | Client premiere |
| N-44 | Custom domain served and verified automatically |
| N-48 | DPDP consent and deletion-on-request |
| R8 | In-catalogue upsell with commission |

### Phase 5 — Later, on demand

N-45 guest uploads and guestbook · N-46 studio portfolio page · N-47 draft feedback · N-49 API
and webhooks · native TV apps · marketplace. None of these is scheduled; each is taken up when a
paying studio asks for it by name.

---

## 6. Open questions that gate pricing, not code

1. **The retail question** (`PRICING.md` §6) is still unanswered: what will a couple actually pay
   a studio for "every function, three years, a 4K highlights film". Ask one studio owner before
   Phase 2 sets prices in `plans`.
2. **WhatsApp Business API provider** — Interakt, Gupshup, MSG91 or Twilio. Template approval takes
   days, so pick one during Phase 1 even if the driver ships in Phase 2.
3. **Archive default at lapse** — does a lapsed catalogue archive automatically at ₹0 (our cost,
   our goodwill) or only once the archive fee is paid? Proposed: 12 months free archive after
   grace, then the fee; a wedding never disappears inside two years of being filmed.
4. **GST registration** — decided before the first self-service invoice.

---

| Related | |
|---|---|
| [`PRODUCT.md`](./PRODUCT.md) | Surface-by-surface status; the rows this file adds are marked *(new)* there too |
| [`NEXT.md`](./NEXT.md) | The ordered backlog; tickets N-34 to N-50 originate here |
| [`PRICING.md`](./PRICING.md) | The ladder; §2 rewritten for archive |
| [`COMPETITORS.md`](./COMPETITORS.md) | §1 and §3 updated with the per-wedding competitors found in September |
| `reference/competitor-and-feature-plan-2026-09.docx` | The review this file merges |
