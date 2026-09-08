# PROGRESS

Append one entry per completed ticket. Keep entries to ~3 lines.

This file is **what was built**. [`NEXT.md`](NEXT.md) is **what is left, in order** — read that
to decide what to do; read this to understand why the code looks the way it does.

A fresh agent session reads CLAUDE.md → NEXT.md → this file → the item's own docs (doc 13 §2).

Format:

    ## <TICKET-ID> · <name> — done <date>
    Built: <what exists now>
    Files: <paths touched>
    Note: <anything the next ticket needs to know>

---
## Lessons that still bind

Distilled from the Phase 0 log, which now lives in
[`archive/progress-phase-0.md`](archive/progress-phase-0.md). These are the ones that changed how
the code is written, so they are worth carrying into every session:

- **Running against real infrastructure finds what the suite cannot.** Three fatal bugs — Play
  404ing in path mode, playback failing on every Chromium, hls.js 403ing on every segment — all
  passed 220 unit and 69 E2E tests. Both blind spots were *configuration*, not oversight.
- **A gate is only worth what it has caught.** `check:bundle` caught every module's editor
  shipping in the guest bundle; `check:vitals` caught a CLS regression; the axe gate caught
  contrast a reviewer would not have. Each was invisible to review.
- **Prove a check by breaking the thing it guards.** Every gate added since has been verified by
  reintroducing the bug and watching it fail.
- **Playback tokens sign the directory `/{guid}/`, not the manifest.** Signing the file 403s every
  rendition. `verify:playback` guards this.
- **An interrupted upload is not a failed one.** tus gives up on a bare network error unless
  `onShouldRetry` is set. `verify:upload` guards this.
- **Never delete and recreate a Supabase auth user to change a password.** `on delete cascade`
  destroys the `operators` row and login fails in a way that looks like the app is broken.
- **Compensate explicitly across writes that have no transaction.** A half-finished registration
  left an orphan org on the live database.
- **Guest bytes must never pass through the app.** Video goes browser→Bunny; posters redirect;
  photos come off a pull zone. That property is why compute cost is unrelated to hours hosted.

---
## One documentation tree

`project-doc-directory/` was a placeholder name that stuck, and the split it created was
arbitrary: nothing said which of two top-level trees a new document belonged in, so the answer
was "the one you happened to be in". `docs/README.md` had rationalised the split rather than
questioning it.

Everything now lives under `docs/`, moved with `git mv` so authorship survives:

| | |
|---|---|
| `docs/*.md` | The living documents — architecture, progress, next, deployment |
| `docs/spec/` | The specification, docs 01–15. What the product was *meant* to be |
| `docs/reference/` | Decision log, business case, the reference reel |
| `docs/wireframes/` | The SVGs. `spec/03-wireframes.md` carries the same content as text |
| `docs/archive/` | Superseded invite-site work. Never a source of truth |

The split that was worth keeping is **spec versus reality**, and that is now a subdirectory
rather than a second tree.

Three ignore lists named the old directory and were found only by grepping for it after the
tests passed: `.eslintrc.json`, `.prettierignore`, and the skip set in
`tests/unit/registry.test.ts`. The registry test passed throughout not because its skip worked
but because it only reads `.ts`/`.tsx` and the docs are markdown — it would have started
scanning the specification the moment anyone put a `.ts` example in there, and the specification
names module types on nearly every page. `.prettierignore` was mapped to the four moved
subdirectories rather than to `docs`, because the living documents *were* formatted before and
the hand-aligned spec tables were not.

Also added along the way: `docs/ARCHITECTURE.md`, which is what was actually missing — six
Mermaid diagrams covering what talks to what, who can see what, a guest opening a link, a film
arriving, the module registry, and a handover.

## The console, rebuilt around what an operator is deciding

The admin worked and looked like scaffolding. Every screen was a stack of bordered white cards
with no hierarchy, and — more importantly — no screen answered the question the operator actually
had in front of it.

**The list.** Every catalogue card was identical whether it held fifteen finished films or
nothing at all, and there was no search, no filter and no sort. That is fine for the demo org's
one wedding and breaks in a partner's first month, which is a problem for a product doc 15 sells
to studios running dozens at a time. The card now carries film and photograph counts, the wedding
date with how far away it is, and one line saying what the catalogue needs — ranked, so a lapsed
subscription outranks a failed upload outranks an unpublished draft. Above it: live, drafts and
how many need attention. Search and filter are client-side, because the whole list is already on
the page and a round trip per keystroke would make the fastest screen the slowest.

The counts come from a new `Repository.catalogueCounts`, not from `listTitles` per row. The
obvious version makes two round trips per wedding and gets slower with every wedding a partner
sells; this one is four queries regardless.

**The wizard.** Step 2 asked an operator to choose the shape of the entire guest page from three
radio buttons and a sentence of prose — the most consequential decision in the flow, made blind.
Templates now have thumbnails. They are drawn rather than rendered, because mounting five real
guest components at 90px would pull the player into the wizard's bundle; the shapes come from a
new `meta.shape` on each module, so `TemplateThumbnail` never names a module type and adding a
module still costs one registry line.

Step 1 was five identical inputs with a field labelled "Web address" that never showed the
address. It now shows the real one, resolved through `catalogueUrl`, so an operator in path mode
sees `/c/<slug>` rather than a subdomain that will not exist.

**The overview.** The wizard used to end by handing over the customizer and saying nothing about
whether the job was done. There is now a checklist, and "done" is a real definition rather than a
feeling: a guest opening the link finds a published page with something to watch. Photographs and
branding are listed but do not gate it — plenty of real deliveries are films only. It is a pure
function with its own tests, because a checklist that lies is worse than none.

**The chrome.** The rail was 220px of whitespace serving two links, with no org identity and no
way to sign out. Below `md` it was hidden and nothing replaced it, so on a phone the console had
no navigation at all — an operator who opened a catalogue could reach the rest of the admin only
with the browser's back button.

### N-18 · The handover has a button

The transfer API and the couple's claim page had been live and verified on production for a
while; a partner simply had nothing to click. The panel sits on the overview beside the public
link, because both are "things to send someone". Two constraints shaped it: the link is shown
**exactly once** (only its SHA-256 is stored, so there is no "show it again" to build), and one
live handover per catalogue is enforced server-side — so the outstanding one is named, with the
address it went to, and cancelling is how you reissue.

### Three bugs the rebuild surfaced

None of these were in the code being rewritten. They were found because something finally
exercised them.

1. **The claim link was broken in subdomain mode.** It was built by stripping `/admin` off
   `adminUrl`, which is a no-op there — leaving `https://admin.<root>/claim/…`, a host whose
   middleware rewrites *every* path into `/admin/*`. The one URL in the product a stranger has to
   be able to open answered 404. Production runs path mode, where the strip happened to work,
   which is exactly why it survived. There is now a `rootUrl` helper and a unit test that asserts
   the old derivation and the new one differ in precisely one of the two modes.

2. **The E2E config pointed at the wrong port.** `ROOT_DOMAIN` said `:3000` while the server ran
   on `:3100`. Every spec navigates by relative path through `baseURL`, so it went unnoticed for
   the life of the suite — the first test to follow a link the *application* generated found
   either a connection refusal or whatever stray dev server was on 3000, with its own store. That
   is now the third entry under N-12.

3. **A `<select>` inside its own `<label>`** takes the label's entire text content as its
   accessible name, so the sort control announced itself as "Sort Wedding date Couple What needs
   doing" — and `getByLabel('Couple')` in a wizard test matched a control on a different page.

The axe gate caught a fourth on its own: `opacity-70` layered on already-muted text drops below
4.5:1. It was a reviewer-invisible change and the gate failed the build for it.

308 unit and component tests (up from 279), 78 E2E (up from 72). New coverage is deliberately on
the parts that are code rather than markup: the attention ranking, the checklist definition, the
board's filtering, and the handover end to end — including a couple in a fresh browser context
opening the link a partner just copied.

## N-12 · The two blind spots, closed — and each one proven by breaking it

Both halves of N-12 were about the same thing: a suite can be green because it never asked the
question, not because the answer was right. So neither is claimed on the basis that it passes.
Each was verified by **reintroducing the original bug and watching it fail**, then restoring.

**Path mode now has a Playwright project of its own.** `TENANCY_MODE` is read at boot, so it
cannot be a project option — it needs a second server, on its own port, in the mode production
actually deploys. Five specs, all about *addressing* rather than rendering, because rendering is
identical between the modes and addressing is the entire difference: the catalogue serves from
`/c/<slug>`, Play lands on a route that exists, a deep link opens cold the way a forwarded one
does, and the public link **the console itself printed** is opened by a guest in a fresh context.

Proof it is real: `cataloguePath` was reverted to the shipped bug — the catalogue assumed to be
the site root in both modes — and three of the five failed. That bug reached production behind
220 unit and 69 E2E tests.

**`verify:playback` now drives a real player.** Steps 1–7 prove the *CDN*: hand Bunny a URL with
a token on it and it serves it. That is not the question a guest asks. hls.js resolves child
playlists and segments relative to the manifest, relative resolution drops the query string, and
every one then arrives unsigned and 403s — a player that attaches cleanly and never loads a byte.
Curl cannot find that, because curl is told the URL. Step 8 launches Chromium, loads hls.js with
the same `xhrSetup` the app uses, and waits for `readyState === 4` against the real CDN.

Proof it is real: the token reattachment was removed from step 8, and it failed with
`networkError / levelLoadError HTTP 403` — the same error that shipped — while steps 1–7 stayed
green, which is exactly the disagreement the step exists to expose.

One honest weakness, stated in the script: `xhrSetup` is *copied* from `useHlsPlayback.ts` rather
than imported, because the hook is a React module and this is a standalone node script. If those
two drift, the check quietly stops testing the real thing. That is the first place to look if
this ever passes while playback is broken.

Also retired, both stale rather than done-today: **N-7** (operator auth is already on Supabase
Auth behind the driver seam) and **N-8** (doc 10 §1 test 4 demanded tests for Trending and New,
which doc 01 §5.1 cut as VE-13/VE-14 — verified absent, and doc 10 now says so rather than
carrying a requirement nothing can satisfy). NEXT.md's opening paragraph was also wrong in four
ways at once — test counts, E2E counts, deployment status and branch name — which matters because
it is the first thing a cold session reads.

308 unit and component tests, 86 E2E across three projects.

## N-19 · The caps became something you can sell

`MAX_TITLES = 15` and `MAX_PHOTOS = 60` were constants in `lib/schema.ts`. A constant cannot be
sold, and doc 15 §3 is where the partner model needs them to stop being one.

The shape is a `plans` / `entitlements` pair in Postgres, a `getEntitlements` on the repository
returning both grants that could apply, and `resolveLimits` in `lib/entitlements.ts` doing the
ordering. Splitting it that way is deliberate: the *order* is a product decision, so it lives in
a pure function with its own tests rather than being reimplemented in each of three drivers.

Two properties are worth stating because they are easy to get subtly wrong:

**Catalogue beats org, per field.** After a handover the partner cannot see the catalogue and
cannot be asked to upgrade — so their tier must never cap what the couple bought. Per field
rather than per row, because a grant that buys storage should not drag the title cap back to the
default as a side effect, which is exactly what whole-row precedence would do.

**It fails toward the low cap.** The Supabase driver returns nulls on a query error rather than
throwing, and nulls resolve to the defaults. That is not laziness about error handling: the table
does not exist until migration 0006 is applied, and the choice is between a deploy where every
quota check throws and nobody can upload, or one where everybody has the free tier. The first is
an outage; the second is recoverable. Erring toward "unlimited" would be a bill.

Nothing writes an entitlement row yet — that is N-20, the billing webhook. Building the
resolution first means the order is settled and tested *before* money is involved, rather than
being invented in a hurry inside a payment callback.

The caps also stopped being imported by client components. `TitleList` takes `maxTitles` as a
prop and the catalogue GET route returns the resolved limits alongside the data, so an upgraded
catalogue shows its real number instead of whatever was compiled into the bundle. The prop
defaults to the *lowest* value, so a caller that forgets under-promises rather than inviting an
upload the server will refuse.

10 new unit tests, all on the ordering. 318 unit and component, 86 E2E.

## N-13 · The customizer's second pass

Three things were scoped out of the redesign. All three are in.

**Headings are edited where they are read.** Selecting a section makes its heading editable in
the preview itself — the "find the field, type, look back" loop was avoidable, and headings are
what operators change most. Applied imperatively rather than rendered as `contentEditable` from
React, because the node belongs to a guest component and threading an editing prop through the
module contract is exactly what this design refuses to do. The heading is found by shape — the
first `h1`/`h2` inside the section — for the same reason the selection outline is scoped CSS: the
previewed markup stays byte-identical to what a guest gets.

The load-bearing detail is **commit on blur, never on keystroke**. Per-character commits would
push a new `modules` array, re-render the guest tree, replace the node being typed into and drop
the caret mid-word. Typing touches only the DOM; React learns about it once, at the end.

**The preview follows the list.** Selecting a section in the list used to update the inspector
while the preview stayed where it was, so an operator edited a heading they could not see. It now
scrolls — but only when the selection came from the list. The pane records what it selected
itself, because scrolling to something the operator just pointed at would yank the page out from
under their cursor.

**Sections can be dragged in the preview.** Additive, never a replacement: the list keeps the
keyboard path that doc 14 §5.1 requires. Native HTML5 drag, delegated to the viewport, because it
gives the drop cursor and autoscroll inside a 780px scroller for free. The awkward part is that
guest sections are full of natively draggable images and links, so `dragstart` always resolves up
to the enclosing section and images are made undraggable — in the preview's copy of the tree
only.

Both new paths land on the same `commit` as the list, so a reorder or a rename from the preview
is undoable and autosaved identically. There is one way to change a module, reachable from two
places.

### Two things the tests taught

**Playwright cannot start Chromium's native drag loop.** `dragTo` moves the pointer and no
`dragstart` ever fires — verified by dispatching the events directly, which reordered correctly
while the mouse-driven version did nothing. The spec therefore dispatches real `DragEvent`s and
asserts `draggable` separately, and says so: it covers the handlers, the reorder and the
autosave, not the browser's decision to begin a drag.

**The customizer specs were racing each other.** They share one in-memory store, and adding a
second spec that reorders the demo catalogue made "Billboard is first" fail intermittently in the
full run while passing alone. They are serialised now. `helpers.ts` solves this for content by
creating a throwaway catalogue; that does not work here, because a catalogue with no published
films renders no sections to select or drag.

318 unit and component, 89 E2E.

## N-5 · LCP and CLS are gated, and it is not Lighthouse

First-load JS was already gated and playback start is measured in production. What nothing
watched was **layout** — a hero that arrives late, a row that pushes the page down after paint.
Both are invisible to a bundle budget and obvious to a guest.

NEXT.md called for Lighthouse CI. `pnpm check:vitals` deliberately is not that. Lighthouse's
headline numbers come from a *simulated* throttling model applied to one cold load on whatever
CPU a shared runner happened to give us, and they move by hundreds of milliseconds between
identical commits. Gating on that buys either a threshold so loose it catches nothing, or a red
build that gets muted within a fortnight.

Instead the script reads the same two metrics from the browser's own `PerformanceObserver` — the
identical entry types Lighthouse reads — under explicit 4× CPU and 4G-ish network throttling,
and takes the **worst of three runs**. Playwright was already a dependency, so it installs
nothing new.

Current numbers: **LCP 432–464ms against a 2500ms budget, CLS 0.000 against 0.05.** The spread
across runs is about 30ms, which is the property that makes it gateable at all.

Proven by breaking it, like N-12: a 260px block rendered 900ms after mount, with no reserved
space, produced **CLS 0.285 — identically on all three runs** — and the gate failed with the
message naming reserved space as the cause. Restored afterwards.

One caveat worth recording: the fixture is generated gradients, not photographs. Real footage
(N-14) will move LCP, and this budget is where that shows up first — which is the right place
for it to show up.

Playback start deliberately stays out of CI. Doc 10 §3 M-9 keeps the authoritative number on a
real phone on real 4G, and CI hardware cannot honestly produce it; production telemetry
(`qoe.playback_start`) is the continuous version.

## N-16 · The platform console, and the privilege boundary it does not cross

`platform_admins` had been a table since migration 0004 that **no code read**. It reads now.

Doc 15 §1's design is the whole of it: a platform admin is *not* a member of an org. If "admin"
were a membership, every org-scoped query in the product would have to ask whether this member
happens to be special, and cross-tenant leaks live in exactly that branch. The cost is that
platform-wide views have to be written one at a time, deliberately — so two were, and no more:
every org with its catalogue count, and one org's catalogues read-only for when a partner writes
in describing a problem.

`lib/admin/platform.ts` is a separate file from `lib/admin/session.ts` on purpose, not a flag on
`OperatorSession`. A boolean on the session would mean every scoped query could in principle be
asked to skip its scope, with nothing between a tenant's data and everybody else's except no
route having forgotten to check. The practical consequence is the point: **there is no way to
widen an operator into an admin.** One function reads `operators`, the other reads
`platform_admins`, and nothing converts between them in either direction.

Three details worth keeping:

- **404, not 403.** An operator poking at `/admin/platform` should not learn the surface exists —
  the same reasoning that already makes another org's catalogue a 404.
- **Read-only, with no write path at all** — not a disabled button, none. Support means being
  able to describe what the partner is describing. The moment this can edit somebody else's
  wedding it becomes the most dangerous page in the product.
- **A platform admin has no `operators` row**, so `/admin` would have bounced them to a login
  they had already passed, forever. It now sends them to the surface that is theirs.

The tests assert the isolation rather than the feature: an operator id does not resolve to an
admin, an admin id does not resolve to an operator, and `PlatformAdmin` carries no `orgId` — that
last one fails if anybody ever adds one, which it should, because it would mean the argument had
quietly changed shape. The E2E asserts the only thing that really matters: a signed-in operator
gets 404 from both routes.

The table is empty, so nobody can reach the console today. That is the correct default; adding
the first row is in NEXT.md under Sandeep's items.

325 unit and component, 90 E2E.

## N-10 · The four Phase 1 modules, and what adding them exposed

`continue_watching`, `timeline`, `checklist`, `randomiser` — each one folder plus one registry
line, which is the property `tests/unit/registry.test.ts` exists to hold and which held.

- **`timeline`** — "Our Story", dated moments down a spine with an optional photograph each.
  Server-rendered: it is text and images with nothing to hydrate. The editor is hand-written,
  which doc 14 §5.8 reserves for config that is "genuinely spatial" and names the timeline as its
  example.
- **`checklist`** — the first module whose state belongs to the *guest*, which is what
  `module_state` and `/api/module-state` were built for in Phase 0. `localStorage` first and the
  server second, so a guest who skipped the profile gate still gets a list that remembers; ticks
  are optimistic and fire-and-forget, because a spinner on a checkbox at a reception on venue
  wifi is the worst possible place to teach somebody about latency.
- **`randomiser`** — "Date Night Planner". The one module that persists nothing, deliberately: a
  remembered answer turns a game into an obligation. It never returns the same option twice in a
  row, because with four options chance alone repeats often enough to read as broken.
- **`continue_watching`** — needed **no contract change at all.** Progress is already on
  `useCatalogue()`, assembled once for the page, so it reads from there rather than fetching. It
  honours the `completed` flag rather than recomputing a threshold, so "finished" has one
  definition in the product. Doc 14 §2's reservation — that most films here are short and get
  finished — is surfaced as an advisory when every film is under five minutes.

### The registry test, corrected rather than appeased

It pinned the exact five Phase 0 types, so adding a Phase 1 module failed it for a reason that
had nothing to do with Phase 0. It now pins each phase separately and asserts the total, which is
what it was actually protecting: the registry is the complete and only inventory.

### What this exposed, which is the more useful half

**Every module's editor was shipping to every guest.** `modules/registry.ts` imports each
module's `index.ts`, which imported both `Guest` and `Editor` — so the admin's form fields and
icon set were in the bundle of a guest on a phone, and had been since Phase 0. Four more editors
made it visible: browse first-load went 139.7KB → 143.9KB against a 150KB budget, and
`check:bundle` printed *"under 5% headroom — the next import will break this"*.

`Editor` is now a `next/dynamic` import in all nine modules. Browse is back to **141.6KB with
8.4KB of headroom**, and the admin-only half of a module can no longer reach a guest by accident.
That gate has now caught two real regressions, which is two more than it caught in the year it
spent looking like paperwork.

341 unit and component tests, 90 E2E.


## N-9 · One name, everywhere

The product is **Heirloom Films**, and four names became one:

| | Was | Now |
|---|---|---|
| package | `mehfil` | `heirloomfilms` |
| directory | `couple-flix` | `heirloomfilms` |
| GitHub | `raammApps/marquee.film` | `raammApps/heirloomfilms` |
| Vercel project | `marquee-film-pub` | `heirloomfilms` |

Seventy files. A clean rename rather than the dual-read migration the item originally described,
because the two live catalogues are trial data — localStorage and cookie keys moved straight from
`mehfil.*` to `heirloomfilms.*`, and a returning guest simply picks a profile again.

**One thing the blanket replace broke, and the suite caught it:** a test hostname became
`aanya-vikram.heirloomfilms films.app` — with a space — because "Mehfil" was being replaced by the
two-word brand *everywhere*, including inside domains. Hosts, keys and emails take the single-word
form; only prose and page titles take "Heirloom Films". Worth remembering the next time a
find-and-replace crosses a name that exists in two shapes.

**Two things the rename surfaced about the deployment:**

- **Renaming the Vercel project orphaned the stable alias.** The new build deployed fine but
  `marquee-film-pub.vercel.app` kept serving the previous commit, silently — the health endpoint
  is what caught it. Re-aliased by hand. Worth knowing that `vercel project rename` does not carry
  aliases forward.
- **The GitHub integration cannot reconnect.** `raammApps/heirloomfilms` is an org-owned private repo,
  which Vercel's Hobby plan refuses. CLI deploys are unaffected — `scripts/deploy-vercel.sh` pushes
  from local rather than from Git — but there is no push-to-deploy until the plan changes or the
  repo moves to a personal account.

343 unit and component tests, 90 E2E, verify green from the new path.

## N-11 · The name, all the way down to the infrastructure

`heirloomfilms.in` serves the product. Two A records at Hostinger, nameservers left where they
were, `ROOT_DOMAIN` switched, redeployed. The GitHub integration reconnected the moment the repo
went public, so push-to-deploy works again and the CLI-deploy workaround above is retired.

**The rename was mostly a false alarm, and finding that out was the point.** Of the three services
the old name supposedly lived in, two never contained it: the Stream library is
`vz-98fb153e-d39.b-cdn.net` and the Supabase project is `ijkwhtfggjihjpykxhnh.supabase.co`, both
machine-assigned. Only a dashboard label said "mehfil". Recreating them to rename them would have
cost seven re-uploaded films and every stored video GUID, or a new database with new keys and a
forced password reset for every user — Supabase cannot migrate password hashes between projects —
and would not have changed one character a guest sees.

The photo storage zone was the real one: `mehfil-photos.b-cdn.net` is the host in every photograph
URL a guest loads, and Bunny cannot rename a storage zone in place. New zone, new pull zone with
the old one's settings copied, 22 objects moved, 10 rows rewritten, verified byte-identical from
both hosts before the switch.

**`photos.url` stores an absolute URL, not a key.** I had assumed the opposite — `urlFor()` looked
like render-time derivation — but `put()` returns it and the route persists it, so moving the
objects was only half the job. `scripts/repoint-photo-cdn.ts` copies first and rewrites second, in
that order, because a rewritten URL pointing at an object that was never copied is a broken
photograph with no way to tell which half failed.

**Preflight never checked photo storage at all.** The read path and the write path use different
credentials, so a wrong storage password leaves every existing photograph loading happily from the
CDN while every new upload fails — the obvious spot-check proves nothing about the half that
breaks. It now writes, reads back through the CDN, and deletes. Both failures were reintroduced to
confirm it catches them: a bad password fails the write, and a CDN hostname left on the old pull
zone fails the read with a 404, which is exactly what a half-finished rename looks like.

The webhook moved to `https://heirloomfilms.in/api/webhooks/bunny` in the same pass. It had not
broken, because the old alias was still attached and still serving the current build — luck, not
design, with several `marquee-film-*` aliases already pinned to deployments days old.

## N-32 §1 · The list that said the work was gone

Create a catalogue in the wizard, click "Catalogues", and the console said *"No weddings here
yet"*. The row was in Postgres the whole time; the router was replaying the `/admin` render it
had cached before the catalogue existed. One `router.refresh()` after a successful create.

**Why no test caught it, which is the part worth keeping.** `e2e/helpers.ts` creates catalogues by
`page.evaluate` + `fetch` — deliberately, so content tests do not fight over the demo fixture. But
it means *no test has ever walked the wizard*, so a line missing from the wizard was invisible to
a suite of 91 E2E specs. The new test clicks through the four steps like an operator, and visits
the list first: without that visit there is nothing cached to serve and the test passes either way.

**I nearly shipped a second fix for a bug that does not exist.** Reading the code, `CustomizerShell`
publishes without refreshing, so the list should show a published wedding as still a draft. I wrote
the fix and a test, watched the test go red, and took that as proof. It was not: the assertion was
`getByText('DRAFT')` across the whole page, and it failed because *other specs* leave drafts in the
shared store. With the assertion scoped to the right card, the test passed with the fix disabled —
publish staleness never reproduced. `page.goto` in the first draft was the giveaway: a hard load
rebuilds the router cache, so there was nothing stale left to find.

The test came out; the `router.refresh()` stayed, because invalidating after publish is correct
regardless. But the entry now says what was observed rather than what was inferred. A green test
that has never been red for the *right reason* is worse than no test — it is a false guarantee, and
this one had me convinced for two runs.

**Preflight was failing before any of this started**, on the photo check added a few commits ago.
It wrote to a fixed key, and the pull zone overrides cache-control to 30 days, so Bunny's edge kept
serving the first run's body and every later run reported "stale or foreign content" on a perfectly
healthy zone. `cache: 'no-store'` governs this process's fetch cache, not the CDN's. Fixed with a
fresh key per run — a key that has never been requested cannot be served from cache — and verified
by running it twice, which is the only way this particular bug shows itself.

## N-32 · The wizard joins the accessibility gate, and two findings evaporate

Two of the five things the live walkthrough turned up were **my own misreadings**, and both
survived being written into the backlog as facts. Worth recording, because the same two mistakes
are easy to repeat.

**"The template radios have no accessible name."** The browser tool printed `radio "on"` three
times and I read that as three unlabelled controls. `"on"` is a radio's default *value* when no
`value` attribute is set — the tool was showing value, not accessible name. The inputs sit inside
their own `<label>`, so the name comes from the label's text. Axe finds no violation and
`getByRole('radio', { name: /The Keepsake/ })` resolves. Both assertions are now in the suite.

**"The web address field keeps its error border after becoming valid."** It is
`focus-visible:border-accent`, and the accent in this palette is red. The field was focused
because I had just typed in it. A red focus ring on a brand whose accent is red looks exactly like
an error state in a screenshot — worth remembering the next time a screenshot is the evidence.

The lesson is the same one the publish fix taught an hour earlier: *seen* is not *verified*.
Reading the tree, the code, or the constraint takes a minute and would have kept both out of
NEXT.md.

**The gate gained something real.** `/admin/new` had never been audited — the axe gate covered the
catalogue list on either side of it but not the four steps in between, which is where a partner's
first half hour actually goes. Both wizard steps are now audited, as separate states, because step
2 is only reachable once step 1 validates. Zero violations on both, so this is a gate against
regression rather than a fix.

The two findings that held up are in NEXT: the global slug namespace (`catalogues.slug` is
`text unique` with no org in it) and the post-claim sign-in that does not switch accounts.

## N-32 · Addresses that cannot run out

`swarit-and-smriti` was refused because *another studio's* catalogue held it — a namespace
collision presented to a partner as a flat refusal, about a catalogue they are not permitted to
see. Indian couple names repeat; this was going to bite within a few hundred weddings.

Addresses now carry the **wedding year** — `aanya-and-vikram-2026` — and a taken address always
offers a free neighbour, `aanya-and-vikram-2026-k3f`, as one click.

**The design we did not ship is the more useful record.** The first answer was
`/c/<studio>/<couple>`, the GitHub `org/repo` pattern, and half of it was built: routing,
middleware, both repository drivers, a constraint migration. Two things killed it.

The first is that GitHub's namespace *means something to the reader*, and ours does not. A guest
sees a vendor they have no relationship with, and after handover the couple's permanent address
carries the studio that filmed it — permanent precisely because we had frozen it to `origin_org_id`
so links would survive the transfer. The URL was modelling who built the wedding when guests only
care whose wedding it is.

Replacing the studio's name with an opaque studio id looked like the fix, and is worse: it still
groups two links as the same studio to anyone comparing them, it means nothing to any reader, and
— decisively — **it does not remove the need for collision handling anyway.** One studio can shoot
two Priya & Arjun weddings in one year. Once the suffix exists, the id buys rarity, not safety,
while taxing every other address with a token nobody can read.

So: the year for the common case, a suffix for the rare one, and studio ownership stays in
`origin_org_id` where it was already correct and already invisible to guests. Custom domains
remain the real white-label answer for anyone who wants their own address.

It also cost about an hour instead of a day. No route change, no middleware change, no migration,
no repository signature change — `catalogues.slug` stays globally unique, which is exactly what
the suffix guarantees.

Both halves were proven by reintroducing them separately: dropping `suggestion` from the API kills
the offer, and dropping the date argument to `suggestSlug` takes the year off the suggestion.

## N-32 §2 · The handover that signed the couple into the studio's account

A couple clicking "Sign in with priya@…" after accepting their wedding landed in the **studio's**
console. `/admin/login` redirects anyone with a session straight to `/admin`, and the studio hands
the couple its own phone — so the button delivered one account's weddings to somebody who had just
asked for another's.

Fixed by signing the existing session out before navigating, and carrying the address through so
the login form is addressed to the person the button named.

**The interesting part is why the suite could not have caught it.** `admin.spec.ts` already covers
the claim, but it opens the link in a fresh browser context — sensible, and fatal here, because the
bug only exists when a session is present. Worse, moving the test into that suite would not have
helped: the desktop project runs **subdomain mode**, where the operator signs in on `localhost` and
the claim is served from `heirloomfilms.localhost`. Different hosts, so the cookie is never sent
and the couple always arrives signed out.

The first version of the test passed for exactly that reason, and I nearly took the pass at face
value — the second time in one session that a green test meant nothing. What settled it was
probing the premise directly: sign in, visit `/admin/login`, print the URL. It said `/admin`, so
the redirect was real and the test was lying.

So the test lives in `path-mode.spec.ts`, on the one host production actually serves. That file was
created because path mode had no coverage at all; this is the second bug found by the same gap —
not a gap in thoroughness but in *configuration*, where the thing being tested is real and the
environment testing it is not.

Both halves proven separately: removing the sign-out puts the couple back in the studio's console,
and removing the prefill leaves the address field empty.

## N-30 · One answer to "did that save?"

The console had five surfaces that write and five different answers. The customizer and theme
picker said so, settings had a status line, the wizard had an explicit button — and the film list,
which writes on blur, said nothing at all.

Worse than nothing. `update()` awaited the PATCH and never looked at `response.ok`, so a **refused
save and a successful one were identical from the operator's chair**. Rename a film, see no
reaction either way, navigate off, lose it. That is the complaint that started this — "double
check forms for save option, many doesn't" — and it was right.

`components/admin/SaveState.tsx` is now the single answer, shared by the film list, the customizer
and the photographs. A component rather than a copy of the customizer's markup, on the reasoning
this repo already applies to the guest tree: two implementations of one idea drift, and the one
that drifts is the one nobody is looking at. `role="status"` carries an implicit polite live
region, which matters here because blur has already moved focus by the time the outcome appears.

**Captions could never be written at all.** `photoSchema.caption` has existed since the beginning
and the guest lightbox renders it, but there was no PATCH route and the manager could only upload
and delete. A field that guests can see and operators cannot edit reads as a broken save rather
than a missing feature. Added `updatePhoto` to the interface and both drivers, a PATCH route
scoped through the album's catalogue exactly as deletion is, and an on-blur caption field.

**Two things the gates caught that tests would not have.** Deleting the film list's indicator
fails `pnpm verify` outright — `saveState` becomes an unused variable — so the guard is lint
rather than a spec that could be skipped. And the caption test asserts *after a reload*: with the
route accepting the request but never persisting, an optimistic update passed everything up to
that line.

The photographs surface also had **no E2E coverage whatsoever** before this.

One flake seen once, not reproduced in five subsequent runs (three isolated, two full): the N-32
wizard test failed under full parallel load. Recorded rather than dismissed — if it recurs, the
cause is likelier machine saturation than the fix it guards.

## N-31 · A photograph you can send someone

Films have had sharing since VE-6, and it is the distribution model rather than a nicety — the
link spreads because a guest forwards it, not because anyone markets it. Photographs had no
actions at all, so the thing a guest most wants to send their sister was the one thing they could
not.

**A photograph's address is the page it is already on, plus `?photo=<id>`.** No route of its own:
`/c/<slug>/photo/<id>` would be a second page that re-resolves access, re-renders the gallery
behind it and handles a missing photograph — for a link whose whole job is to reopen a lightbox
that already exists. Built from `window.location` rather than from a `shareBaseUrl` threaded
through the module contract, so it stays correct in both tenancy modes, on a custom domain and in
the customizer's preview without knowing about any of them.

`usePhotoDeepLink` is shared by both photo modules, so a link behaves the same whichever section
it came from — and the URL follows the guest as they swipe, via `replaceState` rather than a
router push. Thirty photographs must not leave thirty history entries, or Back stops meaning
"leave the gallery", which is the only thing a guest ever wants it to mean.

The share control is the **same `ShareButton` films use** — already generic over `url` and `text`,
so a shared photograph and a shared film behave identically, and no new i18n keys were needed.

**Both halves proven separately**: without the URL sync there is nothing to copy, and without the
read a forwarded link opens the gallery closed. The test also checks the query is *removed* on
close, so a guest does not carry a stale `?photo=` into their next visit.

**Two surfaces had no coverage at all before this** — guest-side photographs, and the lightbox in
the axe gate. The gate audited the title modal and stopped, so the other full-screen dialog on the
guest surface went unchecked for the life of the suite. Zero violations on both viewports.

Suite stability, recorded rather than smoothed over: one run reported `1 did not run` (a worker
that never started) and an earlier run flaked on the N-32 wizard test. Neither reproduced. Both
look like saturation under full parallel load rather than the code they cover.

## N-31 §2 · Likes, counted and shown

A heart on films and photographs, with a count everyone can see. The product question was put
before it was built — private keepsake or public tally — and the answer was public.

**Keyed on a device-local `guest_key`, not on a profile.** The gate can be skipped and most guests
do, so keying on `profiles.id` would mean creating a profile behind their back on first tap or
refusing the tap. A key the browser holds is no less trustworthy: a profile id is a client-held
string too. The number is a count of devices that tapped, which for a wedding gallery is the
honest and sufficient thing.

The button loads its own state, because only one film or photograph is open at a time — seeding
every card would mean carrying a counts map through the module contract for numbers nobody can
see until they open something. Optimistic on tap and **reverted on failure**: a heart that stays
filled after a refused request is a lie the guest discovers only when their like has vanished on
reload.

**The test that matters is the second guest.** A per-device tally passes every single-browser
assertion, so the spec opens a second browser context with its own guest key and requires it to
see a total it did not contribute to. Proved by making counts per-device in the memory driver:
the second guest then sees nothing, exactly as it should fail.

**Two test-isolation lessons, both learned the expensive way.** The like assertions first used
exact numbers — but mobile and desktop run `guest.spec.ts` against one server and one demo
fixture, so another worker's tap lands between the read and the click. They failed about one run
in three while the counts were entirely correct. Thresholds say the only thing true under
concurrency and still fail if likes are not shared.

The second is unresolved and is now **N-33**: the N-32 wizard test fails ~2 runs in 3 under the
full suite and never in isolation. Latency, rendering scale, server-cache invalidation and a
store reset were each tested and ruled out. The behaviour it guards is proven correct. It is
recorded rather than deleted, because it guards a bug that reached production.

## N-17 · Email, verified by reading the delivered message

Confirmation is on (`mailer_autoconfirm: false`), Resend delivers from
`"Heirloom Films" <hello@heirloomfilms.in>`, and the whole loop now runs: register → email
arrives → click → confirmed → sign in.

**The interesting part is how the last bug was found.** The confirmation link's destination comes
from Supabase's Site URL, which nothing in this repo can read — every check available here passed
while it pointed at `heirloomfilms-sandeep-bh5-7354s-projects.vercel.app`, which serves `200` and
therefore looks entirely fine. Every new partner would have registered, clicked confirm, and
landed on a Vercel URL with the product on it and none of the brand in the address bar.

It was found by reading the **delivered message through Resend's API** rather than asking anyone
to check an inbox: list `/emails`, fetch by id, pull `redirect_to` out of the body. That turns "go
and look at your email" into a repeatable check, and it is how the fix was verified afterwards —
including following the link and watching `email_confirmed_at` fill in.

Turning confirmation on is also what made this urgent rather than cosmetic. With it off, a wrong
Site URL only affected password resets. With it on, it sits on the path of every registration.

Two ordering lessons, both cheap and both nearly missed:

- **Rotate the key after the work that needs it.** Deleting the old photo zone needed the Bunny
  account key; rotating first would have revoked the credential mid-task.
- **Fix the claim screen before flipping the switch.** Registration already hedged about
  confirmation; the claim screen did not, and it calls `signUp` identically — so a couple would
  have been handed their wedding, told to sign in, and found they could not.

## N-33 · The flake was the suite, not the test

Three E2E projects share one server process, one in-memory store and one demo catalogue. Run in
parallel they interfere: catalogues appear in each other's lists, the demo is read mid-write, and
about one run in three failed — on the wizard list, or a guest row, or a caption, whichever was
unlucky. Every one passed alone, every time.

`--workers=1`: **108 passed, three runs, no other change.** That is the whole diagnosis.

**The cost of not finding this sooner was the interesting part.** Chasing it as a bug in the
wizard produced a longer timeout, a narrowed assertion, and a `revalidatePath` that helped nothing
and made a stable caption test start failing. Three fixes for behaviour that was already correct.
The tell was there early and I read it wrong twice: *passes alone, fails together* is contention,
not a defect, and the first cheap experiment should have been to remove the concurrency rather
than to reason about caches.

Workers are pinned to 1, and the workarounds are removed now the cause is gone. ~1.7 minutes
instead of ~55 seconds, which is the right trade: a suite that fails a third of the time teaches
people to re-run it, and a re-run is how a real failure gets ignored.

Parallelism can return when each worker gets its own store. The fix is isolation, not concurrency.

## The storage cap had never once refused an upload

`titles.size_bytes` was missing from the Supabase driver's column map for the whole life of
migration 0007, and `createPhoto` hand-listed its columns and omitted it too. Writes dropped it
silently, reads returned it, and `catalogueStorageBytes` summed a column nothing ever wrote — so
**every catalogue in production reported 0 GB**, and a partner on a 20 GB plan could have uploaded
two hundred.

Found while checking why a real catalogue showed no storage, which is the second time this week
that looking at production data has turned up something no test could see.

**No behavioural test could have caught it.** Every unit, component and E2E test runs against
`MemoryRepository`, which stores whole objects and is structurally incapable of losing a column.
The asymmetry exists only in the driver nothing tests. So the map itself is now the thing under
test: `tests/unit/supabase-mapping.test.ts` compares both maps against `titleSchema` and
`photoSchema` in each direction, and fails if a field is added to one and not the other. Verified
by removing the mapping again and watching it name the missing field.

`pnpm backfill:sizes --write` repairs the rows already written.

## A row that held one film, and a row that held none

`seedModules` keeps the featured film out of the curated rows so a fresh catalogue does not show
the same film twice. Correct for a wedding with a dozen films; wrong for one with two — seen on a
real catalogue, where two films with one featured left the row under the billboard holding a
single card. That reads as breakage rather than curation, and it is the first thing a partner sees
after their first upload, when they are least inclined to believe the product works.

The featured film now stays in the rows unless there is enough without it — two per row, because
one card is not a row, it is a mistake with a heading.

Writing the test found a second one nobody had reported: a template with two rows and **one** film
seeded a second row containing nothing. The fix is not to pad it with a repeat but to not create
it; rows are added in the customizer whenever there is something to put in one.

**And one finding that was simply wrong.** "Presented by san-test-studio" is not a fallback to the
org slug — `branding.presentedBy` is an operator-editable field in the customizer, seeded from the
business name at registration, so it shows whatever was typed. Recorded in NEXT as a non-bug
alongside the duration badge and the letter sign-off, because the cost of re-investigating these
is paid by whoever comes next.

## The September planning merged, with its stale halves corrected

The 6 September session's output — a roadmap, a new price ladder, a no-hard-delete lifecycle,
multi-channel notifications, and the rule that all year-one money goes through the studio — is now
in the repo. Two commits from the handoff patch, then one reconciliation, because **the plan was
written the day before and part of it had already been built.**

What the patch would have resurrected as open tickets:

- **N-35, "every save is legible"** — shipped as N-30. Its description ("the film list saves on
  blur and says nothing") had stopped being true.
- **N-34, "photograph sharing and captions"** — shipped as N-30 and N-31.

Both were removed and their status rows flipped in `PRODUCT.md` and `ROADMAP.md`. `NEXT.md`'s
standing paragraph also still claimed 308 tests, 81 E2E and `marquee-film-pub.vercel.app`; it now
reads 387 / 108 and the real domain, and names the two findings that would otherwise mislead
whoever reads it next — the storage column the driver never wrote, and the suite contention.

**The pending decisions were kept out of the decision log deliberately.** D-11 to D-22 are
appended as decisions because they were made; P-1 to P-6 sit below them under a heading that says
they are not, with the argument preserved so it does not have to be rebuilt. P-1 alone would
change `PRICING.md`, `ROADMAP.md`, `PRODUCT.md` and four tickets, so building against it before it
is answered would be the expensive kind of guess.

`REQUIREMENTS.md` is the target product and is meant to disagree with `PRODUCT.md`, which is what
exists. Three of its status lines were corrected on the way in for the same reason as N-34/N-35.

## Renamed to Mehfilbox — the documents only, deliberately

D-23. The brand moves; the identifiers do not. The domain, Vercel project, Bunny zones, package,
repository and `hello@heirloomfilms.in` all still read `heirloomfilms`, and every document now says
Mehfilbox while every URL in it says `heirloomfilms.in`.

That reads as an inconsistency and is the honest state. Renaming the docs to match a name the
infrastructure does not have would produce documents describing a system nobody can reach — which
is the failure this repo spent a session correcting. `PRODUCT.md` says so at the top rather than
leaving a reader to notice.

**The split is what made this cheap.** Three categories, and only one was touched:

| | |
|---|---|
| Brand prose | Renamed — `PRODUCT`, `ROADMAP`, `REQUIREMENTS`, `PRICING`, `NEXT`, `DEPLOYMENT`, `README`, the studio-only proposal |
| Live identifiers | **Untouched** — `heirloomfilms.in`, `.test`, `.localhost`, the Vercel project, the photo zone |
| History | **Untouched** — the PROGRESS entries recording the *previous* rename say what happened, and rewriting them would be a lie about the past |

**A blanket replace would have been wrong in both directions**, which the last rename already
proved: it produced `heirloom films.app` — a hostname with a space — by substituting a two-word
brand inside domains. Mehfilbox is one word so that exact failure cannot recur, and the discipline
still holds, because the other two failures were a missed mixed-case occurrence and a deploy script
that silently created a second Vercel project.

**It also uncovered damage left by that rename.** `PRODUCT.md`'s naming section had been mangled
into "an heirloomfilms is *a thing a family passes down*" and "chosen over Heirloom Films" — chosen
over itself. Rewritten rather than patched: it now records what the name replaces, keeps the
criteria that still apply (a coined word is registrable; the register decides, not a search
engine), and states the two things outstanding.

**N-52 carries the code rename**, with the three failures from last time written as checks rather
than as a story, and the order that worked: domain, Vercel, repository, package, then the Bunny
zones. It is blocked on `mehfilbox.in`, which as far as this repo knows is not registered — a brand
without its domain is a decision that has not finished.

## The audit before the next phase: mostly clean, one real gap

Asked to clean up, refactor and modularise before starting new work. The honest finding is that
there is very little to do, and saying so is more useful than churn:

| | |
|---|---|
| Dead code | none — `knip` is already in `pnpm verify` |
| `TODO` / `FIXME` | zero |
| Size | 19,700 lines, 180 files |
| Seams | `Repository`, `VideoProvider`, `PhotoProvider`, `AuthProvider`, the module registry — each with real alternative implementations |

**The one refactor that looked worthwhile was rejected.** `lib/db/supabase-repository.ts` is 1,040
lines with nine clear section boundaries, and splitting it is exactly the kind of change that
feels like progress. It is also **the least-covered file in the repo** — which is precisely why
the `size_bytes` bug lived there for a month — so a broad mechanical edit buys a shorter file and
pays in risk against production Postgres. Length is not the defect; the defect was a hand-
maintained list drifting from the schema, and that is now covered in two places.

**The second place is what this session added.** `tests/integration/drivers.test.ts` already
round-tripped a title against the real database — and it **passed `sizeBytes: 1024` without ever
asserting it came back**, checking three hand-picked fields instead. The same failure shape as the
column map, one layer down: a hand-written list that drifts. It now compares **every field it
sent**, so a column added to `titleSchema` has to survive Postgres or the test fails.

Proved by removing the mapping again and running against the real database:
`sizeBytes did not survive the round trip: expected null to deeply equal 1024`.

Between the two, the same bug is now caught at the map (`pnpm verify`, offline, free) and at the
row (`pnpm test:integration`, real Postgres). The first is fast enough to run always; the second
is the one that would have caught it even if the map had been generated correctly and Postgres
had rejected the value.

## N-52 · Mehfilbox, all the way down

`mehfilbox.com` is canonical and serving; `mehfilbox.in` and `heirloomfilms.in` both resolve. The
code rename, the Vercel project, the GitHub repository, both new domains, `ROOT_DOMAIN`, the Bunny
library and webhook, the photo zone, Supabase's Site URL and the SMTP sender — done in a day,
against a live product with real catalogues on it.

**The last rename's three failures were the specification, and one of them was live.**

The two-word-brand-inside-a-hostname bug could not recur — Mehfilbox is one word. The mixed-case
fixture that was missed last time, `Aanya-Vikram.Heirloomfilms.App`, was renamed this time because
the survey was case-insensitive rather than a lowercase regex.

The third was **armed at the moment of the rename**: `scripts/deploy-vercel.sh` read `mehfilbox`
while the Vercel project was still `heirloomfilms`, and `vercel link --yes --project` *creates on
miss*. Running it would have deployed into a new empty project while production served the old
one, reporting success throughout. The script now refuses to link to a project that does not exist
— the class, not the instance.

**And the guard written to prevent that was itself wrong**, which is the more useful half. `vercel
project ls` prints on **stderr**, so discarding stderr made it see an empty list and refuse *every*
deploy. It failed closed, so nothing would have broken — but the first person to run it would have
been told a project sitting in front of them did not exist. Found by testing the guard against
reality a minute after writing it, rather than trusting that it did what it read as.

**Two silent-failure modes were checked rather than assumed**, both of which have bitten this
product before:

- The **Bunny webhook** moved in the same sitting as `ROOT_DOMAIN`. Left behind it keeps answering
  from the old host — uploads succeed, transcoding finishes, titles never leave `processing`.
- The **Supabase Site URL** was verified by registering a throwaway partner and *reading the
  delivered message* through Resend's API: `redirect_to: https://mehfilbox.com`, followed to a
  `303`, confirmed 22 seconds after the send. A wrong Site URL serves `200` and looks healthy from
  every other angle, which is how it went unnoticed on the first domain.

`heirloomfilms.in` keeps serving and is never dropped. Every link already in a guest's phone points
at it.

## The September model, settled: studio-only

D-26 to D-30 close the five decisions the handoff left open, and the docs now agree with them
rather than hedging.

**The studio is the only customer.** Every rupee is invoiced to them at a base they mark up —
delivery, the day-60 upgrade, renewal, archive, long-term archive, storage, 4K. One customer, one
invoice shape, one payment flow, and no couple can find our ₹2,500 beside their studio's ₹8,000.

**The escape hatch is what makes the model honest.** When a studio is gone — closed, plan unpaid
past grace, or unresponsive 90 days after a lapse — the couple may pay us directly at list price.
It is computed rather than stored and logged when it unlocks a purchase. Without it, a model whose
renewals depend on studios is precisely what `COMPETITORS.md` §4 positions against, and the
positioning line changed with it: not *"the couple owns it"* but **"the wedding survives the
studio"**, which is true and which no competitor here can say.

Four consequences, all now in the docs rather than in someone's head: **N-37 moves to Phase 2**,
because under studio-only the lapse dashboard is not reporting, it is the collection channel.
**N-20 is one flow**, with the escape hatch as the same checkout carrying `payer = couple`.
**N-21 becomes the handover email** — *your studio manages the plan* — since billing never
transfers. And **N-24 gains the `studio_gone` predicate**, which needs an audit trail rather than
a boolean, being the only thing that lets a couple pay us at all.

**Originals go to Edge Storage** (D-28), and the reason is worth keeping: D-15 already decided
that originals are dropped *per catalogue* at archive, and Bunny Stream's "Keep Original Files" is
a **library** setting that cannot express "this wedding's originals go, that one's stay". The
cheaper option could not implement a policy that was already made. It also hands N-22 the
per-file signed URL it needs.

**Credits expire at 24 months** (D-27) and **the Studio plan is mandatory** (D-30) — the first
because an unused credit is a liability that never clears, the second because D-18's whole
reconciliation collapses if the plan is optional.

**P-6 stays open on purpose.** Whether a studio will offer their couple Keep at day 60, and at
what markup, is a fact to obtain from one studio owner — not a decision to reason toward.

## N-50 · The notification seam — 7 September 2026

The application could not send anything. Supabase Auth mailed registration and reset through
Resend, but that is Supabase's mailer, not ours: no delivery message, no expiry warning, no
handover. `NotificationProvider` is now the fifth driver seam, built the way `VideoProvider` was —
one interface, a `fake` the whole suite runs against, a `resend` driver that is already the auth
mailer, and one switch on `NOTIFY_DRIVER` in `lib/notify/index.ts`.

**Queue and record are the same table.** `0009_notifications.sql` holds template, channel,
address, provider, provider id, result and attempt count, with a partial index on
`status = 'queued'` so the drain scans the queue rather than the history. `PRICING.md` §2 wants
"what did we send and when" to be a query; it is one row per send, never deleted.

**`enqueue` does not send, and a test enforces that.** Nothing in a guest request path may wait on
Resend. `app/api/cron/notify/route.ts` drains every fifteen minutes behind the same bearer guard as
`cron/reconcile`. Making `enqueue` send immediately turned three tests red, including the one named
for it.

**An uncarryable channel is skipped, not burned.** `provider.channels` is declared on the
interface rather than discovered at send time, so `drain` steps over a WhatsApp row and leaves it
`queued` for the day the `msg91` driver exists. Marking it `failed` instead is what a naive
implementation does, and it silently loses the message; the test asserts `failed: 0`, and it goes
red when the skip is removed.

**Templates are i18n entries, so they inherit a gate that already exists.** `render()` reads
`notify.<name>.{subject,text,html}` from the dictionary, which means the fifteen English and
fifteen Hindi entries are covered by `i18n.test.ts` without that file knowing notifications exist.
Deleting one Hindi subject fails in two suites at once.

**Shipped with `fake` and `resend` only.** WhatsApp is ₹500/month against ~100 messages (D-12), so
the `msg91` driver waits for the first real wedding that needs a delivery message — the fee should
start against revenue, not against a build. Meta's template approval is still worth starting now;
it takes days and costs nothing.

What went wrong, worth keeping: knip reported *"Unused tag in lib/db/index.ts"* once
`notify.test.ts` imported `setRepository`, because a suppression that no longer suppresses anything
is itself a defect. Two attempts to remove it failed silently — the first because the search string
was short by three characters, the second because I wrote the tag's literal name in the replacement
prose and knip read it as a tag. Both were caught by re-running the gate rather than by trusting
the edit.

**`0009_notifications.sql` needs applying to production.** Until it is, the cron drains against a
table that does not exist.

## N-51 · The landing page — 7 September 2026

The root domain was a five-line signpost with an "Operator sign in" button. It is now the page
that sells Mehfilbox to a studio, plus `/privacy` and `/terms`.

**It sells to studios, not to couples, and that is a correction.** N-51 was written before D-26
settled studio-only and described a viddrop-shaped page pricing a wedding at ₹1,999 *to the
couple*. Under studio-only every rupee is invoiced to the studio at a base they mark up, so a
couple-facing price on the front page would sit next to their studio's ₹8,000 and undercut the
partner the whole model depends on. The prices shown are partner prices, labelled as such, beside
the retail they exist to support — which is information a studio needs to buy and a couple has no
reason to read.

**Two claims are deliberately weaker than the competition's.** Not "no compression" — renditions
are transcoded, and the honest, better line is that originals stay downloadable untouched. Not
"yours forever" — it archives, and the FAQ says so in one sentence instead of burying it.

**`/privacy` did not exist.** Every wedding page's footer has linked it since Phase 0, so every
guest has had a 404 one tap away. It is written from what the code actually stores: a guest
profile is a display name and an avatar seed, with no account and no email, which is worth stating
plainly because it is unusual and true.

Three things the gates caught that review would not have:

**`accent-hi` is a surface-0 colour only.** `check:contrast` verifies it against surface-0 at
4.9:1 and nothing else, so using it on a raised surface is unguarded — axe found it twice, once on
surface-2 and once on surface-1. The second failed on desktop while passing on mobile, because the
column was clipped out of the scroll region on the narrow viewport. A violation that hides at one
width is the argument for running the gate at both.

**A horizontally scrollable table needs keyboard access.** Two `overflow-x-auto` wrappers were
reachable by dragging only.

**The demo link was correct in exactly one environment.** It was hardcoded as
`/c/aanya-and-vikram`, which is production's slug, while dev and CI seed `aanya-vikram`. It is
`DEMO_CATALOGUE_SLUG` now.

The last of those produced the more useful lesson. The test written to catch it —
`expect(response.status()).toBeLessThan(400)` — passed against a deliberately wrong slug, because
a missing catalogue renders a "not available" page with **HTTP 200**: the guest surface's only
real 404 is drawn, not returned. The test now asserts the profile gate is visible, and that does
fail when the slug is wrong. A test proved by breaking it is the only kind worth having, and this
one needed breaking twice to become true.

## N-27 · The platform console's first write — 7 September 2026

The platform console listed orgs and one org's catalogues, read-only, and doc 15 §1 said to add
writes one at a time with an audit trail. This is the first: **suspend and restore a studio**,
plus the user list and the trail itself.

**Suspension is an org state and never a catalogue one, and that is the whole design.** A billing
dispute between us and a studio must never take a wedding off the air — the couple is not party to
it. `status` sits on `orgs`, the suspend path touches no catalogue, and a test asserts the
catalogue list is byte-identical before and after. If that column ever migrates onto `catalogues`,
that test is what should stop it.

**A suspended studio keeps its session.** Returning null from `getOperatorSession` would bounce
them to a login they can still pass, which would bounce them back — a loop that explains nothing.
Instead the session carries `orgStatus`, `requireOperator` refuses every route at the same choke
point that enforces org scoping, and the console renders a screen that says what happened and who
to email. A route that forgot about suspension is a route that was already unscoped, which is why
that is the right place for it.

**The status rides along with the operator lookup rather than costing a second query.**
`getSessionOrg` exists precisely so a write does not pay to read an org row nobody displays, and
suspension has to be checked on every authenticated request. `getOperatorWithOrgStatus` embeds the
parent row through the foreign key — one round trip in PostgREST, a lookup in memory.

**An operator whose org has vanished gets no session at all.** Defaulting to `active` there would
hand out the widest access at the moment least is known.

The user list turned out to be the most useful part, and not for the reason it was built.
`kalyanam` has **no operators at all** — its auth users were deleted, `on delete cascade` took the
`operators` rows, and its catalogues are intact and unreachable. Every other surface shows a
healthy org with catalogues against it. The org page now says so in as many words, and a test
holds that state.

Knip caught its own stale suppression a second time, on `setAuthProvider`, for the same reason as
`setRepository` a day earlier: a new test imports it, so the tag no longer suppressed anything.
Two for two — it is the most reliable signal in the suite for "this comment stopped being true".

## N-55 · The customizer says whether guests can see the page — 7 September 2026

Built by using the customizer as a studio owner would, rather than by reading it. Most of it is
good — bilingual heading fields, real help text, drag and keyboard reorder, autosave. Two things
were not, and one of them was a defect rather than friction.

**Publish never checked either response.** It fired the draft save and the publish request, read
neither, then set "Saved" and refreshed. A refused publish and a successful one were
indistinguishable, so an operator could walk away certain a couple could open a page the couple
could not. This is exactly the defect N-30 fixed on the film list — *"a refused save and a
successful one looked identical"* — surviving on the one control in the product where it costs
most. N-27 made it reachable rather than theoretical: a suspended studio's publish now returns 403.

**"Saved as draft" was answering the wrong question.** It says the operator's typing survived. The
question an operator actually has is whether the couple can see it, and those had the same
reassuring answer. The fact was already in the row — `draft_modules` is non-null exactly when the
live page is behind the preview, written by autosave and cleared by publish — and nothing displayed
it. Now the panel says one of three things: not published at all, guests are behind, or guests are
seeing exactly this; the button reads Publish, Publish changes, or a disabled Published; and a link
opens the live page so the sentence can be checked rather than trusted.

The E2E work taught more than the feature did. Three separate cross-test assumptions had to go,
each found by a green test failing in a larger run:

- **"Move up" is not a reliable mutation.** At the top of the list the handler returns early
  without committing, so a file whose tests each moved the same section up eventually had nothing
  to publish.
- **A section's name is not this spec's to rely on.** `operator.spec.ts` renames them, and one
  server and one store are shared with `workers: 1`, so a locator naming "The films" passed alone
  and timed out in the suite.
- **The catalogue list has one "Customizer" link per row** — seven by the time this file runs —
  so clicking it without first waiting for the detail page is a strict-mode violation rather than
  a navigation.

All three are the same lesson: with a shared store and a single worker, a spec may only depend on
what it created or on what its own role and position guarantee.

Also fixed on the way: a store written before 0010 has no `status` field at all, because the file
driver spreads stored JSON over `emptySnapshot()` and never parses it, so Zod's default never runs.
The local demo store was exactly that. A present org with no status now reads as active; a missing
org still gets no session.

## N-56 · Nothing reaches the couple before Publish — 8 September 2026

Sandeep's requirement, stated plainly: changes are saved but not shown, and they club together until
the next Publish. Sections already worked that way. **Branding did not.**

Colour, logo, typeface and "Presented by" were PATCHed straight onto the live catalogue row, which
is the row the guest page reads — so a studio trying a colour repainted the couple's page while
they were still choosing. The code knew: `ThemePicker` carried the comment *"Publish copies draft
sections and never touches branding."* That was written as an explanation and it was really a
defect.

`draft_branding` now mirrors `draft_modules` exactly — null means nothing pending, Publish promotes
and clears — and the PATCH route **no longer accepts the live `branding` field at all**, so the
console cannot write it even by mistake. `/api/claim` still sets it through the repository, which
is right: that is the system stamping "Presented by" at handover, not an operator editing.

Three bugs came out of building it, and all three were mine, made while fixing the first:

**An inline arrow as a prop.** `onPreview={setBranding}` was a stable setState reference; I replaced
it with an inline lambda so it could also mark the page unpublished. `ThemePicker`'s autosave effect
lists `onPreview` in its dependencies, so the effect re-fired on every render.

**An effect depending on a prop that Publish changes.** The same effect read `catalogue.branding`,
which is exactly what promotion updates — so publishing re-ran the effect, which rewrote the draft
milliseconds after it was promoted, and the console announced "guests are still seeing the last
published version" immediately after a successful publish. Publish appeared to do nothing. The
fields this panel does not edit are captured once now.

**Publish flushed the sections but not the branding.** `publish()` had always flushed the modules
autosave first — *"so Publish can never ship a stale draft"* — while branding's 700ms debounce had
no such flush. Publishing inside that window promoted a draft without the operator's change, and
the debounced write then landed after the promotion. Branding is flushed too now.

`ThemePicker` also stopped hand-rolling its own status text. It said "Saved", which was a fourth
copy of what `SaveState` exists to centralise (N-30) and stopped being true the moment branding
became a draft.

**The E2E lesson is the more valuable one.** These tests hide sections and publish, and rename
"Presented by" and publish — against the shared demo catalogue. That is a destructive edit to the
fixture every other spec reads: `guest.spec.ts` began failing on content this file had hidden, and
because the local dev server is reused between runs, the damage outlived the run that caused it and
looked like an unrelated flake. Each test now creates its own catalogue. **A spec that publishes
must own what it publishes.**

Still live-on-write, and deliberately out of scope until asked: films, photographs and settings.
A curated row set to `auto` picks up a newly published film without a Publish, and the settings
page writes couple name and passcode directly. Extending the rule there is a larger question —
a film that uploads but stays invisible until Publish is a different product decision, not a bug —
and it is N-57.

## N-53 · Two alerts that would have caught the faults we had — 8 September 2026

Every serious fault in this product was **silent**: a transcode webhook pointed at a dead URL while
uploads kept succeeding, a storage column the driver never wrote so the cap never refused anything,
an SMTP credential that authenticated but could not send. Each was found by a person looking at
production. `/api/health` was green through all of them, because it reports which drivers are
configured — not whether anyone can watch a film.

**The webhook alert reads a signal that was already there.** The reconcile cron exists as a safety
net for lost webhooks, and when it settles a title it has just done the webhook's job. A healthy
webhook means `settled` is zero, so any other number is worth an email — and that is exactly the
signature of the fault that ran for weeks. It deliberately does not alert on `failed`: a film the
provider could not encode is the operator's problem and already visible in their console.

**The synthetic check walks the four steps a guest walks** — resolve the catalogue, load the
bundle, find a ready film, mint a playback token — and names the step that broke, because
"resolve" and "playback" send someone to completely different places. It stops short of fetching
the manifest from the CDN: that would make a Bunny edge hiccup page us about our own app.

**Alerts go through the notification queue rather than around it**, which buys three things at
once: the send happens on the cron instead of inside the request that noticed, `notifications`
becomes the record of what we were told and when, and an alert cannot take down the thing it is
reporting on. There is a test for the case that matters most — the provider failing while an alert
about the product is queued.

**De-duplication is the property that decides whether any of this gets read.** A dead webhook stays
dead, and the cron runs on a schedule, so without a window one fault becomes ninety-six emails a
day and the mailbox becomes noise. One alert per six hours, counted against the `notifications`
table so it survives a restart rather than living in a process's memory.

A test lesson worth keeping: the first version of "alerts again once the window has passed" passed
`withinHours: 0` and proved nothing — a zero-length window starts at *now*, and the row written a
millisecond earlier is still inside it. It went green for a reason unrelated to the behaviour it
claimed to check. It moves the clock now.

Both are scheduled from GitHub Actions, hourly for the synthetic check, for the same reason as the
drain: Hobby allows two daily crons and `reconcile` and `usage` hold both. Production was checked
first — the demo catalogue has ready films with provider ids — because an alarm that cries wolf on
its first day is worse than no alarm.

What is left is N-53b, and both halves want a paid account: log retention, and error grouping
behind the `setErrorSink` seam.

**The synthetic check found a real fault on its first production run**, which is the best argument
for it that could have been made. Three things, none of which any existing signal would have
reported:

`DEMO_CATALOGUE_SLUG` had never been pushed to Vercel — it was added to `.env.vercel.local` during
N-51 and the deploy script was not re-run — so production fell back to the seed fixture's slug.
That meant **the landing page's "Open a demo wedding" button pointed at a catalogue that does not
exist in production**, and it returned **200**, because a missing catalogue renders the "not
available" page rather than a 404. No test caught it: in E2E the seed slug is the correct one. No
status code, no log and no error would have shown it either.

`SUPPORT_EMAIL` was still `operator@mehfil.test` — a domain retired two renames ago. Every alert
N-53 raises was addressed there, and it is also the address a suspended studio is told to write to.
It is `support@mehfilbox.com` now, which has MX at Hostinger and can actually receive; a `.test`
address cannot, and an alerting system that posts into a void is worse than none because it is
believed.

Worth recording precisely: draining that first stale alert reported `sent: 1`. **`sent` means the
provider accepted the message, not that anybody received it.** The address was undeliverable and
Resend took it anyway.

## N-57 · Films and photographs wait for Publish — 8 September 2026

Sandeep's answer to the open question was "everything should wait on Publish". This is the content
half: sections waited in `draft_modules`, branding waited in `draft_branding` (N-56), and films went
live the instant an operator ticked a checkbox while a photograph appeared the moment it finished
uploading. One wedding page had three different answers to "when does the couple see this".

**`published` is intent; `liveAt` is whether a Publish carried it out.** Keeping them separate is
the whole design, and it is what lets the console say *"three films and forty photographs will go
live when you publish"* rather than silently hiding them. A film sitting invisible with no
explanation was the risk in this decision, so the console answers it before it is asked.

**Withdrawal waits too.** Un-ticking a film hides it at the next Publish, not instantly, so a
takedown arrives with everything else. The first implementation got this wrong in an instructive
way: the guest filter checked `published && liveAt`, so un-ticking hid the film immediately — the
exact instant-effect the change exists to remove. The gate is `liveAt` alone now. `status` stays in
and is deliberately **not** symmetric: a film that has gone back to encoding would render a broken
player, and that is a fault rather than a change.

**The migration's backfill is its whole risk.** Without it every wedding already delivered goes
dark on deploy — every film and photograph would have a null `liveAt` and vanish from a page
somebody has already been given. What is live today is exactly `published = true` for films and
every photograph, so that is what 0012 marks, using `created_at` rather than `now()` so the column
reads as history instead of claiming every wedding was published the day it ran.

`tests/helpers/repository.ts` now defaults a film to live, matching the `published: true` beside
it — the helper describes a film on a published catalogue, which is what nearly every test means
by "a film". Tests about content *waiting* set `liveAt: null` explicitly, and two existing fixtures
did exactly that once the distinction existed.

Settings are N-57b, with one argument attached: `passcode`, `privacy` and `customDomain` should
**not** wait. They are access controls, and "your change goes out when you publish" is the wrong
answer to "that link reached the wrong family".

## N-29 · A studio picks its language once — 8 September 2026

`DEFAULT_LOCALE` was English for everyone and the only route to Hindi was a toggle in the corner of
the guest page. A Hindi-first studio in Jaipur therefore set up every wedding in English and hoped
the family found the switch, which is the wrong way round for the market this product is for.

**The whole feature rests on one distinction:** "the guest chose English" and "the guest chose
nothing" were the same value. `parseLocale` folded them together, so no catalogue could have a
default of its own. `parseLocaleOrNull` separates them; everything else is plumbing. `parseLocale`
is unchanged and still right for `app/layout.tsx`, which has no catalogue in scope.

**The catalogue carries a copy rather than reading through the org.** A studio that switches its
own default next year must not silently change the language of a wedding delivered last year — the
couple has that link, and the page is theirs.

**One helper, not seven edits.** Seven guest pages called `parseLocale(cookie)`; the fallback is a
rule about the product, and seven copies of a rule is seven chances for one to be the old rule.

The E2E test found something the unit tests could not: **the content rendered in Hindi inside
`<html lang="en">`.** The root layout sets that attribute from the cookie, because it is the only
place `<html>` exists and it cannot see a catalogue — which was right while the cookie was the only
input. A screen reader acts on that attribute, so the guest shell now corrects it from the locale it
actually rendered. The alternative was teaching the layout to resolve a tenant, which puts a
database read in front of every guest request to fix an attribute.

Proven by removing the inheritance: the Hindi studio's wedding opened in English.

The console is still English-only, and that is N-29b — every operator string across ~40 components,
none of which go through the dictionary. It is the half a Hindi-first studio spends its day in.

## N-29c · The studio picks the language per couple — 8 September 2026

N-29 gave a studio one language for its whole business. That was too coarse, and Sandeep named why:
the partner sells the product to the couple, so the partner is the one who knows which family reads
Hindi. A studio in Jaipur serves both in the same month.

The org's choice is now a **default a wedding starts from**, not a rule. The create wizard asks,
seeded from the studio; a wedding's settings can change it afterwards; and neither touches any
other wedding.

**In settings rather than in the customizer's branding panel**, which was the tempting home — it is
where a studio shapes the page, and language is presentation. But everything in that panel waits
for Publish, and putting one immediate control among them recreates exactly the confusion N-56
removed: *two save models in one screen means neither is learnable*. Settings are uniformly
immediate, so it goes there (D-31).

The console stays English-only, and that is now D-32 rather than a backlog item. N-29b is dropped
rather than deferred — different audiences with different economics. A console is used by a handful
of professionals who chose this tool; a wedding page is opened by two hundred relatives who did not.

Proven by removing the per-wedding override: both weddings came back Hindi.

## N-21 · Nobody is surprised by a wedding that stopped streaming — 8 September 2026

The handover email fires when a couple claims a catalogue, and a daily job queues the warning
ladder: **60 / 30 / 7 / 1 days before expiry, then 30 / 60 / 89 into grace.**

**The de-duplication is the feature, not a detail.** A cron re-derives the same milestone on every
run until the day passes, so without it a couple gets the thirty-day warning thirty times and
learns to ignore all of them — including the last one, which is the only one that could still be
acted on. Every message carries a key of `<template>:<catalogue>:<day>:<role>`, and 0014 puts a
**unique index** on it. That is deliberate: two overlapping runs both pass a read-then-write, and
the database is the only party here that can actually promise once. A 23505 comes back as "already
handled" rather than an error.

**The studio and the couple hear different things, and both hear.** Under studio-only (D-26)
billing never transfers, so the renewal is a decision only the studio can make — they are told
before handover and after it, because a studio that hears nothing about a wedding lapsing cannot
sell the renewal. The couple's copy says *contact your studio*; a couple who writes to us has been
sent to the wrong place by their own delivery email.

**Queueing and sending are separate jobs** because they fail for different reasons and at different
rates: deciding what is due reads the database, sending talks to a third party. A mailer outage
should delay delivery, not skip a milestone that never comes round again.

The ladder's arithmetic is exported and tested on its own — `milestoneFor(date, now)` — rather than
proved through a cron, a repository and a queue. It is also tested at 23:59, because a ladder
counted in days must not shift with the hour the cron happens to run.

89 rather than 90 into grace, deliberately: the last warning has to arrive while something can
still be done, and on day 90 it is a notice of a thing that has already happened.

Proven by removing the de-duplication: the same milestone queued twice.

## N-22 · Download everything, at any time — 8 September 2026

*"Nothing is ever deleted"* appears in the handover email, the FAQ and the pricing page. It was
worth nothing until now, because there was no way for a couple to get their films out. There is
one: `/c/<slug>/download`, reachable from every page of a wedding and from the renewal screen.

**It survives expiry, grace and archive**, which is the entire point. A lapse is a billing state
between us and a studio; the wedding is not ours to withhold. The gate is `publishedAt` rather than
`status` — an archived catalogue is not `published` any more, and its couple is exactly who this
exists for.

**The near-miss worth recording.** The obvious implementation reuses `resolveAccess` and accepts
`lapsed` alongside `ok`. That would have been a leak: `resolveAccess` returns `lapsed` **before**
it checks the passcode, which is right for a page whose lapsed state is a renewal screen with
nothing behind it — and would have handed a passcode-protected wedding to anyone with the link the
moment it expired. `resolveDownloadAccess` checks the passcode independently, and a test asserts
the lapsed-plus-passcode case specifically.

**A manifest of signed links, never a zip.** A 40 GB archive assembled inside a serverless function
is not a thing that works, and it would fail at precisely the moment a couple needed it.

**The landing page's claim was checked before relying on it.** `originals downloadable untouched`
is only true if Bunny keeps them, so the library was queried through the account API rather than
assumed: `KeepOriginalFiles: true`, `EnableMP4Fallback: true`. The provider still asks for the
resolution ladder and falls back to the highest rendition with a **label saying which** — a couple
handed a 720p file is told that is what it is, and a future operator turning that setting off
degrades the promise visibly rather than silently.

**Server-rendered with no client JavaScript.** A couple reaching this page is usually there because
something went wrong, which is the worst moment for a page that must boot before it can help.

One film failing does not empty the list: the manifest reports a count of what it could not reach
and hands over the rest. A test forced the provider to throw to prove it.

The test taught something too. `tests/setup.ts` loads `.env.local` so the integration suite finds
real credentials, and that file carries `VIDEO_DRIVER=bunny` — so a unit test that does not inject
a provider reaches Bunny over the network and reports every film unavailable. That is the correct
behaviour under a broken provider, which is exactly why it made a confusing failure.
