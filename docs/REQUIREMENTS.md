# Heirloom Films — target product requirements (draft, 6 September 2026)

Consolidates the September decisions (D-11 to D-22) with the built product. **This is the target,
not the built product** — `PRODUCT.md` is what exists today, surface by surface, and disagrees with
this document deliberately.

Items marked **[P-n]** depend on a decision that has **not been made**; see the "Open" section of
[`reference/00-decision-log.md`](./reference/00-decision-log.md). Nothing here marked `[P-n]` is
built or should be built. Ticket numbers refer to [`NEXT.md`](./NEXT.md).

Merged into the repo on 7 September 2026, with the status lines corrected against what had shipped
in the meantime — the draft was written on the 6th and three of its open items were done by then.

---

## 1. Product statement

A private, streaming-style catalogue of a couple's wedding films and photographs, produced by a
studio on their own brand, opened by two hundred guests from a WhatsApp link without an account,
tuned for a mid-range Android on 4G, and kept — never deleted — for as long as someone pays a small
fee. Sold to studios per wedding; the couple's keepsake is the product, the studio is the channel.

## 2. Personas

| | Who | What they need |
|---|---|---|
| **Platform admin** (Heirloom) | Sandeep | Create/suspend studios, assign plans, see revenue and usage, audit every write; never impersonate without a trail |
| **Studio** (operator; `orgs.kind = partner`) | Owner, editor, front desk | Register, brand once, set up a wedding in 30 minutes, deliver by one WhatsApp, know who watched, know who is due, buy credits |
| **Couple** (`orgs.kind = couple` after handover) | Two people, two families | Watch, share, download everything, control the passcode, hand back for a re-edit; renew or archive [via studio — P-1] |
| **Guest** | Up to ~300 per wedding | Open a link, pass a profile gate, watch in under 1.5 s on 4G, share a film |

## 3. Plans and billing

### 3.1 The ladder (ex-GST; inclusive shown first wherever a studio reads it — D-19)

| Plan | Term | Storage (originals + renditions) | 4K | Price to studio |
|---|---|---|---|---|
| **Deliver** | 90 days; 180 for two credits | 100 GB | — | ₹1,999; 5 for ₹7,999 |
| **Keep** | 12 months, renewable | 100 GB | 20 min | ₹6,000; 3 years ₹12,000 |
| **Cinema** | 12 months, renewable | 200 GB | 90 min | ₹12,000; 3 years ₹24,000 |
| **Studio plan** | 12 months | — | — | ₹4,999, includes 3 Deliver credits in year one [P-5: mandatory] |

Add-ons: Deliver → Keep upgrade ₹2,500 base (day 60, to the studio); renewal ₹2,500 / ₹4,000;
archive ₹999 / ₹1,499; long-term archive ₹3,999 / 5 yrs, ₹6,999 / 10 yrs (Keep), ₹5,999 / 5 yrs
(Cinema); extra storage ₹25/GB/month for the months left; extra 4K ₹1,999 per 20 min.

### 3.2 Billing rules

- B-1 Every purchase in the first twelve months after delivery is the studio's (D-16).
- B-2 **[P-1]** If studio-only is adopted: every purchase, forever, is the studio's; the couple
  may pay directly only under the escape hatch (studio gone). Otherwise: renewals from year two
  are the couple's, directly.
- B-3 Studios buy prepaid credits; creating a catalogue spends one; credits **[P-2]** expire at
  24 months / never.
- B-4 Upgrades are the prorated difference, immediate. Downgrades at renewal only, and only if
  the content fits.
- B-5 Every invoice carries GSTIN where the studio has one, the 18% split, the term start and end
  (for deferral), and a TDS field.
- B-6 The studio's markup is never recorded.

## 4. Lifecycle — the state machine

`sub_status` exists today: `included | active | grace | lapsed | cold | deleted`. Target
semantics (rename `cold` → `archived` in the driver, keep the column value if migration cost is
not worth it):

```
draft ──publish──▶ included ──(term ends)──▶ grace ──(90 d)──▶ archived ──(payment)──▶ active
                      │                        ▲                  │
                      └──(renewal/upgrade)──▶ active ─────────────┘ (term ends → grace)
archived ──(explicit recorded request by the couple)──▶ deleted
```

| State | Guest sees | Couple can | Timers |
|---|---|---|---|
| `included` / `active` | Everything | Everything, incl. download | Warnings at T-60, T-30, T-7, T-1 |
| `grace` (90 d) | Everything | Everything, read-only settings, download | Warnings at G+30, G+60, G+89 |
| `archived` | "This catalogue is archived — restore" screen with the studio's credit | Download everything; restore on payment | Free for 12 months, then archive fee due; reminders quarterly |
| `deleted` | 404 | — | Only on recorded request |

Deliver-specific: at T-30 (day 60) the **studio** receives the Keep offer (R10). A Deliver
catalogue that reaches day 90 unconverted goes to `grace` → `archived` on the same schedule.

Originals: retained through `included`/`active`/`grace`; at `archived` the archive job removes
originals (4K films excepted) and keeps the best rendition [P-3 decides where they lived].

Every transition is written to a `lifecycle_events` table (catalogue, from, to, cause, actor,
timestamp).

## 5. Notification matrix

Provider seam N-50 (`fake` → `resend` → `msg91` WhatsApp + SMS). Every send is recorded. All
templates in English and Hindi, covered by the i18n test.

| Event | To | Channels | Ticket |
|---|---|---|---|
| Registration, password reset | Studio | Email (Supabase Auth, live) | done |
| Catalogue published — delivery message | Couple (both partners) | WhatsApp, email | N-36 |
| Handover | Couple | WhatsApp, email | N-21 |
| Deliver day-60 Keep offer | Studio; couple copy "ask your studio" | WhatsApp, email | N-24 |
| Expiry T-60/30/7/1; grace G+30/60/89 | Studio first; couple [P-1: copy says contact studio / direct] | WhatsApp, email, SMS; console banner; "call them" prompt for Cinema | N-21, N-24 |
| Archived; archive fee due; quarterly reminders | Studio and couple | WhatsApp, email | N-24 |
| Anniversary | Couple (content); studio (nudge) | WhatsApp, email | N-39 |
| Not opened in 7 days | Studio | Email | N-37 |
| Restore confirmed, payment receipt, invoice | Payer | Email (+ WhatsApp receipt) | N-20 |

## 6. Feature requirements by area

Status today from `PRODUCT.md`; phase from `ROADMAP.md` §5.

### 6.1 Guest and couple
- G-1 Streaming catalogue (billboard, rows, letter, timeline, player, resume, deep links) — built.
- G-2 No-login viewing; profile gate; optional passcode with lockout — built.
- G-3 Playback start < 1.5 s on 4G on a mid-range Android; 360p–720p ladder default, 1080p
  selectable per film — ladder not yet set (N-24a).
- G-4 Share a film to WhatsApp with poster preview and `?t=` deep link — built.
- G-5 Share a photograph; captions — **built** (7 Sep). A photograph's address is the catalogue
  page plus `?photo=<id>`; captions save on blur through a PATCH route.
- G-6 Likes — **built**, counted across guests and shown; migration `0008` applied with RLS.
- G-7 Guest surface in EN/HI with the studio's default — N-29.
- G-8 Download everything, always: per-file originals during the term, best rendition after;
  manifest + signed links, never a server-built zip — N-22.
- G-9 Family circles: scoped links per side, "who watched" — N-38.
- G-10 Cast to TV (Chromecast/AirPlay) — N-40. Subtitles — N-41. Hand back to studio — N-42.
- G-11 Restore screen for archived catalogues, with the studio's credit and enquiry link — N-24.

### 6.2 Studio
- S-1 Registration, branding, templates, customizer, publish checklist — built.
- S-2 Studio plan purchase with three credits; credit balance visible; buy packs — N-20.
- S-3 Plan step in the wizard (Deliver / Keep / Cinema), capacity shown ("holds ~N hours"), warn
  at 80% — N-23.
- S-4 Resumable upload of originals; renditions produced by Bunny; both counted against the cap —
  built + N-24a.
- S-5 Every save legible — **built** (7 Sep). One `SaveState` across the film list, customizer
  and photographs, including a `Not saved` the film list could not previously say.
- S-6 Delivery message, one click, recorded — N-36.
- S-7 Delivery tracking: opened, watch-time per film, not-opened alert — N-37.
- S-8 Lapse dashboard: every originated catalogue with state and end date; renew/upgrade/archive
  on behalf; day-60 offers listed — N-37 [move to Phase 2 under P-1].
- S-9 Permanent "Filmed by" credit and enquiry link, surviving handover and renewals — N-36b.
- S-10 Branding presets, more templates — N-26. Custom domain served and verified — N-44. Team
  seats with invite — N-27.
- S-11 Client premiere — N-43. Portfolio page — N-46. Draft feedback — N-47.

### 6.3 Platform
- P-1 Platform admin: create/suspend studio, assign plan/credits, revenue and usage view, audit
  trail on every write — N-27.
- P-2 Razorpay: one flow (studio) [+ escape-hatch variant under P-1]; webhook verified and
  reconciled by cron; invoices table — N-20.
- P-3 Lifecycle driver per §4; archive job; `lifecycle_events` — N-24.
- P-4 Delivery metering per catalogue — N-25.
- P-5 Notification seam per §5 — N-50.
- P-6 DPDP: consent record at profile gate, deletion-on-request flow, data in India — N-48.
- P-7 API/webhooks for studio CRMs — N-49 (Phase 5).

### 6.4 Landing page (N-51, after real footage)
Price in the hero; With/Without Drive table; three template screenshots; FAQ ("after 90 days it
archives — nothing is deleted"); public demo one tap away; "originals always downloadable,
streaming tuned for 4G" — never "no compression".

## 7. Revenue streams (from `ROADMAP.md` §3, payer per [P-1])

R1 credits (Deliver/Keep/Cinema) · R10 Deliver → Keep upgrade · R2 renewals · R3 archive ·
R4 long-term archive · R5 extra storage · R6 extra 4K · R7 Studio plan · R8 in-catalogue upsell
(Phase 4, commission) · R9 referral lead (no revenue; the studio's incentive) · [R11
escape-hatch renewals, expected rare].

Unit economics (originals kept, Bunny ₹0.95/GB-month): Deliver cost ≈₹500 (75%), Keep year one
≈₹2,100 (65%), Cinema ≈₹4,600 (62%); renewal ≈₹490 (80%); archive Keep ≈₹340 (66%).

## 8. Non-functional

- Playback start < 1.5 s on 4G; LCP and CLS gates already in CI stay.
- Guest bytes never pass through the app (Bunny direct; posters redirect; photos off a pull zone).
- Mumbai region for Vercel functions and Bunny storage; India data residency.
- Signed, expiring, directory-scoped playback URLs; token auth on; no public directory of
  catalogues (anon grants revoked).
- Every write scoped by `org_id` via `requireOperator` / `requireOwnedCatalogue`; RLS as the
  second boundary; `platform_admins` outside the org graph.
- Second-region copy of originals during the term; checksum on upload; integrity report monthly.
- Suite runs offline against `fake`/`memory` drivers; every provider has a fake; every gate is
  proven by breaking the thing it guards.

## 9. Data model additions (for N-20, N-24, N-50)

`plans` rows for Deliver, Keep, Cinema, Studio plan, archive, long-term archive, upgrade ·
`credits` (org, plan, purchased_at, expires_at [P-2], consumed_by_catalogue) · `invoices` (org,
gstin, amount_paise, gst_paise, tds_paise, term_start, term_end, razorpay ids) · `notifications`
(recipient, channel, template, locale, provider_id, status, sent_at) · `lifecycle_events` ·
`orgs.locale`, `orgs.status`, `orgs.plan_ends_at` · `catalogues.term_ends_at`,
`catalogues.archived_at`, `catalogues.originals_purged_at`.

## 10. Phase exit tests

1. **Phase 1:** a studio uploads a real wedding, publishes, sends the delivery message from the
   console; the couple receives it on WhatsApp and email with a working link; invoice by hand.
2. **Phase 2:** a studio buys credits and a plan with UPI; a catalogue reaches its end date,
   warnings go out on three channels, it archives without deletion, and is restored on payment
   without anyone touching the database.
3. **Phase 3:** a studio owner sees from their console which couples are due, what was watched,
   and how many enquiries the credit link sent them.

## 11. Open questions

P-1 studio-only and the escape hatch · P-2 credit expiry · P-3 where originals live · P-4
handover as control-only · P-5 Studio plan mandatory · P-6 the day-60 question to a studio owner
· GST registration · trademark search · MSG91 WhatsApp Business approval (start now).
