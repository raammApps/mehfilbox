# Mehfilbox — design language

Mehfilbox is a white-label wedding video platform. Studios deliver a couple's films and photographs
as a private streaming page under the studio's own name.

**This is a token system, not a component library.** There are no importable components — nothing
to render from a bundle. What ships is the design language: custom properties, a small set of
utility classes, and four self-hosted faces. Build UI with ordinary HTML and style it from the
vocabulary below.

## Do not write Tailwind class names

The product is built with Tailwind v4, so its source is full of `bg-surface-1` and `text-text-mid`.
**None of those resolve here** — no Tailwind is compiled into this bundle. Writing them produces
silently unstyled output, which is the single most likely way to get this wrong.

Style with `var(--token)` and the `.type-*` classes instead:

```html
<!-- wrong: looks plausible, renders unstyled -->
<div class="bg-surface-1 rounded-card p-4">

<!-- right -->
<div style="background: var(--color-surface-1); border-radius: var(--radius-card); padding: 16px">
```

## Two surfaces, and they are not interchangeable

- **Guest** — what a couple and two hundred relatives open, on a phone. Near-black: background
  `--color-surface-0`, body text `--color-text-mid`, headings `--color-text-hi`. This is the
  default; `body` already carries it.
- **Admin console** — what a studio works in on a laptop. The light set, applied on a container:
  `--color-l-surface-0` / `--color-l-surface-1` / `--color-l-surface-2`, text `--color-l-text-hi`
  and `--color-l-text-mid`, hairlines `--color-l-line`.

Headings inherit `color` deliberately, so the same `<h2>` works on either surface. Set the colour on
the container, not the heading.

## The vocabulary

**Colour.** Surfaces `--color-surface-0..3`. Text `--color-text-hi`, `--color-text-mid`,
`--color-text-lo`. Accent `--color-accent` with `--color-accent-hi`, `--color-accent-dim`, and
`--color-accent-ink` for text sitting *on* the accent. Semantic `--color-ok`, `--color-warn`,
`--color-error`. Poster-side warmth — `--color-marigold`, `--color-rose`, `--color-gold` — is for
generated artwork and card accents only, never the shell.

⚠️ **`--color-accent` is only safe on `--color-surface-0`**, where it clears 4.5:1. On a raised
surface it does not. This is a real bug that shipped and was caught by an accessibility gate.

**Type.** Use the classes, not raw sizes: `.type-display-xl`, `.type-display-lg`, `.type-title`,
`.type-body-lg`, `.type-meta`, `.type-label`. Plain body text needs no class. Display sizes are
fluid `clamp()` — they shrink on a phone on their own.

**Layout.** `--radius-card`, `--radius-modal`, `--radius-input`, `--radius-pill` (a pill button is
`--radius-pill`). `.gutter-x` applies the page margin, which is 16px on a phone and 48px on a
desktop; `.gutter-l` pads the start only, so a row of cards lets the next one peek. Spacing is a
4px scale (`--spacing`) — nothing off-scale.

**Borders and effects.** `.edge` is the accent hairline at 14% — the standard card border.
`--edge-plain` is the neutral one. `.scrim-bottom` lays `--scrim` over an image so text stays
readable on it. `.clamp-2` / `.clamp-3` truncate at a line count. `.no-scrollbar` hides a scrollbar
on a horizontal row. `.grain` adds 3% noise that stops gradient banding on cheap panels.

**Motion.** `--ease-lift` for hover and cards, `--ease-in-modal` / `--ease-out-modal` for dialogs,
`--ease-scroll` for scrolled rows.

**Hindi is a first-class language, not a fallback.** Roughly half of what this product serves is
Devanagari. Put `lang="hi"` on the element and the stylesheet swaps to Mukta and adds leading —
without it the matras clip. Never hard-code a Latin font.

## Where the truth lives

`styles.css` is the entry and the whole contract: a design receives its `@import` closure and
nothing else. Read it and the files it pulls in — `tokens/theme.css` (every token),
`tokens/surface.css` (derived vars and the responsive page margin), `_ds_bundle.css` (the utility
classes), `fonts/fonts.css`. They are short, and they are authoritative in a way this summary is not.

## A typical piece of UI

```html
<section class="gutter-x" style="padding-block: 32px">
  <p class="type-label" style="color: var(--color-accent-hi)">FOR WEDDING STUDIOS</p>
  <h1 class="type-display-xl">Hand over the wedding, not a folder of files.</h1>
  <p class="type-body-lg" style="max-width: 52ch; color: var(--color-text-mid)">
    One link, no account, no request-access wall.
  </p>

  <div class="edge" style="border-radius: var(--radius-card); padding: 16px; margin-top: 24px;
                           background: var(--color-surface-1)">
    <h2 class="type-title">Aanya &amp; Vikram</h2>
    <p class="type-meta">14 NOVEMBER 2026 · 9 FILMS</p>
  </div>

  <a href="#" style="display: inline-flex; height: 48px; align-items: center; margin-top: 24px;
                     padding-inline: 24px; border-radius: var(--radius-pill);
                     background: var(--color-accent); color: var(--color-accent-ink);
                     font-weight: 600; text-decoration: none">Create your studio</a>
</section>
```
