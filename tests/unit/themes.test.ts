import { describe, expect, it } from 'vitest'
import { judgeAccent, judgeTheme } from '@/lib/contrast'
import { paletteFor, tileColours } from '@/lib/poster'
import { customThemeSchema, themeTokensSchema } from '@/themes/contract'
import { inkFor, resolvedAccent, themeCss } from '@/themes/css'
import {
  builtInThemes,
  DEFAULT_THEME_ID,
  fromCustom,
  getBuiltInTheme,
  posterPaletteOf,
  themeFrom,
} from '@/themes/registry'

/**
 * Themes (D-35). What is worth holding: every built-in set clears the contrast gate the palette
 * has always been held to; the default is what shipped; an unknown or withdrawn id renders as
 * the default rather than as nothing; and a brand accent is judged against the theme it sits
 * on, not against black.
 */

describe('the built-in themes', () => {
  it('are seven, and Marquee — everything shipped before them — is the default', () => {
    const ids = builtInThemes().map((t) => t.id)
    expect(ids).toEqual(['marquee', 'feed', 'bulletin', 'carnival', 'classic', 'rainbow', 'playtime'])
    expect(DEFAULT_THEME_ID).toBe('marquee')
    expect(getBuiltInTheme('marquee')!.tokens).toMatchObject({
      surface0: '#0c0c0d',
      accent: '#d11a2a',
      colorScheme: 'dark',
    })
  })

  it.each(builtInThemes().map((t) => [t.id, t] as const))(
    '%s clears every contrast pair doc 04 §2 requires',
    (_id, theme) => {
      const verdict = judgeTheme(theme.tokens)
      expect(
        verdict.failures.map((f) => `${f.name} ${f.ratio.toFixed(2)} < ${f.min}`),
        `${theme.id} fails`,
      ).toEqual([])
    },
  )

  it.each(builtInThemes().map((t) => [t.id, t] as const))('%s parses its own schema', (_id, theme) => {
    expect(themeTokensSchema.safeParse(theme.tokens).success).toBe(true)
  })

  it('never names another company (D-1)', () => {
    for (const theme of builtInThemes()) {
      expect(`${theme.id} ${theme.name} ${theme.description}`).not.toMatch(/netflix|instagram|facebook|flix/i)
    }
  })
})

describe('resolving a theme from branding', () => {
  it('reads the id off branding and falls back to the default for nothing, unknown, or withdrawn', () => {
    expect(themeFrom({}).id).toBe('marquee')
    expect(themeFrom({ theme: 'carnival' }).id).toBe('carnival')
    expect(themeFrom({ theme: 'no-such-theme' }).id).toBe('marquee')

    const withdrawn = fromCustom(
      customThemeSchema.parse({
        id: 'house-red',
        name: 'House red',
        tokens: getBuiltInTheme('marquee')!.tokens,
        enabled: false,
        createdAt: '2026-09-12T00:00:00.000Z',
        updatedAt: '2026-09-12T00:00:00.000Z',
      }),
    )
    // A catalogue already on a withdrawn theme keeps rendering with it — withdrawal hides it
    // from pickers, it does not repaint pages.
    expect(themeFrom({ theme: 'house-red' }, [...builtInThemes(), withdrawn]).id).toBe('house-red')
  })

  it('hands generated posters the theme’s palette', () => {
    expect(posterPaletteOf({})).toBe('warm')
    expect(posterPaletteOf({ theme: 'carnival' })).toBe('festive')
    expect(paletteFor('a-film', 'festive')).not.toEqual(paletteFor('a-film', 'warm'))
    expect(tileColours('cool')).toHaveLength(6)
  })
})

describe('the brand within the theme', () => {
  it('keeps a brand accent that reads on this theme’s surface and drops one that does not', () => {
    const classic = getBuiltInTheme('classic')!.tokens
    // Marquee red on ivory reads; a pale yellow does not, and the theme's own accent stands in.
    expect(resolvedAccent(classic, { accent: '#d11a2a' })).toBe('#d11a2a')
    expect(resolvedAccent(classic, { accent: '#fff2a8' })).toBe(classic.accent)
    expect(judgeAccent('#fff2a8', classic.surface0).ok).toBe(false)
  })

  it('picks button text that reads on whatever accent won', () => {
    expect(inkFor('#d11a2a', '#ffffff')).toBe('#ffffff')
    expect(inkFor('#f2933a', '#2a0d16')).toBe('#2a0d16')
    // A bright brand accent on a theme whose own ink is white: the ink flips rather than fails.
    expect(inkFor('#ffd400', '#ffffff')).toBe('#131316')
  })

  it('emits every token the guest surface reads, scoped where it was asked to', () => {
    const css = themeCss(getBuiltInTheme('feed')!.tokens, {}, '[data-preview-theme]')
    for (const token of [
      '--color-surface-0',
      '--color-surface-3',
      '--color-text-hi',
      '--color-text-lo',
      '--color-accent',
      '--color-accent-hi',
      '--color-accent-ink',
      '--radius-card',
      '--font-display',
      '--font-sans',
      '--edge',
      'color-scheme:light',
    ]) {
      expect(css).toContain(token)
    }
    expect(css.startsWith('[data-preview-theme]{')).toBe(true)
    // The feed's soft shadow lands on the same hook every card already uses.
    expect(css).toContain('.edge{box-shadow')
  })

  it('lets a brand choose the display face and otherwise uses the theme’s', () => {
    const classic = getBuiltInTheme('classic')!.tokens
    expect(themeCss(classic, {}, ':root')).toContain('--font-display:Georgia')
    expect(themeCss(classic, { displayFont: 'archivo' }, ':root')).toContain('--font-display:var(--font-archivo)')
  })
})
