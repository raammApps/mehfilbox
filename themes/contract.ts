import { z } from 'zod'
import { DISPLAY_FONTS } from '@/lib/schema'

/**
 * What a theme is (D-35, doc 16 §4): a validated token set, nothing more.
 *
 * Every guest component already reads its colours, radii and faces from custom properties, so a
 * theme is a different set of values written to the same properties — not a different tree. That
 * is why a platform admin can author one from a form and why the contrast gate can judge it
 * before anyone sees it.
 */

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour')

/** Faces a theme may set as its display face. `serif` is the system serif stack — no file shipped yet. */
export const THEME_DISPLAY_FONTS = [...DISPLAY_FONTS, 'serif'] as const
export const THEME_BODY_FONTS = ['inter', 'mukta'] as const

/** Which gradient pairs generated poster art draws from (`lib/poster.ts`). */
export const POSTER_PALETTES = ['warm', 'festive', 'classic', 'cool', 'bright'] as const
export type PosterPalette = (typeof POSTER_PALETTES)[number]

export const themeTokensSchema = z
  .object({
    surface0: hex,
    surface1: hex,
    surface2: hex,
    surface3: hex,
    textHi: hex,
    textMid: hex,
    textLo: hex,
    accent: hex,
    /** Text sitting on the accent — white on a deep accent, near-black on a bright one. */
    accentInk: hex,
    colorScheme: z.enum(['dark', 'light']),
    radiusCard: z.number().int().min(0).max(40),
    radiusModal: z.number().int().min(0).max(48),
    radiusInput: z.number().int().min(0).max(24),
    fontDisplay: z.enum(THEME_DISPLAY_FONTS),
    fontBody: z.enum(THEME_BODY_FONTS),
    posterPalette: z.enum(POSTER_PALETTES),
    /** The card border: the accent hairline of the streaming look, a soft shadow, or nothing. */
    cardEdge: z.enum(['hairline', 'shadow', 'none']),
  })
  .strict()

export type ThemeTokens = z.infer<typeof themeTokensSchema>

export type ThemeDefinition = {
  /** Slug-shaped, stable, and never another company's name (D-1, D-35). */
  id: string
  name: string
  /** One line for the picker: the feel, not the mechanics. */
  description: string
  tokens: ThemeTokens
  /** Built in from code, or authored by a platform admin and stored. */
  source: 'built-in' | 'custom'
  /** A disabled theme is hidden from pickers and kept for the catalogues already on it. */
  enabled: boolean
}

/** A stored, platform-authored theme (doc 16 §4). Same tokens, plus who made it and when. */
export const customThemeSchema = z.object({
  id: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens'),
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(160).default(''),
  tokens: themeTokensSchema,
  enabled: z.boolean().default(true),
  createdBy: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type CustomTheme = z.infer<typeof customThemeSchema>
