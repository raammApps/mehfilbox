# Subsystem map — `themes-customizer` (theming, branding, house styles, the module registry, the customizer)

Mapped 16 September 2026 against the code on `main` (HEAD `96fb305`). Where a document and the
code disagree, the code is what is described above the line and the disagreement is named in §7.
Line numbers refer to the files as read on this date.

---

## 1. Summary

This subsystem is the whole visual-identity and page-composition layer of a Mehfilbox wedding: the
seven built-in **themes** (`themes/registry.ts`) plus any a platform admin has authored from
`/admin/platform/themes`; the **brand** a studio layers on top (accent, logo, display face,
"presented by", the platform-credit footer line); the **house styles** a studio saves so its
weddings look alike without re-choosing every time; the **module registry** — the one place a
"section" type is wired in — and the **customizer** at `/admin/c/<id>/customizer` where an
operator drags sections into order, edits each one, and watches the *real* guest component tree
update live before hitting Publish. A theme is nothing but a validated set of CSS custom
properties (`themes/contract.ts`); branding and the module list both live as a **draft** on the
catalogue row and are promoted to what guests see only by an explicit Publish
(`app/api/admin/catalogues/[id]/publish/route.ts`). Three actors touch it: a **platform admin**
who authors and retires themes (the only one who can create a *new* theme definition), a **studio
operator or couple** who picks among them, brands a wedding or the whole studio, saves styles, and
composes the page, and the **guest**, for whom the entire mechanism resolves to one `<style>` tag
and an ordered list of sections. A fourth, non-authenticated "actor" is the **developer or coding
agent** who adds a new module type by following `.claude/skills/add-module/SKILL.md`.

## 2. Actors

| Actor | How they appear in code | What they can reach |
|---|---|---|
| **Platform admin** | `requirePlatformAdmin()` (`lib/admin/platform.ts:40-44`); no `operators` row | `/admin/platform/themes` only. The only actor who can create, edit or withdraw a **stored** theme; every action is audited (`recordPlatformAction`, `platform_audit`). |
| **Studio operator** (org `kind='partner'`) | `requireOperator()` / `requireEditableCatalogue()` (`lib/admin/session.ts`) | Picks a theme + brand per wedding (`ThemePicker`, target `catalogue`), sets the studio's own default (`ThemePicker`, target `studio`), creates/edits/duplicates/deletes house styles, composes and publishes the module list. Never authors a theme — `/admin/platform/**` 404s for them. |
| **Studio operator inside a support window** | `getEditableCatalogue` → `via: 'support'` (`lib/admin/session.ts:100-112`) | Same customizer and branding panel on a handed-over wedding; the catalogue PATCH route accepts only `draftBranding` and `featuredTitleId` from this path (`app/api/admin/catalogues/[id]/route.ts:99`), not settings or house-style writes. |
| **Couple account** (org `kind='couple'`) | Same `operators` row shape; `CustomizerShell`'s `audience` prop flips to `'couple'` for `CreditPanel` copy only | Identical customizer and `ThemePicker` access on their own catalogue; house styles are a studio-only surface (`/admin/studio/styles` is unreachable from the couple's chrome, though the API itself only scopes by `orgId` and would serve an empty list). One module (`letter`) additionally exposes a from-account rewrite path via `ModuleDefinition.prose`, outside the customizer (`modules/contract.ts:111-114`) — noted here because it is the one guest-facing content edit that bypasses this subsystem entirely. |
| **Guest** | Not authenticated; the audience the whole subsystem renders for | Sees exactly one resolved theme (`resolveTheme`, `themes/resolve.ts:33-35`) as a `<style>` tag (`components/chrome/ThemeStyle.tsx`) and the published module list (`ModuleRenderer`). Cannot see a draft theme, a draft module list, or a withdrawn/disabled theme unless their wedding is already on it. |
| **Developer / coding agent** | No session; a `.claude/skills/add-module` invocation | Adds a module folder + one `modules/registry.ts` line. `tests/unit/registry.test.ts:123-157` fails the build if any other file names the new type. |

## 3. Capabilities

**The theme system**

- Seven built-in themes, each a full token set (surfaces, text, accent/ink, radii, faces, poster palette, card edge) — `themes/registry.ts:29-122`.
- Theme token contract, Zod-validated and `.strict()` (12 fields) — `themes/contract.ts:23-47`.
- Stored (platform-authored) theme schema — id/name/description/tokens/enabled/createdBy/timestamps — `themes/contract.ts:63-78`.
- Resolution: a branding's `theme` id → built-in ∪ stored, falling back to Marquee for absent/unknown/withdrawn ids so a repainted-away theme never breaks a page — `themes/registry.ts:154-160`.
- One CSS-emission function (`themeCss`) shared byte-for-byte between the guest page and the customizer's live preview — `themes/css.ts:35-96`.
- Ink-on-accent auto-selection (white vs near-black, whichever clears contrast) — `themes/css.ts:24-27`.
- Brand-accent override with a per-theme contrast fallback: an unreadable saved accent silently reverts to the theme's own at render time — `themes/css.ts:29-33`.
- Cached theme list (`unstable_cache`, tag `themes`, 1h) dropped on every save — `themes/resolve.ts:13-19,37-39`.
- Poster-art and profile-tile colours derive from the theme's `posterPalette`, never hardcoded — `themes/registry.ts:162-168`, `lib/poster.ts:78-85`.

**Contrast gate**

- WCAG relative-luminance/contrast primitives, one implementation for CI, the picker and tests — `lib/contrast.ts:10-44`.
- `judgeAccent` — an accent judged against the *chosen theme's* surface, not black, with operator-facing warning text — `lib/contrast.ts:69-94`.
- `judgeTheme` — seven token pairs a whole theme must clear (headings/body/small text on page and card, button text on accent, accent on page) — `lib/contrast.ts:107-128`.
- Server-side gate before a stored theme is written: `assertThemeReadable` throws a 400 naming every failing pair and its ratio — `lib/admin/themes.ts:13-23`.
- `pnpm check:contrast` (part of `pnpm verify`) re-derives the shipped palette from `app/globals.css` and walks every built-in theme through `judgeTheme`, plus a literal scan that fails the build if `#E50914` (the streaming incumbent's exact red) appears anywhere — `scripts/check-contrast.ts:19-23,28-45,51-55,73-82`.

**Platform theme authoring**

- `/admin/platform/themes`: built-in seven shown read-only "for reference and as starting points", stored ones editable — `app/admin/platform/themes/page.tsx:17-38`.
- `ThemeStudio`: a form over every token, live contrast verdict, a page-shaped specimen painted by the *same* `themeCss` a guest gets, "start from a built-in" — `components/admin/ThemeStudio.tsx:75-517` (form), `:524-613` (specimen).
- `POST /api/admin/platform/themes` — id may not shadow a built-in or an existing stored id, contrast-gated, audited (`theme.create`), revalidates the cached list — `app/api/admin/platform/themes/route.ts:30-63`.
- `PATCH /api/admin/platform/themes/:id` — partial update, re-gated, audited as `theme.update`/`theme.withdraw`/`theme.restore` depending on what changed; a built-in id answers `NOT_FOUND` here (it is code, not a row) — `app/api/admin/platform/themes/[id]/route.ts:28-58`.
- Withdrawing (`enabled:false`) hides a theme from every picker **and repaints nothing** — weddings already on it keep it. Editing a stored theme's tokens **does** repaint every wedding on it the moment it saves; the console warns above the Save button — `components/admin/ThemeStudio.tsx:253-258`, confirmed by `tests/unit/platform-themes.test.ts:135-147`.

**Branding (per-catalogue and per-studio)**

- One shared panel (`ThemePicker`) takes a `BrandingTarget` (`catalogue` or `studio`) rather than being copied, so the contrast gate cannot silently exist in only one place — `components/admin/ThemePicker.tsx:23-27,29-46`.
- Fields: theme (via `ThemeCards`), headline typeface (`TypefaceField` — three shipped faces or "the theme's own"), accent (`AccentField` — five curated presets + a colour input), "Presented by", Logo URL, "Made with Mehfilbox" toggle — `ThemePicker.tsx:180-315`.
- A wedding's branding is a **draft**: the panel autosaves `PATCH /api/admin/catalogues/:id { draftBranding }` on a 700ms debounce and only Publish promotes it — `ThemePicker.tsx:129-178`; the route accepts no other branding field (`app/api/admin/catalogues/[id]/route.ts:32-39`).
- The studio's own default is a **live setting**, not a draft: `PATCH /api/admin/studio { branding }` writes `orgs.branding` at once and only affects weddings created afterwards — `app/api/admin/studio/route.ts:26-37`, `components/admin/StudioBranding.tsx`.
- Brand accent is judged live against the *selected theme's* page, with the sample button rendered in the theme's own ink logic — `components/admin/AccentField.tsx:37-38,71-86`.
- Typeface choice is "the theme's own" (default, e.g. Classic's serif) or one of three shipped faces; a studio cannot force `serif` as an override — it is reachable only as a theme's own default — `components/admin/TypefaceField.tsx:9-45`, `themes/contract.ts:16`.

**House styles**

- Named presets bundling theme + layout + branding + locale + guest-code-on, one marked default — `lib/schema.ts:232-247`.
- Create from a blank form, from a **published** catalogue's current look (`presetFromCatalogue`), or as a duplicate — `app/api/admin/presets/route.ts:34-66`, `lib/admin/presets.ts:41-59`.
- A style referenced by a published catalogue is **frozen**: its look fields (`templateId`, `branding`, `locale`, `passcodeOn`) refuse to change with a count and a "Duplicate and edit" way out; rename and default-flag always pass — `app/api/admin/presets/[id]/route.ts:23-56`, `lib/admin/presets.ts:71`.
- `HouseStyleEditor` disables every look `<fieldset>` when frozen and surfaces the same message inline — `components/admin/HouseStyleEditor.tsx:125-147,172-290`.
- List view shows a frozen-count badge per style, computed per row — `app/admin/studio/styles/page.tsx:28-30,90-94`.

**Module registry and contract**

- One `REGISTRY` object; nothing outside `modules/` may switch on a module type — `modules/registry.ts:20-33`, enforced structurally by `tests/unit/registry.test.ts:123-157` (a source-text scan over `app/`, `components/`, `lib/`).
- Contract: `meta` (type/label/icon/occasions/phase/content/shape/singleton), `schema`, `Guest`, `Editor`, `defaults`, optional `advise`/`consumes`/`prose` — `modules/contract.ts:16-115`.
- `content` ('video'|'photo'|'text') and `shape` ('hero'|'row'|'grid'|'prose') let callers (the wizard's template thumbnails, catalogue-level advisories) reason about a section without naming its type — `modules/contract.ts:29-39`.
- `resolveInstances` renders nothing and logs, never throws, for an unknown type or a config that fails its own schema — `modules/registry.ts:61-87`.
- Every module's `Editor` is dynamically imported (`dynamic(() => import('./Editor'))`) because `registry.ts` is imported by the guest page — a static Editor import once shipped the admin's form fields to every phone, caught by `check:bundle` — `modules/billboard/index.ts:33` and the comment at `modules/contract.ts` above.
- `instantiate()` builds a fresh instance from a module's own `defaults()` when a section is added — `modules/registry.ts:99-117`.

**The customizer**

- Section list: pointer **and** keyboard drag (`@dnd-kit`), arrow buttons, hide/show without losing config, remove, an Add menu that hides an already-placed singleton — `components/admin/CustomizerShell.tsx:173-238,344-371,650-696`.
- Undo/redo, 20 deep each, cleared forward by any new edit — `CustomizerShell.tsx:106-149`.
- Every mutation funnels through one `commit()` so undo and autosave cannot be bypassed — `CustomizerShell.tsx:110-119`.
- Autosave to `draft_modules`, 800ms debounced, unknown-type/invalid-config refused with per-index field errors — `CustomizerShell.tsx:151-171`, `app/api/admin/catalogues/[id]/modules/route.ts:23-58`.
- Curation advisories: per-module `advise()` hooks plus catalogue-level heuristics (all-video page, films with no poster, over 12 titles), de-duplicated, dismissible, never blocking — `CustomizerShell.tsx:724-765`, example hook at `modules/billboard/index.ts:46-69`.
- "Guests are seeing exactly this / still seeing the last published version / not published yet", plus a named count of films and photographs waiting on the next Publish — `CustomizerShell.tsx:439-468`.
- A catalogue with no module history yet is seeded from its template against real titles/albums rather than opening empty — `app/admin/c/[id]/customizer/page.tsx:33-39`, `lib/admin/templates.ts:22-70`.

**Live preview (doc 14 §5.4's mandate)**

- Renders the **real guest component tree** — `CatalogueShell` / `ModuleRenderer` — against draft state, not a mock; this is why the guest tree is a client component at all (CLAUDE.md deviation 1) — `components/admin/PreviewPane.tsx:84-91`, `components/streaming/CatalogueShell.tsx:35-44`.
- Mobile (390×780) / Desktop toggle, mobile the default because that is where guests are — `PreviewPane.tsx:328-345,395-421`.
- The frame is painted in the *chosen* theme's own surface colour, not a fixed black, and carries its own scoped `<ThemeStyle>` so it cannot repaint the admin chrome around it — `PreviewPane.tsx:347-363`, `components/chrome/ThemeStyle.tsx:18-33`.
- Click-to-select: any section **or the chrome** (nav/footer/"Presented by") opens its editor; chrome selection routes to the branding panel via a sentinel id — `PreviewPane.tsx:18,302-326`.
- In-place heading editing, committed on blur (never per keystroke, to avoid dropping the caret) — `PreviewPane.tsx:143-195`.
- In-place drag-to-reorder via native HTML5 drag, delegated at the viewport so the guest markup itself is never touched — `PreviewPane.tsx:197-286`.
- Selection/hover/drag outlines are scoped CSS keyed to `data-module-id`, not props threaded into guest components — `PreviewPane.tsx:433-472`.

**Publish**

- Flushes both drafts (`modules`, then `draftBranding`) before promoting, and checks **both** responses — a 2025-era bug class this subsystem specifically guards against in comments — `CustomizerShell.tsx:240-314`.
- `POST …/publish`: first publish spends a credit (402 `CREDIT_REQUIRED` if none), then promotes `draft_modules→modules` and `draft_branding→branding` atomically, clears both drafts, revalidates ISR — `app/api/admin/catalogues/[id]/publish/route.ts:18-79`.
- `DELETE …/publish` (unpublish): `status→'draft'`; `published_at` is kept so a republish is free — `publish/route.ts:83-91`.

**Tooling and enforcement**

- `no-restricted-syntax`/`tsc --strict`/registry/i18n/contrast checks all run under `pnpm verify`, the repo's single pre-commit gate — `package.json:24`.
- `.design-sync/`: a one-way, **manually triggered** extraction of `app/globals.css`'s base tokens (the Marquee-shaped defaults, not the seven-theme system) into a `ds-bundle/` for an external design tool — `.design-sync/build-tokens.mjs`, `.design-sync/config.json`. Not wired into `pnpm verify`, `package.json`, or any CI workflow (verified: no reference to `build-tokens` or `ds-bundle` anywhere outside `.design-sync/`).

## 4. Workflows

### W1 · Platform admin authors a theme

| # | Step | Where | Data written | Failure modes (what the admin sees) |
|---|---|---|---|---|
| 1 | Open `/admin/platform/themes`; not a platform admin → `notFound()` | `app/admin/platform/themes/page.tsx:17-19` | — | A 404 indistinguishable from a non-existent route. |
| 2 | Click "Start from this" on a built-in, or edit an existing stored one | `components/admin/ThemeStudio.tsx:95-103,236-243` | — | — |
| 3 | Type name (auto-slugs the id until touched), edit colours (swatch or hex, live), scheme, card edge, corner radii, faces, poster palette | `ThemeStudio.tsx:269-470` | — | Hex text that does not parse is held apart from the token and simply not applied — no error shown until blur clears it. |
| 4 | Watch the contrast verdict and the page-shaped specimen update on every keystroke | `ThemeStudio.tsx:474-484,512` (verdict), `:524-613` (specimen) | — | Save button is `disabled` while any pair fails, or while name/id are empty — `:495`. |
| 5 | `POST /api/admin/platform/themes` | `app/api/admin/platform/themes/route.ts:30-63` | `themes` row: `id, name, description, tokens, enabled=true, created_by=admin.email, created_at, updated_at` | Id shadows a built-in → 400 "That id belongs to a built-in theme". Id already stored → 400 "A theme with that id already exists". A failing pair → 400 naming each pair and its ratio (`lib/admin/themes.ts:16-21`), shown per-field in the form (`ThemeStudio.tsx:300-306`). |
| 6 | On success | `route.ts:53-62` | `platform_audit` row, `action='theme.create'` | `revalidateThemes()` drops the cached list — every studio's picker and every guest resolver has it on the next request. Mode flips to "edit"; `router.refresh()`. |

### W2 · Platform admin edits, withdraws or restores a theme

1. From the theme's row, "Edit" loads its current tokens into the same form (`ThemeStudio.tsx:196-201`); "Withdraw"/"Restore" is a one-click `PATCH { enabled }` with no form (`:149-161,203-209`).
2. Editing shows an inline warning above Save: "Saving repaints every wedding on this theme. Withdraw it instead if that is not what you mean." (`:253-258`).
3. `PATCH /api/admin/platform/themes/:id` — re-validated and re-contrast-gated exactly as creation; a built-in id 404s ("Built-in themes are changed in code, not here") — `app/api/admin/platform/themes/[id]/route.ts:28-58`.
4. Effect on live weddings: **withdrawing hides the theme from every `ThemeCards` picker and changes nothing already rendering it** (`themeFrom` still resolves it because `allThemes()` includes disabled ones — `themes/registry.ts:154-160,21-25`). **Editing tokens repaints every wedding on that theme the next time its page is requested**, because there is no snapshot — a catalogue stores only the theme's *id*, never a copy of its tokens. Audited as `theme.withdraw` / `theme.restore` / `theme.update` — `route.ts:47-52`.
5. Failure: same contrast/id validation as W1; `tests/unit/platform-themes.test.ts:135-147` is the executable spec of point 4.

### W3 · Studio brands one wedding and publishes

1. `/admin/c/<id>/customizer` → click the "Branding" row in the section list (`CustomizerShell.tsx:405-419`) → `ThemePicker` with `target={{kind:'catalogue', catalogueId}}` renders in the inspector column.
2. Pick a theme (`ThemeCards`, enabled ones plus whatever this branding is already on) → typeface → accent (contrast verdict against *that* theme) → "Presented by" → Logo URL → platform-credit toggle. Every change also calls `onPreview` so the live preview updates before any save round-trip (`ThemePicker.tsx:116-127,325-330`).
3. 700ms after the last change: `PATCH /api/admin/catalogues/:id { draftBranding }` — `ThemePicker.tsx:129-178`. Writes `catalogues.draft_branding`. Status line: "Saved as draft" / "Not saved…".
4. Click Publish → `CustomizerShell` flushes `PUT …/modules` and `PATCH …{draftBranding}` first, checks both responses, then `POST …/publish` — `CustomizerShell.tsx:240-297`. Writes `catalogues.branding ← draft_branding`, `draft_branding=null`, plus the module promotion (see W9).
5. Failure modes: either flush fails → "Your changes could not be saved, so nothing was published." (no publish attempted). No credit on a first publish → `CreditPanel` (`CREDIT_REQUIRED`, 402). Suspended studio → the publish 403 surfaces as the same publish-error banner. A theme later withdrawn does not affect this wedding (W2); a theme later *edited* repaints it silently — nothing on this screen would tell the operator that happened after the fact.

### W4 · Studio sets its own default look

1. `/admin/studio` → `StudioBranding` = `ThemePicker` with `target:{kind:'studio'}`, seeded from `org.branding` — `app/admin/studio/page.tsx:47`, `components/admin/StudioBranding.tsx:14-28`.
2. Every change autosaves `PATCH /api/admin/studio { branding }` (the **whole** object — an omitted field clears it) — `app/api/admin/studio/route.ts:26-37`.
3. Writes `orgs.branding`. Takes effect immediately as a setting, but repaints nothing already delivered — only weddings *created after* this point inherit it, via the merge in W6.
4. Failure: a network/API error leaves the panel on "Not saved — your change is still here" (`SaveState`); no field-level validation beyond what `ThemePicker` already enforces (accent hex, url() for the logo).

### W5 · Studio manages house styles

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | `/admin/studio/styles` — list, each row a swatch + theme/layout/locale/code summary + frozen badge | `app/admin/studio/styles/page.tsx:20-118` | — | — |
| 2a | "New house style" → `/admin/studio/styles/new` (`id==='new'` convention, no row fetched) | `app/admin/studio/styles/[id]/page.tsx:11-26` | — | — |
| 2b | Or capture a **published** wedding's current look from its overview ("Keep this look") | `lib/admin/presets.ts:41-59` | — | Uses the *live* `branding`/`template`/`locale`, never the draft. |
| 2c | Or "Duplicate" an existing style | `app/api/admin/presets/route.ts:47-57` | new `presets` row, values copied, new id | — |
| 3 | Fill name, default flag, theme (`ThemeCards`), layout (`TEMPLATES`), typeface, accent, presented-by, logo, platform-credit, language, guest-code-on | `components/admin/HouseStyleEditor.tsx:123-290` | — | Submit disabled until a name is typed. |
| 4 | `POST /api/admin/presets` (new) or `PATCH /api/admin/presets/:id` (edit) | `app/api/admin/presets/route.ts:34-66`, `[id]/route.ts:31-56` | `presets` row: `id, org_id, name, is_default, template_id, branding, locale, passcode_on, created_at, updated_at` | Unknown `templateId` → "Unknown layout". Unknown `branding.theme` → "Unknown theme" (`assertThemeExists`, `lib/admin/presets.ts:23-31`). A style referenced by ≥1 published catalogue and any look field changed → 409 `FROZEN`, count named, form fields disabled, "Duplicate and edit" offered instead (`[id]/route.ts:41-46`, `HouseStyleEditor.tsx:125-146`). |
| 5 | Delete | `[id]/route.ts:58-73` | row removed | Frozen (in use) → same 409 as an edit. |

### W6 · A wedding is created — where its starting theme and brand come from

1. Wizard step 2 offers the studio's saved styles (default preselected) **or** "Choose myself" → `ThemeCards` (built-ins + stored, enabled-or-current) + one of four layouts — `components/admin/CreateWizard.tsx:447-595`.
2. Choosing a style sends `presetId`; choosing manually sends `template` + `branding:{theme}` — `CreateWizard.tsx:213`.
3. `POST /api/admin/catalogues` merges, in this exact order, **org branding, then the chosen preset's branding, then anything typed in the wizard body** — `app/api/admin/catalogues/route.ts:118-120`: `{ ...(org?.branding ?? {}), ...(preset?.branding ?? {}), ...body.branding }`. Writes `catalogues.branding` directly (not `draft_branding` — nothing is published yet, so there is no guest to protect) and `catalogues.preset_id`.
4. A theme id a studio's wizard, a house style, or a raw API call names that does not exist among `allThemes()` is only checked when going through the **preset** path (`assertThemeExists`) — a raw `branding.theme` typed straight into the wizard's body is validated only by `brandingSchema`'s `z.string().max(40)`, i.e. **any string up to 40 characters is accepted at catalogue-creation time**, and would simply fall back to Marquee at render (`themeFrom`'s unknown-id fallback, `themes/registry.ts:158-159`) rather than erroring. See §7.
5. First visit to the customizer seeds `draft_modules` from the chosen template if the catalogue has no module history yet — `app/admin/c/[id]/customizer/page.tsx:33-39`.

### W7 · Compose the page (sections)

1. Add → `AddSectionMenu` lists phase-0 modules, omitting a singleton (e.g. `billboard`) already placed — `CustomizerShell.tsx:650-696`; `instantiate()` builds it from the module's own `defaults()` — `modules/registry.ts:99-117`.
2. Reorder → drag (`@dnd-kit`, pointer + keyboard) or the ↑/↓ buttons, both call `commit(arrayMove(...))` — `CustomizerShell.tsx:180-238`.
3. Hide/show → toggles `enabled` without touching `config`, so a hidden section's settings survive — `:387-393`.
4. Edit → gear opens `SectionInspector`: localised heading (en/hi) plus the module's own `Editor` — `components/admin/SectionInspector.tsx:18-56`.
5. Remove → filters the instance out — `CustomizerShell.tsx:396`.
6. Every one of the above autosaves the whole array to `draft_modules` 800ms later — `:151-171`. Failure: an instance whose type is unknown or whose config fails its own schema → 400 `{ fields: { 'modules.<i>.type|config': '…' } }`, surfaced as "Not saved" (`app/api/admin/catalogues/[id]/modules/route.ts:30-47`).
7. Undo/Redo buttons walk the 20-deep stacks; any of the above clears the redo stack — `:106-149,349-362`.

### W8 · Edit directly inside the live preview

1. Click any rendered section → selects it in the inspector (same `editingId` state the list uses) — `PreviewPane.tsx:302-326`; click the nav, footer or "Presented by" line → opens the Branding panel via the `__branding__` sentinel — `PreviewPane.tsx:18,320-325`.
2. With a section selected, its first `h1`/`h2` becomes `contentEditable`; typing touches only the DOM, and the change is committed to `modules` **on blur** — `PreviewPane.tsx:154-195`.
3. Drag a section by its rendered body to reorder — native HTML5 DnD delegated at the preview's root, images/links inside made undraggable so they do not hijack the gesture — `PreviewPane.tsx:210-286`.
4. Both paths call back into `CustomizerShell`'s `editHeading`/`reorderByIds`, which go through the same `commit`/undo path as the section list — `CustomizerShell.tsx:198-231`. There is no separate save model for the preview; it is a second way to trigger the same autosave.
5. Failure/limits: keyboard-only reordering remains the list's job — the preview's drag is additive, not a replacement, so a screen-reader or keyboard-only operator still has a fully accessible path (`PreviewPane.tsx:44-49`).

### W9 · Publish (draft → live) and Unpublish

| # | Step | Where | Data written | Failure modes |
|---|---|---|---|---|
| 1 | Click Publish / Publish changes | `CustomizerShell.tsx:240-314` | — | Disabled once published with nothing pending. |
| 2 | Flush `PUT …/modules`, `PATCH …{draftBranding}` | `:246-268` | `draft_modules`, `draft_branding` | Either non-OK → "Your changes could not be saved, so nothing was published." — publish is never attempted. |
| 3 | `POST …/publish` — credit check only when `published_at IS NULL` | `publish/route.ts:32-41` | `credits.consumed_by_catalogue_id/consumed_at` | No credit → 402 `CREDIT_REQUIRED` → `CreditPanel`. |
| 4 | Promote | `publish/route.ts:43-57` | `catalogues.modules ← draft_modules`, `branding ← draft_branding`, both drafts `→null`, `status='published'`, `published_at` (first time only) | — |
| 5 | Content follows | `publish/route.ts:67-70` | `titles.live_at`, `photos.live_at` for anything ticked | — |
| 6 | Revalidate + confirm | `publish/route.ts:74-78` (note: `revalidateCatalogue(published.slug)` is called twice in sequence, lines 74 and 77 — harmless but redundant, see §7) | — | Console flips to "Guests are seeing exactly this." |
| 7 | Unpublish | `CatalogueSettings.tsx` → `DELETE …/publish` (`publish/route.ts:83-91`) | `status='draft'` (`published_at` kept) | Guests get the neutral "not yet available" screen, never a 404. |

### W10 · Guest opens the page

1. Address resolves to a catalogue (`resolveAccess`, out of this subsystem's scope) → `app/c/[slug]/page.tsx:71-92`. Draft/missing → `<NotAvailable>`, which renders **no** `<ThemeStyle>` at all — a not-yet-published wedding shows only the app's base CSS, never a studio's chosen theme (`page.tsx:141-153`).
2. On an `ok` verdict: `const theme = await resolveTheme(catalogue.branding)` — custom-theme-aware, cached — `page.tsx:117`, `themes/resolve.ts:33-35`.
3. `<ThemeStyle branding={catalogue.branding} theme={theme} />` emits one `<style data-tenant-theme="<id>">` at `:root` — `page.tsx:121`, `components/chrome/ThemeStyle.tsx:18-33`.
4. `<CatalogueShell modules={effectiveModules(catalogue,false)} palette={theme.tokens.posterPalette} …/>` — always the **published** `modules` for a guest, never a draft (`effectiveModules(catalogue,false)`, `lib/db/repository.ts:401-404`) — `page.tsx:122-136`.
5. `ModuleRenderer` walks the resolved list, skipping unknown types and invalid configs silently (server-logged only) — `components/streaming/ModuleRenderer.tsx:24-70`.
6. The same `resolveTheme`/`ThemeStyle` pair runs on every other guest-facing screen — locked, premiere, renew, download, watch — so a locked or lapsed wedding still carries its studio's brand (`app/c/[slug]/locked/page.tsx:32`, `premiere/page.tsx:34`, `renew/page.tsx:32`, `download/page.tsx:41`, `watch/[titleSlug]/page.tsx:56,60`).
7. Failure modes for the guest: none specific to theming — a theme id that resolves to nothing renders Marquee rather than erroring (`themes/registry.ts:158-159`); a module that fails to parse simply is not on the page.

### W11 · A developer adds a new module type (the `add-module` skill)

1. Create `modules/<name>/{schema.ts,Guest.tsx,Editor.tsx,index.ts}` — schema fields all `.default()`ed because configs come off a `jsonb` column (`.claude/skills/add-module/SKILL.md`).
2. `index.ts` calls `defineModule({ meta, schema, Guest, Editor: dynamic(() => import('./Editor')), defaults, consumes?, advise? })` — the `Editor` **must** be lazy or `check:bundle` fails, because `registry.ts` is imported by the guest page (see billboard's own `modules/billboard/index.ts:33`).
3. One import + one line in `modules/registry.ts`'s `REGISTRY` object — nothing else in the codebase changes.
4. `meta.content`/`meta.shape` let the wizard's template thumbnails and the customizer's catalogue-level advisories reason about the new section without a type-name switch anywhere outside `modules/`.
5. Verification: `tests/unit/registry.test.ts:123-157` fails the build if any file outside `modules/`, `lib/admin/templates.ts`, or `lib/db/seed-data.ts` contains the new type as a string literal; `tests/unit/i18n.test.ts` fails if a new English key has no Hindi entry; `pnpm verify` then `pnpm check:bundle`.
6. Failure modes a developer hits: forgetting the lazy `Editor` import — bundle-size check fails, not a runtime error; a module with nothing to render must return `null` from `Guest` rather than a heading over an empty strip (skill convention, not machine-enforced); an `advise()` that assumes another module exists is a design smell the skill calls out but nothing type-checks against.

## 5. Data model touched

| Table / column | Added by | Notes |
|---|---|---|
| `themes` (`id` PK text, `name`, `description`, `tokens jsonb`, `enabled bool default true`, `created_by`, `created_at`, `updated_at`) | `supabase/migrations/0019_themes.sql:9-19` | RLS enabled, `revoke all … from anon` (`:21-22`) — every read goes through the app's service-role repository, never the browser. |
| `presets` (`id` PK uuid, `org_id` FK→orgs, `name`, `is_default`, `template_id`, `branding jsonb`, `locale`, `passcode_on`, `created_at`, `updated_at`) | `supabase/migrations/0020_presets.sql:9-20` | Indexed on `org_id` (`:22`); RLS + `revoke … from anon` (`:24-25`). |
| `catalogues.preset_id` (uuid, FK→presets, `on delete set null`) | `0020_presets.sql:28-29` | A *record* of what a wedding was made from, not a live link — kept even if the style is later deleted. |
| `catalogues.branding` (jsonb, default `{}`) | `supabase/migrations/0001_initial_schema.sql:50` | Live, guest-visible branding: `accent`, `logoUrl`, `presentedBy`, `displayFont`, `platformCredit`, `theme` — `lib/schema.ts:141-160`. |
| `catalogues.modules` / `draft_modules` (jsonb) | `0001_initial_schema.sql:55-56` | `ModuleInstance[]` — `id, type, enabled, order, title (localised), config` — `lib/schema.ts:169-177`. |
| `catalogues.draft_branding` (jsonb, nullable) | `supabase/migrations/0011_draft_branding.sql:9` | Added later than `draft_modules` — branding used to write live and repainted a couple's page mid-edit until this migration (N-56). |
| `catalogues.template` (text, nullable) | `0001_initial_schema.sql:57` | Layout id from `lib/admin/templates.ts`, not itself part of the theme system but what a house style also freezes. |
| `orgs.branding` (jsonb, default `{}`) | `0001_initial_schema.sql:16` | The studio's own default look; same `brandingSchema` shape as a catalogue's. |
| `platform_audit` | pre-existing (N-27) | `theme.create` / `theme.update` / `theme.withdraw` / `theme.restore` rows, `detail:{id, name|changed}` — `app/api/admin/platform/themes/route.ts:53-57`, `[id]/route.ts:47-52`. |

All three `Repository` implementations (`memory-repository.ts`, `file-repository.ts` — which is `MemoryRepository` plus a debounced JSON file, `file-repository.ts:15-25` — and `supabase-repository.ts`) expose the identical `listPresets/getPreset/savePreset/deletePreset/countPublishedCataloguesOnPreset` and `listCustomThemes/getCustomTheme/saveCustomTheme` surface — `lib/db/repository.ts:158-169`, Supabase's at `lib/db/supabase-repository.ts:854-891,1144-1189`. This is CLAUDE.md's second deliberate deviation (the `Repository` seam) applied to themes and house styles specifically.

## 6. Configuration

| Variable | Effect on this subsystem |
|---|---|
| `DATA_DRIVER` (`memory`\|`file`\|`supabase`, `lib/env.ts:48`) | Which `Repository` backs `themes`/`presets`/`catalogues`. Behaviour is identical across all three by contract (`tests/unit/*` run against the in-memory driver); production runs `supabase`. |
| — | No env var gates the platform theme-authoring UI or API — access is entirely `platform_admins` row membership (`lib/admin/platform.ts:28-44`), checked per request, not a feature flag. |
| — | No env var affects which built-in themes ship — they are a literal array in `themes/registry.ts`, changed only by editing code and redeploying. |
| — | `.design-sync/build-tokens.mjs` reads only `app/globals.css` and `process.cwd()`; nothing in `lib/env.ts` touches it, and it is not invoked by any `package.json` script or CI workflow. |

## 7. Gaps and rough edges

- **The theme *marketplace* is entirely unbuilt, and the product doc says so in detail.** `docs/PRODUCT.md:180-221` (§6) is explicit: the *picking* half exists (seven built-ins, platform-authored ones, per-wedding and per-studio branding, house styles) but nothing about **selling** one does. Concretely absent from the code, confirmed by this read: no `owner`/`author_org_id` on a theme (every stored theme is platform-global — `themes` has no tenant column at all, `supabase/migrations/0019_themes.sql:9-19`); no price, plan, or SKU on a theme; no entitlement check anywhere a theme is applied (`themeFrom`/`resolveTheme` never consult `lib/entitlements.ts`); no purchase flow (the only "purchase" concept in the codebase is a publish **credit**, unrelated to themes — `lib/schema.ts:232-260`); no "preview before you own it" distinct from the customizer's always-open preview, because nothing is ever locked; no versioning of a theme (editing one repaints every wedding on it immediately — see W2 — there is no "keep the old version" option); no third-party author role (only `platform_admins` can write to `themes`, and there is no submission/review queue). `docs/PRODUCT.md:206-213` names the five product decisions (who authors, what a theme may change, who buys, one-off vs subscription, what happens on update/withdrawal) as unresolved; point 5 is *partially* answered by the code today (withdrawal doesn't repaint, an edit does) but only for the single-tenant "platform authors, everyone shares" model that exists now — the marketplace framing (a *purchased*, versioned, possibly third-party theme) answers none of it. `docs/PRODUCT.md:217-221` and `docs/ROADMAP.md:104` both conclude the honest next step is *more templates + reusable branding presets* (i.e., what house styles already are, per `docs/PROGRESS.md:1562`), not a marketplace, "until a third party asks to publish into it."
- **Doc 14 §5's "Theme customisation, safely" is stale and would mislead an agent who reads only what doc 13 §2 points to.** `docs/spec/14-modules-and-customizer.md:206-217` still says the near-black surface "is not customer-configurable" and lists only accent/logo/presented-by/face/poster-style as changeable — the entire premise D-35 overturned (`docs/reference/00-decision-log.md:593-607`, "Was: … is not customer-configurable. Decided: a theme is a validated token set … chosen per catalogue"). Doc 16 §4 (`docs/spec/16-platform-v2.md:175-229`) is the current truth and the code matches it. The problem: `docs/spec/13-agent-runbook.md`'s whole per-ticket reading map (§2) is Phase-0-era and **never mentions doc 16 anywhere** (`grep "doc 16" docs/spec/13-agent-runbook.md` — zero hits) — a ticket like "P0-22–26 Customizer" still routes a reader to "14 §5 §7" alone. CLAUDE.md's own instruction ("Read doc 13 §2 for the per-ticket reading map… never load the whole doc set") means an agent following the house rules exactly, on a *new* theme-shaped ticket, has no signposted reason to open doc 16 at all.
- **Doc 14 §5 also names a template the code never built.** Its list of customizer templates (`docs/spec/14-modules-and-customizer.md:197-198`) is `"The Keepsake"`, `"Films Only"`, `"Anniversary"`, `"Proposal"`. `lib/admin/templates.ts:23-70`'s actual `TEMPLATES` are `keepsake` / `films-only` / `anniversary` / `blank` — `blank` (an intentional empty layout, added per doc 16 §10) replaced `Proposal`, which does not exist anywhere in code.
- **Doc 16 §4/§5's own inventory doesn't quite match what's stored.** Doc 16 says themes are "listed through the same `listThemes()`" (`docs/spec/16-platform-v2.md:223`); the code's functions are `allThemes()`/`availableThemes()` (`themes/resolve.ts:22,28`) — no `listThemes` exists. Doc 16 §5 lists a house style's contents as "theme · layout · branding … · language · whether a guest code is on · **poster palette**" (`:237-238`, repeated in `docs/reference/00-decision-log.md:611`) as if poster palette were an independent field of a style; in the schema it is not stored at all — it is entirely derived from whichever theme the style's `branding.theme` names (`presetSchema`, `lib/schema.ts:232-247`; `posterPaletteOf`, `themes/registry.ts:162-168`). Cosmetic, but a reader implementing "let a studio override the poster palette independent of the theme" from the doc's wording would be building a field that doesn't exist.
- **A raw `branding.theme` is under-validated on the one path that bypasses house styles.** Creating a wedding "Choose myself" sends `body.branding` straight through `brandingSchema` (`app/api/admin/catalogues/route.ts:120`), whose `theme` field is only `z.string().max(40)` (`lib/schema.ts:158`) — no existence check. `assertThemeExists` (`lib/admin/presets.ts:23-31`) is only called from the **preset** create/update routes, never from `POST /api/admin/catalogues` itself. In practice the UI only ever sends an id from `ThemeCards`, so this is unreachable through the console — but the API itself would accept, store, and silently fall back to Marquee for any 40-character string, with no error surfaced anywhere (see W6 step 4).
- **`.design-sync/` ships the wrong palette for the thing it's supposed to represent, and has never actually shipped.** It extracts only `app/globals.css`'s base tokens — the Marquee-shaped defaults — into `ds-bundle/` (`.design-sync/build-tokens.mjs`), with no awareness that six other built-in themes and any platform-authored ones exist; a designer working from the synced bundle would be designing against one-eighth of the product's actual visual range. Per its own notes, the upload has never completed: `.design-sync/NOTES.md:47-53` — "**The upload never happened.** `DesignSync` needs design-system authorization, which cannot be granted from a non-interactive session," and no `projectId` is pinned in `.design-sync/config.json` beyond a placeholder created on the next run. `ds-bundle/` exists locally (verified: `ds-bundle/{README.md,_ds_bundle.css,fonts,styles.css,tokens}` present on disk) but is gitignored (`.gitignore:39`) and wired into no `package.json` script or CI workflow — it is a manual, one-person, not-yet-completed process.
- **A harmless duplicate revalidation call in the publish route.** `revalidateCatalogue(published.slug)` is called twice in immediate succession with only a `log.info` between them — `app/api/admin/catalogues/[id]/publish/route.ts:74` and `:77`. Not a correctness bug (the function is idempotent), but dead repetition in the one route this subsystem's whole "what guests see" guarantee runs through.
- **Editing a shared theme's tokens is instant and blast-radius-unlimited, with only a sentence of warning.** There is no "how many weddings are on this theme" count shown before Save (contrast with house styles, which *do* show a frozen count before refusing an edit — `app/api/admin/presets/[id]/route.ts:41-48`). `ThemeStudio.tsx:253-258` shows static warning text regardless of whether the theme is on zero weddings or two thousand.
- **No usage/impact view for a stored theme.** The platform console's Themes page lists custom themes with a swatch and an enable toggle (`components/admin/ThemeStudio.tsx:163-246`) but nothing shows *which* studios or catalogues reference a given theme id — an admin withdrawing or editing one is acting blind on real-world blast radius, only on doc-level intent ("editing repaints, withdrawing doesn't").
- **House styles are studio-only; the API doesn't structurally prevent a couple-kind org from calling it, but nothing in the couple's chrome reaches it.** `requireOperator()` scopes by `orgId` alone (`lib/admin/presets.ts` routes) with no `kind==='partner'` check — a couple account hitting `/api/admin/presets` directly would get an (empty, since they've made none) list rather than a 403. Not exploitable for cross-tenant access, just an unenforced-in-code product assumption ("studios have styles, couples don't") that the UI alone currently honours.

## 8. Evidence index

`themes/contract.ts:1-79` · `themes/registry.ts:1-168` · `themes/css.ts:1-96` · `themes/resolve.ts:1-39` ·
`lib/admin/themes.ts:1-23` · `lib/contrast.ts:1-128` · `scripts/check-contrast.ts:1-90` ·
`lib/admin/presets.ts:1-71` · `lib/schema.ts:112-247,495-569` ·
`supabase/migrations/0001_initial_schema.sql:16,50,55-57` ·
`supabase/migrations/0011_draft_branding.sql:1-9` · `supabase/migrations/0012_content_waits_for_publish.sql:1-6` ·
`supabase/migrations/0019_themes.sql:1-22` · `supabase/migrations/0020_presets.sql:1-29` ·
`app/admin/platform/themes/page.tsx:1-39` · `app/api/admin/platform/themes/route.ts:1-64` ·
`app/api/admin/platform/themes/[id]/route.ts:1-58` · `lib/admin/platform.ts:1-74` ·
`components/admin/ThemePicker.tsx:1-317` · `components/admin/ThemeCards.tsx:1-108` ·
`components/admin/ThemeStudio.tsx:1-614` · `components/admin/AccentField.tsx:1-95` ·
`components/admin/TypefaceField.tsx:1-68` · `components/admin/StudioBranding.tsx:1-29` ·
`components/admin/HouseStyleEditor.tsx:1-313` · `app/admin/studio/page.tsx:1-85` ·
`app/admin/studio/styles/page.tsx:1-119` · `app/admin/studio/styles/[id]/page.tsx:1-55` ·
`app/api/admin/studio/route.ts:1-38` · `app/api/admin/presets/route.ts:1-67` ·
`app/api/admin/presets/[id]/route.ts:1-73` · `app/api/admin/catalogues/route.ts:75-159` ·
`app/api/admin/catalogues/[id]/route.ts:32-39,99` (branding-write scope, quoted from the live file) ·
`components/admin/CreateWizard.tsx:213,447-595` · `lib/admin/templates.ts:1-70` ·
`modules/contract.ts:1-126` · `modules/registry.ts:1-117` ·
`modules/billboard/{index,schema,resolve,Guest,Editor}.ts(x)` (full folder) ·
`components/admin/CustomizerShell.tsx:1-766` · `components/admin/PreviewPane.tsx:1-473` ·
`components/admin/SectionInspector.tsx:1-56` · `components/streaming/ModuleRenderer.tsx:1-71` ·
`components/streaming/CatalogueShell.tsx:1-60` · `components/chrome/ThemeStyle.tsx:1-33` ·
`app/admin/c/[id]/customizer/page.tsx:1-68` ·
`app/api/admin/catalogues/[id]/modules/route.ts:1-59` ·
`app/api/admin/catalogues/[id]/publish/route.ts:1-91` ·
`app/c/[slug]/page.tsx:1-154`, `locked/page.tsx:32`, `premiere/page.tsx:34`, `renew/page.tsx:32`,
`download/page.tsx:41`, `watch/[titleSlug]/page.tsx:56,60,74` ·
`lib/db/repository.ts:158-169,401-404` · `lib/db/memory-repository.ts:56-57,90,368-415` ·
`lib/db/file-repository.ts:1-25` · `lib/db/supabase-repository.ts:854-891,1144-1189` ·
`lib/fonts.ts:1-40` · `lib/poster.ts:18,78-85` · `lib/env.ts:48` ·
`.design-sync/{NOTES.md,config.json,conventions.md,build-tokens.mjs}` · `.gitignore:39` ·
`package.json:11-42` (scripts) ·
`tests/unit/registry.test.ts:21-168` · `tests/unit/themes.test.ts:1-129` ·
`tests/unit/platform-themes.test.ts:1-167` · `tests/unit/contrast.test.ts:1-85` ·
`e2e/publish-state.spec.ts:138-220` · `e2e/admin.spec.ts:170-220` ·
`.claude/skills/add-module/SKILL.md` ·
`docs/spec/16-platform-v2.md:175-253` · `docs/spec/14-modules-and-customizer.md:162-261` ·
`docs/reference/00-decision-log.md:593-632` · `docs/PRODUCT.md:180-221` ·
`docs/ROADMAP.md:104` · `docs/PROGRESS.md:1562-1822` · `docs/spec/13-agent-runbook.md:1-40`.
