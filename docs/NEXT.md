# NEXT — the ordered backlog

[`PRODUCT.md`](./PRODUCT.md) is **what the product is**, surface by surface — update that first
when something changes. `PROGRESS.md` records what was built and why. **This file records what is
left, in the order it should be taken up.** Read CLAUDE.md → PROGRESS.md → this file; that is a ~8k-token cold start.

Ordering rule: unretired risk first, then things that would embarrass us in front of a planner,
then debt. Within a tier, cheapest first.

**6 September 2026:** [`ROADMAP.md`](./ROADMAP.md) groups this backlog into phases and adds
N-34 to N-50 from the competitor and feature review. Phase 1 is Tier 2 below, in this order:
held items → N-21 → N-22 → N-23 → N-29 → N-36 → N-24a → real footage → N-51.
**N-34 and N-35 were already built** on 6–7 September, before this patch was applied — photograph
sharing, captions, likes and one save indicator across the console. See PROGRESS.

Update this file as items land — move them out, do not leave them ticked.

---

## Where things stand, in one paragraph

Phase 0 is built and deployed: guest catalogue, player, admin console, customizer, the module
registry, and the partner/handover model. All six doc 10 §2 journeys run, plus an OG size budget,
a first-load JS budget and a zero-axe-violations gate. **387 unit and component tests, 108 E2E,
all green.**

**Live on `https://heirloomfilms.in`** with `DATA_DRIVER=supabase` + `VIDEO_DRIVER=bunny`: an
operator signs in against real Postgres, and create → publish → guest page works. Registration
sends a confirmation through Resend and the link resolves back to the domain — verified by reading
the delivered message, not by trusting the dashboards. `pnpm verify:upload` proves a real TUS
upload survives a network drop. Local development stays on `file` + `bunny` so the demo catalogue
is available. Branch is `main`.

Two things worth knowing before trusting any status here, both found by looking at production
rather than at tests: the Supabase driver **never wrote `size_bytes`**, so every catalogue reported
0 GB and the storage cap had never refused an upload; and the E2E suite's intermittent failures
were three parallel projects sharing one store, not the code they pointed at. Both fixed.

Run `pnpm preflight` first in any new session: it reports the real state of both services in a
few seconds and is more trustworthy than this paragraph.

---

## Tier 1 — unretired risk

Empty. The three things doc 09 called out as schedule risk — the video provider, the database,
and resumable upload — have all now run against the real services.

---

## Tier 2 — before a planner sees it

### N-55 · The customizer's remaining gaps  ·  ~2h

Three things noticed while using it as a studio owner would, after the publish-state work of
7 September. None is a defect; all three are friction.

- **The inspector opens empty.** A third of the screen says "Nothing selected" on arrival. The copy
  is good instruction for a first-timer and bad economics for the hundredth wedding — probably
  select the last-edited section, and keep the instruction for a catalogue with no sections.
- **Branding sits below the advisories.** Colour, logo, typeface and "Presented by" is the thing a
  studio sets *first* and on every wedding, and it is pushed down the left column by a dismissible
  suggestions panel.
- **Undo has no redo.** The stack is twenty deep in one direction only.

Not urgent: none of them can lose work or mislead anyone, which is what the publish-state work was
about.

### N-53 · Observability — see the failures that are silent  ·  ~half a session  ·  **D-24**

Every serious fault this product has had was **silent**: a transcode webhook pointed at a dead URL
while uploads still succeeded; a storage column the driver never wrote, so the cap never refused
anything; an SMTP credential that authenticated but could not send. Each was found by a person
looking at production, and none of them would have raised an alert.

Not a new architecture — instrumentation on the one we have (D-24):

- **Error tracking** with a release marker, so a failure is attributable to a deploy.
- **Structured logs that survive the invocation.** `lib/log.ts` writes to stdout; on Vercel that is
  retained briefly and is not queryable when it matters.
- **An alert when a webhook stops arriving.** The reconcile cron already knows which titles are
  stranded — it is the natural place to notice that *none* have arrived in an hour.
- **A synthetic check on the guest path**, because `/api/health` proves the app boots, not that a
  guest can play a film.

Cheap, and it is what turns "a partner told us" into "we knew first".

### N-29 · Language chosen at account creation  ·  ~half a session

**New requirement.** A tenant should pick their language when their account is created, and new
catalogues should inherit it.

Today `orgSchema` has no locale, `DEFAULT_LOCALE` is always English, and the guest toggles. So a
Hindi-first studio in Jaipur sets up every wedding in English and hopes guests find the switch.

- `orgSchema.locale`, set at registration, inherited by catalogues at creation.
- The catalogue's default locale drives what a guest sees **before** they touch the toggle.
- Separately: **the admin console is English-only.** Localising it is a larger job — every operator
  string, ~40 components — and worth scoping on its own once the guest side inherits properly.

### N-54 · Claim a notification row before sending it  ·  ~1h  ·  **paused, 7 September**

`drain` reads, sends, then marks, so two overlapping runs would both see the same `queued` rows and
send twice. Sequential repeats are already safe, and the GitHub Actions schedule serialises itself
with a `concurrency` group — so the remaining exposure is a second *caller*: a `workflow_dispatch`
fired by hand while a scheduled run is in flight, or the Vercel cron restored on Pro alongside a
workflow nobody deleted.

The fix is a `sending` status written before the provider call, so a concurrent drain's
`listQueuedNotifications` does not see the row. It needs a migration — 0009's constraint is
`check (status in ('queued','sent','failed'))` — plus a way back for rows stranded in `sending` by
a crash, which is what makes this an hour rather than ten minutes: a row stuck mid-send is a
message nobody will ever receive, and that is the failure this must not introduce while fixing a
rarer one.

**Do it before the Vercel Pro move**, when the cron entry returns to `vercel.json` and two
schedulers exist for however long it takes to delete the workflow.

### N-21 · The migration email, and the warning schedule  ·  ~2h  ·  **Phase 1, first**

A couple only learns what they have if the studio remembers to tell them.

> **Rewritten for studio-only (D-26/D-29).** This is the *handover* email, not a migration email:
> *this is yours to watch, download and share; your studio manages the plan; here is the date it
> runs to; nothing is ever deleted.* Billing never transfers, so it introduces the studio rather
> than us. Expiry warnings go to the **studio first**, and the couple's copy says *contact your
> studio* — except where the escape hatch is open, when it says we can take payment directly.

At handover, tell them on every channel they have: this is yours, here is your login, here is the
renewal date, here is what happens if you do not — and that nothing is ever deleted. Then the
warnings: **60 / 30 / 7 / 1 days before expiry, and 30 / 60 / 89 days into grace**, WhatsApp +
email + SMS, to both partners. The studio's console shows a banner and, for Cinema catalogues, a
"call them" prompt.

### N-22 · Download everything, at any time  ·  ~half a session

**Gates any lapse behaviour, archive included.** Available before expiry, during grace, and from
archive: a per-film original (or highest rendition where the original was not kept) and a
"download all" that hands the couple a manifest plus signed links, because a 40 GB zip built on a
serverless function is not a thing. Nobody is ever held to ransom for their own wedding.

Do not ship the archive transition (N-24) without this.

### N-23 · Plan capacity in the console  ·  ~2h

Nothing shows what a plan holds. `PRICING.md` §6 requires "this plan holds about 9 hours" at
purchase and a warning at 80% used — otherwise a partner buys the wrong tier and hits the cap at
80% uploaded.

The cap **is** enforced: `app/api/admin/uploads` runs `storageCheck` and refuses with the figure
(this file previously claimed otherwise, which was wrong). What is missing is telling a partner
what the plan holds *before* they fill it, and warning them on the way up.

### N-24a · The encoding ladder  ·  ~1h  ·  operator task

Set the Bunny library to 360p–720p by default; confirm Keep Original Files and MP4 Fallback are
off. Then upload one real 15-hour wedding and correct `PRICING.md` §1 with the measured GB.
Without this nothing on the price list holds a wedding.

### N-36 · The delivery message  ·  ~half a session  ·  **Phase 1**

One button on the overview, beside the public link: *Send to the couple*. Composes a WhatsApp
message (and an email) with the poster, the couple's names, "now streaming" copy in the
catalogue's locale, and the link; records that it was sent. This is the moment the product gets
forwarded to two hundred people, and today the operator writes it themselves.

### N-24 · Lifecycle: renewal, lapse, **archive**  ·  doc 15  ·  **Phase 2**

> Rewritten 6 September 2026: **no automatic deletion.** `PRICING.md` §2 and `ROADMAP.md` §4.
>
> Add the **`studio_gone` predicate** (D-26): origin org closed or suspended, **or** its Studio
> plan lapsed past grace, **or** this catalogue lapsed ≥ 90 days with the studio's last warning
> unanswered. Computed rather than stored, and logged when it unlocks a purchase — it is the only
> thing that lets a couple pay us directly, so it needs an audit trail rather than a boolean.

The state machine exists and `resolveAccess` honours it. Nothing writes it. Needs: the renewal
path (N-20 writes it), the **90-day Deliver term** with the day-60 Keep offer sent to the studio
(N-50), the lapse transition at expiry, **90 days' grace** with the catalogue
read-only for the couple and download offered, then the **archive transition**: streaming paused,
a restore-on-payment screen for guests, files retained. Measure first whether moving renditions
out of Stream into Edge Storage saves enough to be worth the code; at ₹0.95/GB/month it may not.
`deleted` becomes reachable only from an explicit, recorded request by the couple. Twelve months
of archive at our cost after grace, then the archive fee applies.

### N-25 · Delivery metering  ·  ~2h

`getUsage` returns real stored bytes and `deliveredGb: 0`. Until it is real, allowances cannot be
enforced and no catalogue's cost can be attributed. Fine at 60 weddings from the Bunny dashboard;
impossible at 300.

### N-36b · The credit that survives  ·  ~half a session  ·  **Phase 3**

`presentedBy` is an editable field snapshotted at handover. Make it a promise: a "Filmed by"
credit rendered from `origin_org_id`, not from branding, that the couple cannot edit, plus an
enquiry link ("Get your wedding on Mehfilbox") routed to the originating studio, which the couple
can hide but not redirect. Both survive every renewal. This is what the studio gets instead of a
share of renewals (`PRICING.md` §2).

### N-37 · Delivery tracking and the lapse dashboard  ·  ~1 session  ·  **Phase 2** (moved)

> **Moved from Phase 3 by D-26.** Under studio-only the studio *is* the renewal mechanism, so a
> list of every catalogue they originated with its end date — and one-click renew on behalf — is
> not reporting, it is the collection channel. Without it, renewals depend on a studio remembering
> a date three years after a wedding.

Play events exist and nothing reads them per catalogue. Show the studio: opened (first profile
gate pass), watch-time per film, "not opened in 7 days". Then a partner-level view of every
catalogue they originated with its renewal date and status, and *renew on their behalf* (N-20).

### N-38 · Family circles  ·  ~1 session  ·  **Phase 3**

Scoped links per side (bride, groom, "just the highlights"), each a profile-gate group; "who
watched" for the couple. `module_state` and the gate already hold per-guest identity.

### N-39 · Anniversary moment  ·  ~2h  ·  **Phase 3**

On the wedding date each year: a message with a deep link into the highlights film. It is the
renewal nudge that does not read as one.

### Phase 4 and 5, one line each — sized when they are reached

N-40 cast to TV (Chromecast / AirPlay) · N-41 subtitles, AI-generated and operator-corrected ·
N-42 hand back to the studio · N-43 client premiere with countdown · N-44 custom domain served
and verified automatically · N-48 DPDP consent and deletion-on-request · R8 the `store` module
and commission · N-45 guest uploads and guestbook · N-46 studio portfolio page · N-47 draft
feedback · N-49 API and webhooks.

### N-26 · Saved branding presets — the marketplace's honest first version  ·  doc: `PRODUCT.md` §6

A theme marketplace is the largest item on the product map and none of it exists. **The first
version worth building is not a marketplace**: more templates, plus branding presets a partner
saves and reuses across weddings. No payment, no review process, no versioning — and it delivers
most of the value ("all my weddings look like my studio").

`PRODUCT.md` §6 lists the five product questions that have to be answered before a real
marketplace is scoped. Build a marketplace when a third party asks to publish into one.

### N-27b · Platform admin: plans and quotas  ·  doc 15 §1  ·  ~half a session

Suspension, the user list and the audit trail landed on 7 September. What is left of N-27 is the
other write: **assign a plan or a quota to an org**, which is still SQL.

The machinery exists — `plans` and `entitlements` from 0006, and `entitlements` already resolves
catalogue-over-org per field in `lib/entitlements.ts`. What is missing is a write path and the
console form, and the same audit row every platform write now leaves.

Creating a tenant stays out on purpose: `/admin/register` already does it, correctly, with a
verified email and a real Supabase Auth user behind `operators.id`. A second creation path in the
platform console would be a second set of rules for the same object.

### N-20 · Razorpay  ·  doc 15 §4  ·  **Phase 2**

Two flows that should not share a code path: partners buy catalogue credits in advance, couples
pay renewal, archive, long-term archive and storage after the included months — **and nothing is
billed to a couple inside twelve months of delivery** (`PRICING.md`, "Who is billed when"). The
`plans` rows for Deliver, Keep, Cinema, archive (₹999 / ₹1,499), the Studio plan with its three
included credits, and the Deliver → Keep upgrade (`ROADMAP.md` §3) land here. The subscription state machine already exists
and `resolveAccess` honours it — what is missing is only the thing that *writes* it. Verify the
webhook the way the Bunny one is verified, and assume it gets lost, because that lesson is
already paid for.

The entitlement tables and the resolver now exist (N-19); what is missing is the thing that
*writes* a row. `plans` is empty on purpose — the price list is a business decision, not a
migration.

### N-14 · Real footage  ·  operator task  ·  **half answered**

Two real catalogues exist. `sample-swarit-and-smriti-2026` was reviewed on a 375px viewport
against real material, and **the first question is now answered: it reads as a streaming product.**
The billboard photograph carries the scrim, text stays legible over it, and a row of real frames
looks like a service rather than a template. That was the largest unknown and it is closed.

**Still open, and it needs different material:** what a finished hour actually costs in storage,
and whether the card treatment and row gradients hold against 200–300 DSLR frames. The catalogue
holds two ~40-second vertical clips and 11 photographs, which cannot answer either.

Both things the review turned up are fixed (see PROGRESS): the storage column the driver never
wrote, and the row that held a single film. Existing rows still need `pnpm backfill:sizes --write`;
new uploads record their size.
Three things that looked like bugs and were not, recorded so they are not re-investigated:

- The `1m` badge on a 35-second clip is deliberate — `formatDurationBadge` rounds to whole minutes
  so `4:07` does not imply a precision the number does not have.
- A letter module that appeared to be an empty card was its sign-off.
- **"Presented by san-test-studio" is correct.** `branding.presentedBy` is an operator-editable
  field in the customizer, seeded from the business name at registration — so it shows whatever
  was typed there, and a slug-looking value means a slug-looking business name. Not a fallback,
  not a bug.

### N-11 · Domain  ·  **live** — one item left, see [`GO-LIVE.md`](./GO-LIVE.md) §4

`https://heirloomfilms.in` serves the product: DNS points at both Vercel addresses, the
certificate issued, `ROOT_DOMAIN` is switched and redeployed, health reports `supabase` + `bunny`,
and push-to-deploy works again now the repo is public.

Nameservers stayed with Hostinger and the MX records are untouched, so existing mail is intact —
that is why `path` mode rather than `subdomain` is the right call for this domain.

**Left:** the Bunny library's `WebhookUrl` still points at the old URL. It needs Bunny's *account*
API key, which this repo deliberately does not hold, so it is a dashboard change.

> It has not broken, because `marquee-film-pub.vercel.app` is still attached and still serving the
> current build — luck rather than design. The alias list already holds several `marquee-film-*`
> names pinned to deployments days old. The webhook must point at the **stable domain**, never at
> a per-deployment URL, precisely because such a URL keeps answering after the next deploy from
> the *old* build: a webhook that appears healthy while running superseded code.

`pnpm preflight` and an end-to-end playback check against the new domain are **not yet run**.

### N-6 · The demo catalogue needs real footage  ·  doc 13 §8 — **not to be delegated**

The fixture uses generated gradients. That proves the mechanics and would misrepresent the
product to a planner, who judges it on whether the films feel real. Needs real, cleared,
permission-granted material. Sandeep's, per doc 13 §8.

---

## Tier 3 — debt, in the order it will start hurting

## Held by Sandeep, not by an agent (doc 13 §8)

**Insert yourself into `platform_admins`** if you want the platform console. It is built and
gated (N-16), and the table is empty, so today nobody can reach it — which is the correct default.
`id` must be your Supabase `auth.users` id:

```sql
insert into platform_admins (id, email, name)
values ('<your auth.users id>', 'you@example.com', 'Sandeep');
```

**No migration is outstanding.** `0008_likes.sql` was applied on 7 September with RLS enabled, and
verified end to end against production: a like round-trips, a second guest key sees the count and
not as their own, and the anon key is refused both read and write. `0006_entitlements.sql` was
already applied — checked against the live database rather than assumed, because this file had
claimed otherwise.

<!-- Historic, kept because the reasoning still applies to any unapplied migration: -->
**`0006_entitlements.sql`** creates `plans` and `entitlements`. Until it
is applied the Supabase driver logs a warning and resolves every catalogue to the default caps —
deliberately the *low* answer, so nothing is over-granted while the table is missing, but also
means no upgrade can take effect.

**Rotate the admin password.** `pnpm rotate:password` writes a new one to `.env.operator.local`
(gitignored, never printed) and prints the SQL. Run that `update operators …` in the Supabase SQL
editor, sign in, then delete the file. Production now refuses to boot on the repo's published
default, so this cannot quietly stay unrotated.

~~**Rotate the Supabase secret key.**~~ **Done, 7 September.** The new-format `sb_secret_…` keys
can exist side by side, so it was a rolling swap with no downtime: create, move `.env.local` and
`.env.vercel.local` over, deploy, verify, then revoke. Verified in that order rather than assumed
— the old key now returns `401`, the new one reads every table, and a guest catalogue still
renders its title out of Postgres, which is what proves the *deployment* uses it and not just the
shell.

The step that must not be skipped is the deploy: Vercel bakes environment variables into a
deployment, so pushing a variable without deploying leaves production on the old value. That
happened here — the first attempt pushed 25 variables and then died on an unrelated cron error,
leaving the rotation half-applied for several minutes.

~~**Rotate the Bunny account API key.**~~ **Done, 7 September** — and verified rather than
assumed: the new key answers the account API and the old one returns `401`. Bunny lets you
regenerate without invalidating, so the revocation is the half worth checking.

**Real footage** (N-14), which is the one thing no agent can do for this product.

## Facts a new session will want

- **Credentials** live in `.env.local` (gitignored, verified). Both services are fully
  configured; `pnpm preflight` is all green.
- **Supabase**: schema applied through `0009_notifications.sql`. Five orgs exist, and the operator
  rows are, read from the database on 7 September rather than remembered:

  | org | operator |
  |---|---|
  | `smtp-test-studio` | `hello@heirloomfilms.in` — an address on the retired domain |
  | `teststudio` | `sandeep.bh5+1@gmail.com` |
  | `swarit-and-smriti` | `sandeep.bh5+2@gmail.com` |
  | `san-test-studio` | `sandeep.bh5@gmail.com` |
  | `kalyanam` | **none — the org cannot be signed into** |

  `kalyanam` lost its operators when three auth users were deleted carelessly; `on delete cascade`
  took the `operators` rows with them. Its catalogues and films are intact, so recovering it means
  creating an auth user and inserting an `operators` row pointing at it — not restoring content.
  This document previously claimed the login was `operator@heirloomfilms.test` /
  `heirloomfilms-dev`, which was wrong in both halves: that row has never existed in the real
  database, and those are the *dev seed* defaults, which are now `operator@mehfilbox.test` /
  `mehfilbox-dev` and only ever seed the memory and file drivers.
- **The real database has no demo catalogue.** The nine-title fixture only exists in the
  `memory`/`file` drivers. Seeding a real one properly is N-6 (it needs real footage).
- **Bunny**: library `heirloomfilms` id `724076`, pull zone `6300168`, CDN `vz-98fb153e-d39.b-cdn.net`.
  Token auth **on**, IP pinning **off**, `BlockNoneReferrer` **off** — all three deliberate, see
  PROGRESS.
- **The account key and the library key are different.** `BUNNY_API_KEY` is the library key
  (Stream endpoints); `BUNNY_ACCOUNT_API_KEY` manages libraries. A 401 looks identical either way.
- **Playback tokens sign the directory `/{guid}/`, not the manifest.** Signing the file 403s
  every rendition and segment. `pnpm verify:playback` guards this; do not "simplify" it.
- **An interrupted upload is not a failed one.** `UploadManager` marks it `interrupted` and
  resumes on the `online` event; tus's default retry policy gives up on a bare network error,
  so `onShouldRetry` is set explicitly. `pnpm verify:upload` guards this against real Bunny.
- Commands: `pnpm preflight` · `pnpm verify` · `pnpm test:e2e` · `pnpm test:integration` ·
  `pnpm verify:playback` · `pnpm verify:upload` · `pnpm check:bundle` · `pnpm check:vitals` ·
  `pnpm bootstrap:sql`.

## Picking up an item

```
Read CLAUDE.md, docs/PROGRESS.md and docs/NEXT.md. Do not read any other documentation
unless the item names it.

Run `pnpm preflight` to see the real state of the external services.

Implement <N-nn> from docs/NEXT.md. Only that item.

When its acceptance criteria are met:
1. pnpm verify
2. Commit with a message that says what changed and why
3. Move <N-nn> out of docs/NEXT.md and append to docs/PROGRESS.md
4. Stop.
```
