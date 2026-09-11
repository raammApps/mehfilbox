#!/usr/bin/env node
/**
 * Build the Claude Design bundle for Mehfilbox — tokens, fonts and utilities.
 *
 * **Not the /design-sync converter, deliberately.** That converter ships a repo's compiled `dist/`
 * so a design agent renders the customer's real components. Mehfilbox has no such build: it is a
 * Next.js application, `private: true`, with no package entry and no component bundle, and 31 of
 * its 63 components import `next/*` while 32 import app data types. Shipping those would give the
 * agent a library that cannot render.
 *
 * What Mehfilbox *does* have below the components is a complete and coherent design language, and
 * that is what this ships: the `@theme` tokens, the derived surface variables, the custom utility
 * classes and the four self-hosted faces.
 *
 * Everything is **extracted from `app/globals.css` at build time** rather than transcribed. A copy
 * would drift the first time somebody changed a colour, and a token file that disagrees with the
 * product is worse than none — the agent would design against a palette nobody ships.
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'ds-bundle')
const SOURCE = join(ROOT, 'app/globals.css')

/** Extract one top-level `<at-rule> { … }` block by counting braces, returning its inner body. */
function block(css, opener) {
  const start = css.indexOf(opener)
  if (start === -1) throw new Error(`globals.css no longer contains ${opener}`)
  let depth = 0
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') {
      depth -= 1
      if (depth === 0) return css.slice(css.indexOf('{', start) + 1, i)
    }
  }
  throw new Error(`unbalanced braces after ${opener}`)
}

const css = readFileSync(SOURCE, 'utf8')

rmSync(OUT, { recursive: true, force: true })
for (const dir of ['tokens', 'fonts']) mkdirSync(join(OUT, dir), { recursive: true })

const banner = (what) =>
  `/* Mehfilbox — ${what}\n   Generated from app/globals.css by .design-sync/build-tokens.mjs.\n   Edit the source, not this file. */\n\n`

// ── Tokens ────────────────────────────────────────────────────────────────────
// Tailwind v4's `@theme` emits these as ordinary custom properties, so re-homing them on `:root`
// loses nothing and removes the build-time dependency — a design agent has no Tailwind compile.
writeFileSync(
  join(OUT, 'tokens/theme.css'),
  `${banner('design tokens')}:root {${block(css, '@theme')}}\n`,
)

/**
 * The derived layer: `--edge`, `--scrim`, and `--gutter`, which is the page margin and the one
 * token that changes with the viewport. The media queries come across verbatim so a design built
 * at 1024px has the same 48px margin the product does.
 */
const derived = css.slice(css.indexOf(':root {'), css.indexOf('@layer base'))
writeFileSync(join(OUT, 'tokens/surface.css'), `${banner('surfaces and page margins')}${derived}\n`)

// ── Utilities ─────────────────────────────────────────────────────────────────
/**
 * Unwrapped from `@layer utilities`. Tailwind declares the layer order; without that declaration a
 * bare `@layer` sorts *below* unlayered rules, so these would lose every specificity contest in a
 * design that also writes plain CSS. Unlayered is the faithful behaviour here.
 */
writeFileSync(
  join(OUT, '_ds_bundle.css'),
  `${banner('utility classes')}${block(css, '@layer utilities')}\n`,
)

// ── Fonts ─────────────────────────────────────────────────────────────────────
/**
 * `next/font/local` generates these `@font-face` rules at build time and hands the app a
 * `--font-*` variable. Nothing here can run Next, so they are declared directly — same files, same
 * weights, same `swap`, from `lib/fonts.ts`.
 */
const FACES = [
  ['Archivo', 'archivo-latin-800-900.woff2', '800 900', 'latin'],
  ['Inter', 'inter-latin-400-600.woff2', '400 600', 'latin'],
  ['Mukta', 'mukta-latin-400.woff2', '400', 'latin'],
  ['Mukta', 'mukta-latin-700.woff2', '700', 'latin'],
  ['Mukta', 'mukta-devanagari-400.woff2', '400', 'devanagari'],
  ['Mukta', 'mukta-devanagari-700.woff2', '700', 'devanagari'],
]

const faceCss = FACES.map(
  ([family, file, weight, subset]) => `/* ${subset} */
@font-face {
  font-family: '${family}';
  src: url('./${file}') format('woff2');
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}`,
).join('\n\n')

writeFileSync(
  join(OUT, 'fonts/fonts.css'),
  `${banner('self-hosted faces (SIL OFL 1.1 — see LICENSES.md)')}${faceCss}

/* The names the token layer points at. In the product these come from next/font. */
:root {
  --font-archivo: 'Archivo';
  --font-inter: 'Inter';
  --font-mukta: 'Mukta';
}
`,
)

for (const [, file] of FACES) copyFileSync(join(ROOT, 'public/fonts', file), join(OUT, 'fonts', file))
copyFileSync(join(ROOT, 'public/fonts/LICENSES.md'), join(OUT, 'fonts/LICENSES.md'))

// ── The entry ─────────────────────────────────────────────────────────────────
/**
 * The one file that matters: a rendered design receives only this file's transitive `@import`
 * closure, so anything not reachable from here does not exist as far as the design agent is
 * concerned. Fonts first — a face referenced before it is declared renders as a fallback for the
 * first paint.
 */
writeFileSync(
  join(OUT, 'styles.css'),
  `${banner('entry — everything a design needs, in import order')}@import './fonts/fonts.css';
@import './tokens/theme.css';
@import './tokens/surface.css';
@import './_ds_bundle.css';

/* The product's own baseline, from globals.css @layer base. A guest page is near-black with
   mid-grey body text; the admin console flips to the light set on its own container. */
body {
  background: var(--color-surface-0);
  color: var(--color-text-mid);
  font-family: var(--font-sans);
  font-size: var(--text-body);
  line-height: var(--text-body--line-height);
  -webkit-font-smoothing: antialiased;
}

h1,
h2,
h3 {
  font-family: var(--font-display);
  color: inherit;
}

/* Devanagari needs more leading or the matras clip. Handled once, not per component. */
[lang='hi'] {
  font-family: var(--font-deva);
  line-height: calc(var(--text-body--line-height) + 0.12);
}
`,
)

console.log(`built ${OUT}`)
