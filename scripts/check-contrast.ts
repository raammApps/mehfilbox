#!/usr/bin/env tsx
/**
 * CI gate for the palette (doc 04 §2).
 *
 * The same computation runs live in the customizer's accent picker — that is the point. A
 * planner's brand colour is judged in the UI while they can still change it; this script is
 * the backstop that stops *our own* palette regressing.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { contrastRatio, formatRatio, judgeTheme, MIN_TEXT_CONTRAST, MIN_UI_CONTRAST } from '../lib/contrast'
import { builtInThemes } from '../themes/registry'

type Check = { name: string; fg: string; bg: string; min: number; note?: string }

const CSS = readFileSync(join(process.cwd(), 'app/globals.css'), 'utf8')

/** Read a token straight out of the stylesheet, so the check cannot drift from the shipped CSS. */
function token(name: string): string {
  const match = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(CSS)
  if (!match) throw new Error(`Token --color-${name} not found in app/globals.css`)
  return match[1]!
}

const surface0 = token('surface-0')
const accent = token('accent')

const checks: Check[] = [
  { name: '--text-hi on --surface-0', fg: token('text-hi'), bg: surface0, min: MIN_TEXT_CONTRAST },
  { name: '--text-mid on --surface-0', fg: token('text-mid'), bg: surface0, min: MIN_TEXT_CONTRAST },
  { name: '--text-lo on --surface-0', fg: token('text-lo'), bg: surface0, min: MIN_TEXT_CONTRAST },
  { name: '--text-hi on --surface-1', fg: token('text-hi'), bg: token('surface-1'), min: MIN_TEXT_CONTRAST },
  { name: '--text-mid on --surface-2', fg: token('text-mid'), bg: token('surface-2'), min: MIN_TEXT_CONTRAST },
  { name: '--accent-ink on --accent', fg: token('accent-ink'), bg: accent, min: MIN_TEXT_CONTRAST },
  {
    name: '--accent on --surface-0',
    fg: accent,
    bg: surface0,
    min: MIN_UI_CONTRAST,
    note: 'UI and large text only — red body copy on black is not permitted',
  },
  { name: '--accent-hi on --surface-0', fg: token('accent-hi'), bg: surface0, min: MIN_UI_CONTRAST },
  { name: '--l-text-hi on --l-surface-0', fg: token('l-text-hi'), bg: token('l-surface-0'), min: MIN_TEXT_CONTRAST },
  { name: '--l-text-mid on --l-surface-0', fg: token('l-text-mid'), bg: token('l-surface-0'), min: MIN_TEXT_CONTRAST },
]

let failed = 0

// doc 12 §1 rule 4. Not a design compromise — it removes the most quotable exhibit at zero cost.
// Comments are stripped first: the stylesheet names the forbidden value in order to forbid it.
const declarations = CSS.replace(/\/\*[\s\S]*?\*\//g, '')
if (/#e50914/i.test(declarations)) {
  console.error('✗ #E50914 appears in app/globals.css. Use --accent: #d11a2a (doc 12 §1 rule 4).')
  failed += 1
}

for (const check of checks) {
  const ratio = contrastRatio(check.fg, check.bg)
  const ok = ratio >= check.min
  if (!ok) failed += 1
  console.log(
    `${ok ? '✓' : '✗'} ${check.name.padEnd(34)} ${formatRatio(ratio).padStart(7)}  (min ${check.min})${
      check.note ? `  — ${check.note}` : ''
    }`,
  )
}

/**
 * Every built-in theme is held to the same pairs (D-35). A theme is a token set and nothing
 * else, so this is the whole of what can go wrong with one — and it goes wrong silently, in
 * front of a studio, if nothing here catches it.
 */
for (const theme of builtInThemes()) {
  const verdict = judgeTheme(theme.tokens)
  for (const pair of verdict.pairs) {
    const ok = pair.ratio >= pair.min
    if (!ok) failed += 1
    console.log(
      `${ok ? '✓' : '✗'} ${`${theme.id}: ${pair.name}`.padEnd(34)} ${formatRatio(pair.ratio).padStart(7)}  (min ${pair.min})`,
    )
  }
}

if (failed > 0) {
  console.error(`\n${failed} contrast check${failed > 1 ? 's' : ''} failed.`)
  console.error('Do not fix a failure by lightening the red into pink (doc 04 §2).')
  process.exit(1)
}

console.log('\nAll contrast checks passed.')
