/**
 * WCAG 2.1 relative luminance and contrast, used in three places for one reason:
 * the same computation must run in CI (`scripts/check-contrast.ts`), in the customizer's
 * accent picker at pick time, and in tests. A planner's brand pink has to be rejected in the
 * UI while they can still change it — not by a build log they never see (doc 04 §2).
 */

export type Rgb = { r: number; g: number; b: number }

export function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim())
  if (!match) return null
  let body = match[1]!
  if (body.length === 3) body = body.split('').map((c) => c + c).join('')
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  }
}

function channelLuminance(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function relativeLuminance(colour: Rgb): number {
  return (
    0.2126 * channelLuminance(colour.r) +
    0.7152 * channelLuminance(colour.g) +
    0.0722 * channelLuminance(colour.b)
  )
}

/** Contrast ratio between two hex colours, 1–21. Throws on unparseable input. */
export function contrastRatio(foreground: string, background: string): number {
  const fg = parseHex(foreground)
  const bg = parseHex(background)
  if (!fg || !bg) throw new Error(`Unparseable colour: ${!fg ? foreground : background}`)
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  const [light, dark] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (light + 0.05) / (dark + 0.05)
}

export const SURFACE_0 = '#0c0c0d'
export const ACCENT_INK = '#ffffff'
/** The near-black ink a bright accent gets instead of white (`themes/css.ts` `inkFor`). */
export const DARK_INK = '#131316'

/** Minimums from doc 04 §2. UI/large text is the 3:1 bucket; body copy is 4.5:1. */
export const MIN_UI_CONTRAST = 3
export const MIN_TEXT_CONTRAST = 4.5

export type AccentVerdict = {
  /** Accent against the page surface — governs buttons, icons, large text. */
  onSurface: number
  /**
   * The better of white and near-black text on the accent fill — governs the primary button's
   * label. Since D-35 the ink is chosen per accent rather than fixed white, so a marigold accent
   * with dark lettering is a pass, not a warning.
   */
  inkOnAccent: number
  ok: boolean
  /** Present when `ok` is false. Written for an operator, not a developer. */
  warning?: string
}

export function judgeAccent(accent: string, surface: string = SURFACE_0): AccentVerdict {
  const onSurface = contrastRatio(accent, surface)
  const inkOnAccent = Math.max(contrastRatio(ACCENT_INK, accent), contrastRatio(DARK_INK, accent))

  if (onSurface < MIN_UI_CONTRAST) {
    return {
      onSurface,
      inkOnAccent,
      ok: false,
      warning:
        'This colour is too close to the page background — buttons and icons will be hard to see. Try a stronger shade.',
    }
  }

  if (inkOnAccent < MIN_TEXT_CONTRAST) {
    return {
      onSurface,
      inkOnAccent,
      ok: false,
      warning:
        'Button text will be hard to read on this colour. Try a deeper or a lighter shade of the same hue.',
    }
  }

  return { onSurface, inkOnAccent, ok: true }
}

export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(1)}:1`
}

/**
 * The pairs a theme has to clear (doc 04 §2, applied to every theme by D-35). Returned as a list
 * rather than a boolean so a platform admin authoring a theme is told which pair failed and by
 * how much — a form that says "invalid" teaches nothing.
 */
export type ThemePair = { name: string; ratio: number; min: number }

export function judgeTheme(tokens: {
  surface0: string
  surface1: string
  surface2: string
  textHi: string
  textMid: string
  textLo: string
  accent: string
  accentInk: string
}): { ok: boolean; pairs: ThemePair[]; failures: ThemePair[] } {
  const pairs: ThemePair[] = [
    { name: 'headings on the page', ratio: contrastRatio(tokens.textHi, tokens.surface0), min: MIN_TEXT_CONTRAST },
    { name: 'body text on the page', ratio: contrastRatio(tokens.textMid, tokens.surface0), min: MIN_TEXT_CONTRAST },
    { name: 'small text on the page', ratio: contrastRatio(tokens.textLo, tokens.surface0), min: MIN_TEXT_CONTRAST },
    { name: 'headings on a card', ratio: contrastRatio(tokens.textHi, tokens.surface1), min: MIN_TEXT_CONTRAST },
    { name: 'body text on a raised card', ratio: contrastRatio(tokens.textMid, tokens.surface2), min: MIN_TEXT_CONTRAST },
    { name: 'button text on the accent', ratio: contrastRatio(tokens.accentInk, tokens.accent), min: MIN_TEXT_CONTRAST },
    { name: 'the accent on the page', ratio: contrastRatio(tokens.accent, tokens.surface0), min: MIN_UI_CONTRAST },
  ]
  const failures = pairs.filter((pair) => pair.ratio < pair.min)
  return { ok: failures.length === 0, pairs, failures }
}
