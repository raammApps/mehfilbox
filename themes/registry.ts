import type { Branding } from '@/lib/schema'
import type { CustomTheme, PosterPalette, ThemeDefinition, ThemeTokens } from './contract'

/**
 * The built-in themes (D-35). Named for their feel, never for another company's product — the
 * reasoning of D-1 about names and marks applies here word for word. `marquee` is everything
 * shipped before 12 September 2026 and stays the default.
 *
 * Every set below is held to the contrast gate by `tests/unit/themes.test.ts` and by
 * `pnpm check:contrast`, so a value here that fails a pair fails the build.
 */
export const DEFAULT_THEME_ID = 'marquee'

const RADII = { card: 10, modal: 18, input: 8 } as const

function tokens(partial: Partial<ThemeTokens> & Pick<ThemeTokens, 'surface0' | 'surface1' | 'surface2' | 'surface3' | 'textHi' | 'textMid' | 'textLo' | 'accent' | 'accentInk' | 'colorScheme'>): ThemeTokens {
  return {
    radiusCard: RADII.card,
    radiusModal: RADII.modal,
    radiusInput: RADII.input,
    fontDisplay: 'archivo',
    fontBody: 'inter',
    posterPalette: 'warm',
    cardEdge: 'hairline',
    ...partial,
  }
}

const BUILT_IN: readonly ThemeDefinition[] = [
  {
    id: 'marquee',
    name: 'Marquee',
    description: 'The streaming-app look: near-black, one hot red, posters carrying the colour.',
    source: 'built-in',
    enabled: true,
    tokens: tokens({
      surface0: '#0c0c0d', surface1: '#17171a', surface2: '#202024', surface3: '#2c2c31',
      textHi: '#f5f5f6', textMid: '#c4c4c8', textLo: '#93939a',
      accent: '#d11a2a', accentInk: '#ffffff', colorScheme: 'dark',
    }),
  },
  {
    id: 'feed',
    name: 'Feed',
    description: 'A photo-first social grid: white, rounded, a magenta accent.',
    source: 'built-in',
    enabled: true,
    tokens: tokens({
      surface0: '#ffffff', surface1: '#fafafa', surface2: '#f1f1f3', surface3: '#dfe0e4',
      textHi: '#131316', textMid: '#45454b', textLo: '#5f5f66',
      accent: '#c2185b', accentInk: '#ffffff', colorScheme: 'light',
      radiusCard: 16, radiusModal: 22, radiusInput: 10,
      fontDisplay: 'inter', posterPalette: 'cool', cardEdge: 'shadow',
    }),
  },
  {
    id: 'bulletin',
    name: 'Bulletin',
    description: 'A calm light feed with a blue accent and more room for words.',
    source: 'built-in',
    enabled: true,
    tokens: tokens({
      surface0: '#f3f5f7', surface1: '#ffffff', surface2: '#e9edf1', surface3: '#d3dae2',
      textHi: '#14181d', textMid: '#3f4650', textLo: '#5c6570',
      accent: '#1a5fb4', accentInk: '#ffffff', colorScheme: 'light',
      radiusCard: 12, radiusModal: 16, posterPalette: 'cool',
    }),
  },
  {
    id: 'carnival',
    name: 'Carnival',
    description: 'Deep purple and marigold — the sangeet, not the ceremony.',
    source: 'built-in',
    enabled: true,
    tokens: tokens({
      surface0: '#1b0f2e', surface1: '#26163f', surface2: '#32204f', surface3: '#43305f',
      textHi: '#fff4e8', textMid: '#e0cfe6', textLo: '#b9a3c7',
      accent: '#f2933a', accentInk: '#2a0d16', colorScheme: 'dark',
      radiusCard: 14, radiusModal: 20, radiusInput: 10, posterPalette: 'festive',
    }),
  },
  {
    id: 'classic',
    name: 'Classic',
    description: 'Ivory, gold and a serif display — the album on the coffee table.',
    source: 'built-in',
    enabled: true,
    tokens: tokens({
      surface0: '#f7f2ea', surface1: '#fffdf9', surface2: '#efe7da', surface3: '#dfd3bf',
      textHi: '#1f1a14', textMid: '#4a4038', textLo: '#655a4f',
      accent: '#8a6a1e', accentInk: '#ffffff', colorScheme: 'light',
      radiusCard: 6, radiusModal: 12, radiusInput: 6,
      fontDisplay: 'serif', posterPalette: 'classic',
    }),
  },
  {
    id: 'rainbow',
    name: 'Rainbow',
    description: 'Multi-hue posters on black and a pink accent — louder than Marquee.',
    source: 'built-in',
    enabled: true,
    tokens: tokens({
      surface0: '#0b0b10', surface1: '#151520', surface2: '#1e1e2c', surface3: '#2c2c3c',
      textHi: '#f6f6fa', textMid: '#c8c8d4', textLo: '#9a9aab',
      accent: '#ff3d7f', accentInk: '#140a10', colorScheme: 'dark',
      radiusCard: 12, posterPalette: 'bright',
    }),
  },
  {
    id: 'playtime',
    name: 'Playtime',
    description: 'Bright, rounded, big type — birthdays and naming days.',
    source: 'built-in',
    enabled: true,
    tokens: tokens({
      surface0: '#fffbea', surface1: '#ffffff', surface2: '#fff1c2', surface3: '#f5dc8a',
      textHi: '#1d1b10', textMid: '#4d4a36', textLo: '#66614a',
      accent: '#e4572e', accentInk: '#1d1b10', colorScheme: 'light',
      radiusCard: 20, radiusModal: 28, radiusInput: 12, posterPalette: 'bright', cardEdge: 'none',
    }),
  },
]

export function builtInThemes(): readonly ThemeDefinition[] {
  return BUILT_IN
}

export function getBuiltInTheme(id: string | null | undefined): ThemeDefinition | null {
  return BUILT_IN.find((theme) => theme.id === id) ?? null
}

/** The default, which every catalogue that predates themes is on. */
export function defaultTheme(): ThemeDefinition {
  return BUILT_IN[0]!
}

/** A stored theme, in the shape everything else reads. */
export function fromCustom(theme: CustomTheme): ThemeDefinition {
  return {
    id: theme.id,
    name: theme.name,
    description: theme.description,
    tokens: theme.tokens,
    source: 'custom',
    enabled: theme.enabled,
  }
}

/**
 * The theme a branding names, out of a list the caller has already resolved — built-in only, or
 * built-in plus stored. Unknown and disabled ids fall back to the default rather than to nothing:
 * a catalogue on a theme that was later withdrawn keeps rendering.
 */
export function themeFrom(
  branding: Pick<Branding, 'theme'>,
  available: readonly ThemeDefinition[] = BUILT_IN,
): ThemeDefinition {
  const id = branding.theme ?? DEFAULT_THEME_ID
  return available.find((theme) => theme.id === id) ?? getBuiltInTheme(id) ?? defaultTheme()
}

/** Which gradient pairs a catalogue's generated posters draw from. */
export function posterPaletteOf(
  branding: Pick<Branding, 'theme'>,
  available: readonly ThemeDefinition[] = BUILT_IN,
): PosterPalette {
  return themeFrom(branding, available).tokens.posterPalette
}
