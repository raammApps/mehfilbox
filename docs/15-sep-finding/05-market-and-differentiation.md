# Market and differentiation: a direct client door, and keeping studios safe

Written 16 September 2026 from two argued positions (studio-first and hybrid, saved from the
strategy panel), the client, themes and commerce subsystem maps, `docs/COMPETITORS.md` §3–§7 and
`docs/PRICING.md`. The third position, client-direct, and the two judges did not return from the
panel; the client-direct case is stated below as fairly as the evidence allows, and the judgement
at the end is the agent's own, labelled as such.

## 1. The recommendation

**Do not open a public self-serve door for couples this quarter. Do open a gated one, and build
the three studio-safety rules before it, not after.** Sandeep's instinct is right about the market
and wrong about the order: a direct door is worth having, but the code today would let it damage
the channel the whole pricing model depends on, and no money can move through it anyway.

What his own idea gets right:

- **The couples excluded today are mostly not studio customers at all.** A couple with no wedding
  and no studio has no way into the product (`map-client.md` §7 item 1: the only registration page
  is `app/admin/register`, partner-only). Those couples are on Google Drive and a hard disk, which
  `docs/COMPETITORS.md` §6 names as the real incumbent. A door for them is not stolen from studios.
- **Nearly all of the door is built.** A couple-owned catalogue already runs through the
  same wizard, customizer, upload and publish routes a studio uses; exactly one admin route is
  partner-only (`map-client.md` §3, `tests/unit/couple-accounts.test.ts:318-343`). *(The "96%"
  figure that circulates for this comes from the hybrid position's own framing and is not a count
  of anything. What the evidence supports is "one admin route is partner-only" — quote that.)*
  Opening the door is a registration page and a price, not a whole product — but see the next
  bullet: that registration page is itself unbuilt.
- **But the registration page is real code that does not exist, and someone has to build it.**
  There is **no path anywhere in the product** that creates a couple account outside a studio's
  action: a `kind='couple'` org is written in exactly two places, issuing the couple's sign-in
  (`app/api/admin/catalogues/[id]/couple/route.ts:84`) and claiming a forwarded handover link
  (`app/api/claim/route.ts:113`), and `find app -iname '*regist*'` returns only `app/admin/register`,
  which is partner-only. The platform console cannot originate one by hand either
  (`map-platform.md` §7 item 12). So even §6 step 6's minimal version — "an invite plus a manual
  grant" — needs three new things: a couple-shaped registration or invite-redemption route that
  writes the org, a way for the platform console to issue that invite, and a credit granted against
  the resulting org. Call it two to three days on top of the safety rules; it is not zero, and
  nothing in this document should be read as saying the door opens by deciding to open it.
- **Themes as a studio benefit is the right instinct.** Studios should feel they get more from us
  than an individual does.

What it gets wrong:

- **Attribution is editable.** "Presented by" and the Made-with-Mehfilbox toggle are plain
  autosaved fields any catalogue owner can change today, including a couple after handover
  (`components/admin/ThemePicker.tsx:64-125`, the `presentedBy` and `platformCredit` state and the autosave that writes them). A direct door with that gap open is a door that
  lets a studio's own client erase the studio.
- **Every request for money already bypasses the studio.** A couple's credit request and the
  guest renewal screen both go only to the platform's support inbox
  (`app/api/admin/credits/request/route.ts`, `app/c/[slug]/renew/page.tsx:48-54`), while the
  product tells them "your studio can add this" (`map-client.md` §7 item 3). Opening a direct door
  on top of that leak makes the bypass the default path.
- **A paid theme SKU for individuals has nothing to run on.** Themes have no owner, price, tier,
  entitlement check, purchase flow or versioning (`supabase/migrations/0019_themes.sql:9-19`,
  `map-themes-customizer.md` §7), and there is no payment code of any kind in the repository
  (`map-commerce.md` §1). It would be the third billing rail built before the first one exists.

So: **hybrid, gated, sequenced.** First the safety rules (§3), then the studio-facing checkout
(N-20 Razorpay), then a direct door that starts as an invite plus manual grant at a price above
wholesale, and only then, if the numbers say so, a paid theme tier.

## 2. The two channels compared

| | Studio channel (built) | Direct client (proposed) |
|---|---|---|
| Who buys | The studio, always; the couple is never the billing customer (D-26, `docs/PRICING.md:48-53`) | The couple or individual, directly |
| What they pay | Deliver ₹1,999 wholesale; Keep ₹6,000; Cinema ₹12,000; Studio plan ₹4,999/yr with three Deliver credits (`docs/PRICING.md` §1) | A direct Deliver credit, to be tested around ₹3,499: above viddrop's ₹1,900–2,400 (`docs/COMPETITORS.md` §2), below the ₹5,000–8,000 studios are told to charge. Whether that is quoted inclusive or exclusive of GST depends on a registration question [04 §4](04-startup-india.md) leaves open |
| Who does the work | The studio: upload, title, customize, publish, hand over | The client, on the same console, with no one to call when a 6 GB upload stalls |
| Acquisition cost | One studio brings ten to sixty weddings a year; the "Filmed by" credit and referral link are the funnel (`docs/PRICING.md:139-142`) | One at a time, from search and WhatsApp forwards; every signup is a new sales conversation |
| Support load | Studios learn the console once; the founder supports a few dozen operators | Every client is a first-time operator; support scales with weddings, not with studios |
| Churn shape | A studio that delivers three weddings a year has paid nothing for the plan (`docs/PRICING.md` line 37); the plan renews on habit | A wedding is once; a client renews Keep or lets it archive, and never buys a second credit |
| What exists in code | Everything: registration, credits, quota, house styles, domains, handover, lapse ladder | The console and the wizard in couple mode (N-73); no registration, no price, no channel field on a credit (`map-commerce.md` §7 item 3) |
| Money today | None. No Razorpay, no webhook, no invoice table; every credit so far was granted by hand from the platform console (`map-commerce.md` §1) | None, and the same rail is needed first |

The client-direct case, stated fairly: India's wedding market is mostly studio-less at the
delivery step, and a couple who shot their own sangeet on phones or whose studio only
did photographs has no route to a product like this at all. `docs/COMPETITORS.md` §7 puts two
numbers behind the market half of that — **73% of viewing mobile-first against ~40% globally, and
60% of new subscriber growth from Tier 2 and 3 cities** — but **both are unverified**: that
document's own Sources block (`docs/COMPETITORS.md:342-348`) covers competitor pricing pages only,
and no source for the India streaming statistics exists anywhere in the chain. They are quoted here
because the argument does rest on them; they should be sourced or dropped before they appear in
anything external, and no decision below turns on them. The direct door captures demand the
studio channel will never reach, at a higher price than wholesale, with a product that already
works. The cost is real: the founder becomes the studio for every direct client.

## 3. Studio safety: the rules that make studios safer with us than without us

These are concrete, and three of them are cheap because the seams exist. None of them is built
today; two of them close gaps the studio channel has regardless of any direct door.

1. **Attribution locks the moment a catalogue's origin names a partner.** `presentedBy` and the
   platform-credit toggle become read-only when `origin_org_id` is a studio, enforced in the
   branding write path (`app/api/admin/catalogues/[id]/route.ts:32-39`), not hidden in the UI.
   The "Filmed by" credit that `docs/PRICING.md` promises "permanently, through every renewal"
   is not evidenced as built in any map; this is where it becomes true. Effort: a day.
2. **Every couple-initiated request for money routes to the originating studio first**, with the
   platform as a timed fallback. The lifecycle warnings already cc the studio correctly
   (`lib/notify/schedule.ts:124-159`); the credit request and the renewal screen do not. Effort:
   half a day, and it fixes a contradiction the product ships today.
3. **A direct signup asks "which studio filmed this?" and routes the lead.** One field on the
   couple-shaped wizard step that already exists (`components/admin/CreateWizard.tsx:290-337`),
   one notification template on the queue that already exists. A studio that never had a
   Mehfilbox relationship with that couple receives a lead, not a competitor. A named studio with
   no account is the failure case: the lead has nowhere to land but support, so the field should
   offer "invite them" rather than free text. Effort: two days.
4. **A price floor, stated publicly.** Anything a studio can resell is priced higher direct than
   wholesale, anchored on numbers `docs/PRICING.md` already publishes. The Studio plan's own
   arithmetic then undercuts any direct path at real volume by construction. Needs a channel or
   price field on credits, which neither `credits` nor `plans` has today. Effort: with N-20.
5. **Studio-only surfaces are studio-only at the API layer.** House styles, team seats, the
   renewal worklist and custom domains are hidden from a couple's chrome but not refused by the
   routes (`map-themes-customizer.md` §7, last item; `map-client.md` §7 item 6 for transfer).
   Effort: a day, and it is a security tidy-up whether or not a direct door opens.
6. **No studio ever sees a client get the same thing cheaper.** A studio-attributed direct
   purchase either credits the studio or is priced at the studio's level. This is the rule that
   makes rule 3 honest.

## 4. The theme store

**Model.** Two tiers, no marketplace.

- **Free** is the status quo restated as a benefit: the seven built-in themes plus every
  platform-authored one, available to every studio and to every catalogue whose origin is a studio,
  handed over or not (`themes/registry.ts`, `map-themes-customizer.md` §3). Nothing to build.
- **Advanced** is a small curated set of platform-authored themes, made the way today's are at
  `/admin/platform/themes`, gated by one clause in `themeFrom` (`themes/registry.ts:154-160`):
  render when the catalogue's origin org is on an active Studio plan, or when a catalogue-scoped
  entitlement row says it was bought. `lib/entitlements.ts` already resolves catalogue over org
  over default and its own comment argues for exactly this catalogue-scoped grant
  (`map-commerce.md` §7 item 4).

**Who pays what.** Studios on the plan: nothing, ever. Unaffiliated individuals: a one-off per
catalogue, and the purchase credits the named studio if there is one (rule 6). No third-party
authors, no submissions queue, no versioning system; all three are materially larger projects
(`docs/PRODUCT.md:206-213` lists the five unresolved decisions).

**What must be built.** A `tier` and `price` on the `themes` table; a catalogue-scoped entitlement
writer (nothing has ever written one); the gate in `themeFrom`; a "locked until bought" preview
state in the customizer, which today has no locked state at all; and a purchase, which is N-20's
checkout. Also the blast-radius fix the map flags: editing a stored theme repaints every wedding
on it instantly with no usage count shown (`components/admin/ThemeStudio.tsx:253-258`), which a
paid tier turns from a nuisance into a refund conversation.

**Revenue, with the assumptions stated — and they are assumptions, not evidence.** Assume 10% of
catalogues are direct in year one, and a third of those buy an Advanced theme. Neither number is
observed: there are no direct catalogues at all today (6 orgs, 5 catalogues, all studio-made), so
both are stipulated to make the arithmetic concrete, and either could be out by a factor of three
without anyone being able to say so. The panel proposed a band of **₹499–999** per Advanced theme
and ₹0 wherever a studio is named; taking the top of that band, at 120 weddings a year that is four
purchases, about ₹4,000, and at 500 weddings about ₹17,000. At the bottom of the band it is half
that. Against a Studio plan at ₹4,999 a year, one retained studio is worth more than the theme
store's first two years — which is the only conclusion here robust to the assumptions being wrong. **The theme store is a
differentiator, not a revenue line,** and the honest reason to build the tier is to give studios
something visible that individuals do not get.

**The risk that it is a distraction.** It competes for the same founder-plus-agent time as N-20,
N-83 (photographs on a public CDN) and N-86 (lockouts), all of which affect paying studios today.
Build the gate only when the direct door has its first ten signups.

## 5. Differentiators, ranked by cost and defensibility

| Differentiator | Cost | Defensible? | Why |
|---|---|---|---|
| Capacity for a fifteen-hour, eight-function wedding | Built | Yes | A consequence of what competitors' pricing assumes a wedding to be; they would have to reprice to follow (`docs/COMPETITORS.md` §4, §6) |
| The wedding survives the studio: control transfers, nothing is deleted, the couple can pay us directly if the studio is gone | Built | Yes | No competitor's gallery outlives the studio's subscription |
| Attribution that survives every renewal, enforced not editable | A day | Yes, once enforced | Today it is a promise in `PRICING.md` and a text field in the customizer |
| Leads routed to the studio that filmed the wedding | Two days | Moderately | Reuses the queue; a competitor could copy it, but it changes what a direct door means to a studio |
| Free themes for every studio, a paid tier for individuals | Weeks, after N-20 | Weakly | Easy to copy; its value is the signal to studios, not the money |
| A catalogue rather than a gallery: billboard, rows, letter, timeline, profile gate | Built | Moderately | The reason a couple forwards the link (`docs/COMPETITORS.md` §4) |
| Hindi and English, Mumbai region, sub-1.5 s playback on 4G | Built | Moderately | Every competitor is a US product with an Indian invoice |
| Studio pricing floor, stated publicly | With N-20 | Yes, as a policy | Cheap to keep, expensive to break once promised |

## 6. Sequencing: the next 90 days and what to defer

**Now, in this order, before any direct door:**

1. Route couple money requests to the studio first (rule 2). Half a day. Fixes a contradiction
   shipping today.
2. Lock attribution for studio-originated catalogues (rule 1). A day.
3. Make studio-only routes refuse non-partners (rule 5). A day.
4. N-20 Razorpay for the studio channel: credits and the Studio plan. This is the rail every
   other move needs, and it is the commerce the product has decided on.

**Then, as a test rather than a launch:**

5. A "no studio?" page: an invite form, not a signup. Zero product change. It tells you whether a
   single couple has ever wanted this, which nothing today shows (6 orgs, 5 catalogues, all
   studio-made).
6. If the form fills: a gated direct door: the couple-mode wizard behind an invite, the studio
   field with lead routing (rule 3), a direct Deliver credit at the agreed price granted by hand
   after a UPI payment, the way every credit has been granted so far. **This is the step that needs
   the new code named in §1**: an invite-redemption route that writes a `kind='couple'` org, a
   platform-console control to issue the invite, and the credit grant against the new org. Two to
   three days, and it is the whole of "opening the door" — the wizard, customizer, upload and
   publish behind it already work.

**Defer:** the paid theme tier until the door has ten signups; any marketplace, third-party
authors or theme versioning indefinitely; any consumer marketing spend until Keep renewals from
studio-delivered weddings show the retention the model assumes (`docs/PRICING.md` §6 names it the
biggest untested assumption).

## 7. Metrics to watch

- Studio-plan attach and renewal rate at ₹4,999: the real test of channel loyalty.
- Share of studios buying three or more Deliver credits a year, the plan's breakeven.
- Share of couple credit and renewal requests that reach the originating studio first (today: 0%).
- Direct-door invites received, before anything is built for them.
- If the door opens: share of direct signups naming a studio, and lead-to-studio-plan conversion.
- Attribution-lock failures: a studio-originated catalogue whose "Presented by" changed after
  handover. Should read zero.
- Founder time per direct signup on manual grants, the number that decides when self-serve
  payment must exist.

## Where the panel disagreed

The studio-first position argues the direct door should not open at all until studios prove they
will resell Keep and Cinema, and that themes should stay free to everyone. The hybrid position
argues nearly everything behind the door is built (it says "96%," which is framing rather than a
count) and that the safety rules make it a lead engine for studios. They agree on
more than they admit: neither would open a door before attribution is locked and money routes
through the studio, neither would build a theme marketplace, and both say Razorpay for studios
comes first. The agent's judgement, absent the two judges: the hybrid is right about the door and
the studio-first position is right about the order.

## Decisions this asks of Sandeep

| Decision | Recommended default |
|---|---|
| Open a direct client door? | Yes, gated: invite form now, wizard behind an invite after N-20, never a public signup before the three safety rules ship |
| Direct price for a Deliver credit | Test at ₹3,499, anchored between viddrop's ₹1,900–2,400 (`docs/COMPETITORS.md` §2) and the ₹5,000–8,000 studios are told to charge. **The floor is the studio's wholesale price, ₹1,999 (`docs/PRICING.md` §1), not a separate round number** — rule 4's requirement is only that a direct price sits above wholesale, and no lower bound between the two is derivable from any source. (An earlier draft named "never below ₹2,999"; that figure appears in neither strategy position, nor `PRICING.md`, `COMPETITORS.md` or the decision log, and has been dropped rather than given a false provenance.) State whatever floor is chosen publicly. **"Excl. GST" presumes a GST registration Mehfilbox may not have** — see [04 §4](04-startup-india.md) |
| Theme store | Free tier is today's set for every studio; an Advanced tier only after ten direct signups; no marketplace |
| Does a studio earn on a client's purchase? | Yes, when the signup named them: credit the studio or price at the studio's level |
| Who receives a couple's request for money? | The originating studio first, the platform after a timed fallback |
| Attribution | Locked at the API for studio-originated catalogues, before any direct door |
