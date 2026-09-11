# design-sync notes

## Why this repo does not take the converter path

Checked 12 September 2026, before any work:

| | |
|---|---|
| Storybook / `*.stories.*` | none |
| Package entry (`main`/`module`/`exports`), `files` | none — `private: true` |
| Build output | `next build` → `.next/`, an app build; no `dist/` |
| Components | 63 `.tsx`; **31** import `next/*`, **32** import `@/lib/schema` |

The converter ships a repo's compiled `dist/` so a design agent renders the customer's real
components. There is no such build here, and the components are bound to Next's server/client
boundary and to `Catalogue`/`Title`/`Translator` props. Shipping them would produce a library that
renders wrong in every design built with it.

Sandeep chose **tokens + fonts only** (12 September). What ships is the layer that genuinely is a
design system: `app/globals.css`'s `@theme` tokens, the derived surface layer, the utility classes
and the four self-hosted faces.

## How the bundle is produced

`node .design-sync/build-tokens.mjs` → `ds-bundle/`. It **extracts** from `app/globals.css` at build
time rather than transcribing: a copy would drift the first time somebody changed a colour, and a
token file that disagrees with the product is worse than none.

Two transformations worth knowing:

- `@theme` → `:root`. Tailwind v4 emits these as ordinary custom properties, so this costs nothing
  and removes the build-time dependency — a design agent has no Tailwind compile.
- `@layer utilities` → unwrapped. Tailwind declares the layer order; without that declaration a bare
  `@layer` sorts *below* unlayered rules and would lose every specificity contest in a design that
  also writes plain CSS.

## Verified, not assumed

Rendered from `styles.css` alone — the only file a design receives — and checked by computed style,
not by eye: Archivo resolves on headings (76px at desktop), Inter on body, Mukta on `[lang=hi]`,
`.type-label` uppercases, `.clamp-2` clamps at 2, `.edge` resolves its `color-mix` to accent-at-14%,
`--gutter` is 48px past the 1024px breakpoint, and the light set lands at `rgb(250,250,250)`.

Local reference kept at `.design-sync/proof.html`; serve the repo root and open it. Never uploaded.

## Outstanding

**The upload never happened.** `DesignSync` needs design-system authorization, which cannot be
granted from a non-interactive session. Run `/design-login` once from an interactive Claude Code
session on this machine, then re-run `/design-sync`; the bundle is already built and verified, so
that run only has to create the project and push `ds-bundle/`.

No `projectId` is pinned because no project was ever created — the next run creates one.
