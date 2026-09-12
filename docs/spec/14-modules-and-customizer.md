# 14 — Modules & the Customizer

**This document describes the differentiator.** Everything else in the platform — video
hosting, streaming UI, tenancy — is replicable. The module system plus the operator-facing
customizer is what turns a bespoke, hand-coded gift site into a product a wedding company can
resell forty times a season without a developer.

Read this alongside `reference/reference-reel.mp4` and `reference/frames/`.

## 1. What the reference shows

The reel is a personal "COUPLEFLIX" site — a streaming-style micro-site built for one couple.
Extracted from it:

| Frame | Screen | What it tells us |
|---|---|---|
| f01 | **WHO'S WATCHING?** — letter-tile profiles | The profile gate is the hook, exactly as specced |
| f05 | Billboard: "FIRST DATE MAGIC", Play / More Info, rows below | Standard streaming browse |
| f09 | Row: "MEMORIES" with photo posters | Rows carry photos, not only video |
| f13 | Title modal with video playing + description panel | Detail modal over dimmed browse |
| f17 | Row: "TOP 5 HITS OF HEART LIST" | Row titles are *written copy*, not fixed labels |
| f19 | **MY LAST CRAZY NIGHT BUCKET LIST** — checklist | An interactive module, not video |
| f21 | **DATE NIGHT PLANNER** — randomiser | Another interactive module |
| — | **MEMORY VAULT** — photo grid | Photo gallery module |
| — | **A MESSAGE FOR YOU** — long-form letter | Letter module |

**The critical insight: the reference is not a video player with decoration. It is a
streaming *shell* wrapping a set of personal modules.** Video is one module among several.
Some of the most emotionally effective screens in the reel contain no video at all.

Two consequences for our spec:

1. Doc 01 called this a "video streaming platform". That is now understated. It is a
   **personalised streaming-style experience platform**, of which video is the anchor module.
2. Because the modules are the content, **the customizer is the product surface the operator
   actually spends time in** — and therefore where the moat is.

> Naming, briefly and for the last time: the reference is literally called COUPLEFLIX. That
> is the one element not to copy. Everything else in these frames is ours to build.

## 2. Why the customizer is the moat

Sites like the reference exist today as one-off builds — a developer friend, a Fiverr gig, an
Etsy template. Each takes hours and cannot be resold.

| | Bespoke build (today) | Heirloom Films with customizer |
|---|---|---|
| Time per couple | 6–20 hours of dev | 30 minutes of an operator's time |
| Who can produce it | A developer | A junior at a wedding company |
| Marginal cost | Labour | ~₹150 of hosting |
| Consistency | Varies per build | Guaranteed by the system |
| Resale | One-off | 40 a season, same effort |

A competitor can copy the streaming UI in a weekend. Copying a module system with a
non-technical customizer, safe theming, validated content and a working upload pipeline is
months — and by then the operational relationship with planners is what actually holds.

**Also: modules break the seasonality problem.** The same shell serves anniversaries,
proposals, birthdays and engagement parties — the reference reel is itself an anniversary
gift, not a wedding. Weddings cluster in Nov–Jan; anniversaries do not. Do not build the
other occasions in Phase 0, but do not architect them out: `catalogue.occasion` exists from
day one and the module registry is occasion-agnostic.

**A note on scale, because it changes what a "good" module is.** A catalogue holds 6–15 items
and 3–5 sections. Modules are therefore not containers for large collections — they are
*presentational set-pieces*. A module that only looks right with twenty items in it is the
wrong module. Design each one to be beautiful with three.

## 3. The module registry

Every section of a catalogue is a module instance. A catalogue is an **ordered list of
enabled module instances**, each with its own config. Nothing on the guest page is hardcoded.

```ts
type ModuleInstance = {
  id: string
  type: ModuleType
  enabled: boolean
  order: number
  title: LocalisedString        // the row/section heading — operator-written copy
  config: ModuleConfig          // discriminated union, Zod-validated per type
}
```

### Phase 0 modules

| Type | What it renders | Config | Why P0 |
|---|---|---|---|
| `billboard` | Hero: featured item, muted autoplay trailer or still, synopsis, Play / More Info | `featuredRef`, `useTrailer` | The first screen. Non-negotiable. |
| `curated_row` | Horizontal poster row of hand-picked titles, operator-written heading | `titleIds[]` (ordered) | **The anchor module.** Not auto-grouped by category — at 8–12 titles that produces six rows of one card. |
| `photo_row` | Horizontal row of photos, opens a lightbox | `albumId`, `layout` | From the reference at f09 |
| `letter` | Long-form personal message, typographic, slow reveal | `body`, `signature`, `theme` | Highest emotional payload per byte in the whole reel |
| `photo_grid` | "Memory Vault" — masonry gallery + lightbox | `albumId`, `columns` | Directly from the reference |

> **Cut from the original plan: `trending` and `new_releases`.** Both rank or filter across a
> library. Across eight items, Trending ranks the billboard first every time and New lists the
> whole catalogue. `continue_watching` drops to Phase 1 — most items are under five minutes
> and get finished. See doc 01 §5.1.

### Phase 1 modules

| Type | What it renders | Notes |
|---|---|---|
| `continue_watching` | Auto-computed resume row | Earns its place only because of the one long ceremony film |
| `timeline` | "Our Story" — dated milestones, vertical, image per entry | The narrative spine |
| `checklist` | "Bucket list" — tickable items, progress bar, persists per profile | f19 |
| `randomiser` | "Date Night Planner" — shuffle from a list, animated reveal | f21 |
| `people` | Cast & crew — family, wedding party, credits | |
| `quiz` | "How well do you know us" — light, shareable, scored | Strong forward-to-friends mechanic |
| `countdown` | To the wedding, or to an anniversary | Only module needing live time |
| `guestbook` | Guests leave a message; **moderated, operator-approved** | Do not ship unmoderated |
| `map` | Venues, travel, stay | Salvaged from the archived invite spec |

### Phase 2

`rsvp` (the archived invite work returns as a module, not a product), `music` (a shared
playlist), `download_pack`, `chapters`.

**Rule: a module never assumes another module exists.** `continue_watching` with no video
modules renders nothing rather than erroring. Every module handles its own empty state by
disappearing, not by showing a placeholder.

## 4. Module contract

Every module ships as a folder implementing one interface. This is what makes adding the
fifteenth module cheap.

```
modules/<type>/
  schema.ts      Zod config schema  → generates both the editor form and validation
  Guest.tsx      Server component rendering the guest view
  Editor.tsx     Client component rendering the operator's config form
  preview.ts     Static preview thumbnail for the "add module" picker
  meta.ts        { type, label, description, icon, occasions[], phase }
  index.ts       Registry export
```

```ts
export interface ModuleDefinition<C> {
  meta: ModuleMeta
  schema: z.ZodType<C>
  Guest: React.ComponentType<{ config: C; catalogue: Catalogue; locale: Locale; profileId?: string }>
  Editor: React.ComponentType<{ value: C; onChange: (c: C) => void; catalogue: Catalogue }>
  defaults: (catalogue: Catalogue) => C
}
```

Two optional hooks were added after Phase 0, both for the same reason — a surface outside
`modules/` needed to reason about a section without naming its type: `consumes` (which titles a
section shows, so later sections do not repeat them) and, on 12 September 2026, `prose` (the
section a couple may rewrite from their account, D-37 — `read`/`write` on the config, so the
couple's page finds "the letter" through the contract rather than by name).

Registration is a single `modules/registry.ts` map. **Adding a module must require zero
changes to the browse page, the customizer, the schema, or the admin.** If a new module
forces an edit outside its own folder, the abstraction has leaked — fix it before merging.

Generate the Editor form from the Zod schema wherever possible (a small `zod → form`
renderer covering string, localised string, number, boolean, enum, media-ref, and array).
Hand-written editors only where the config is genuinely spatial, like the timeline.

## 5. The customizer

Where the operator spends their 30 minutes. Two panes, live preview.

```
┌───────────────────────────────┬─────────────────────────────┐
│  SECTIONS            [+ Add]  │                             │
│  ┌─────────────────────────┐  │      LIVE PREVIEW           │
│  │ ⠿ Billboard        👁 ⚙ │  │   ┌───────────────────┐     │
│  │ ⠿ Continue Watching  👁 │  │   │                   │     │
│  │ ⠿ Highlights       👁 ⚙ │  │   │   guest view,     │     │
│  │ ⠿ Memory Vault     👁 ⚙ │  │   │   real data,      │     │
│  │ ⠿ A Message For You👁 ⚙ │  │   │   real theme      │     │
│  │ ⠿ Trending         👁    │  │   │                   │     │
│  └─────────────────────────┘  │   └───────────────────┘     │
│                               │   [ 📱 Mobile ] [ 💻 Desktop ]│
│  THEME                        │                             │
│  Accent  ● ● ● ● ●  [custom]  │   [Preview as guest]        │
│  Logo    [upload]             │   [Publish]                 │
└───────────────────────────────┴─────────────────────────────┘
```

Requirements:

1. **Drag to reorder**, keyboard-accessible (not mouse-only — an accessibility failure here
   is also a usability one on a trackpad).
2. **Toggle visibility** without deleting config, so an operator can hide a section and bring
   it back.
3. **Gear opens that module's Editor** in a side sheet; changes reflect in the preview within
   ~300ms, debounced.
4. **Preview is the real guest component tree**, not a mock. A mock will drift and the
   operator will publish something they never saw.
5. **Mobile preview is the default view**, because that is where guests are.
6. **Autosave as draft** every change; `Publish` is a separate, explicit action.
7. **Undo** the last 20 changes. Operators experiment; they must be able to get back.
8. **Templates**: "The Keepsake" (billboard + two curated rows + letter + photo grid),
   "Films Only", "Anniversary", "Proposal". A template is a preset list of module instances;
   the operator starts from one and edits. This is what makes 30 minutes achievable.
9. **Curation guidance, not just configuration.** The operator is a planner's junior, not a
   curator, and the difference between a keepsake and a folder with better fonts is entirely
   in the curation. Nudge them: warn past ~12 titles, flag a billboard several minutes long,
   flag a row holding a single card, flag a title with no poster art, flag a catalogue with
   no non-video module. Suggestions with a dismiss — never blockers.

### Theme customisation, safely

The operator gets: accent colour, logo, presented-by credit, display font from an approved
set, and a poster-art style. They do **not** get arbitrary CSS.

- Accent is validated for contrast against the near-black surface at pick time, in the UI,
  with a live warning — not as a build failure the operator never sees.
- Five curated presets plus a custom picker. Most operators will use a preset.
- Surface stays near-black across all themes. The cinematic base is the product identity and
  is not customer-configurable; letting a planner ship a pastel-yellow streaming site
  destroys the thing they are buying.

## 6. Data model additions

```sql
alter table catalogues
  add column occasion text not null default 'wedding'
    check (occasion in ('wedding','anniversary','proposal','birthday','engagement')),
  add column modules jsonb not null default '[]',   -- ModuleInstance[]
  add column draft_modules jsonb,                    -- unpublished edits
  add column template text;

create table albums (
  id           uuid primary key default gen_random_uuid(),
  catalogue_id uuid not null references catalogues(id) on delete cascade,
  name         jsonb not null,
  created_at   timestamptz not null default now()
);

create table photos (
  id         uuid primary key default gen_random_uuid(),
  album_id   uuid not null references albums(id) on delete cascade,
  url        text not null,
  lqip       text,
  caption    jsonb,
  width      int, height int,
  sort_order int not null default 0
);

-- Per-profile state for interactive modules (checklist ticks, quiz answers)
create table module_state (
  profile_id  uuid not null references profiles(id) on delete cascade,
  module_id   text not null,
  state       jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  primary key (profile_id, module_id)
);
```

`modules` as `jsonb` rather than a table: module instances are always read as a whole list
for one catalogue, never queried across catalogues, and their shape varies per type. A
polymorphic table would buy nothing and cost a join on the hottest read in the product.
`draft_modules` is what the customizer autosaves to; `Publish` copies it to `modules` and
revalidates ISR.

## 7. Acceptance criteria

- [ ] Adding a new module type requires changes **only** inside `modules/<type>/` plus one
      registry line.
- [ ] An operator reorders sections, sees the preview update, publishes, and the guest page
      matches the preview exactly.
- [ ] Toggling a module off hides it from guests and preserves its config.
- [ ] A catalogue built from the "Wedding — full" template is publishable in under 30
      minutes including uploads.
- [ ] Every module renders nothing — not a placeholder — when it has no content.
- [ ] Choosing a low-contrast accent warns in the customizer at pick time, before publish.
- [ ] The preview pane renders the real guest components; there is no second implementation.
- [ ] Guest-side interactive module state (checklist, quiz) persists per profile across
      sessions.
