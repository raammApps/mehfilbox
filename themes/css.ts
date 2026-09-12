import { contrastRatio, DARK_INK, judgeAccent } from '@/lib/contrast'
import type { Branding } from '@/lib/schema'
import type { ThemeTokens } from './contract'

/**
 * A theme, plus a studio's brand within it, as the custom properties every guest component
 * reads (D-35). One function, so the guest page and the customizer's preview emit the same CSS.
 *
 * Brand overrides theme for the accent and the display face; the theme decides everything else.
 * An accent that fails contrast against **this theme's** surface is dropped, exactly as the old
 * black-only backstop did — the picker warns at pick time, this is what happens if a value got
 * saved before it could.
 */

/** Only faces the app actually loads, plus the system serif. Never interpolated user text. */
export const FONT_STACKS: Record<ThemeTokens['fontDisplay'], string> = {
  archivo: "var(--font-archivo), 'Archivo', Impact, sans-serif",
  mukta: "var(--font-mukta), 'Mukta', 'Noto Sans Devanagari', sans-serif",
  inter: "var(--font-inter), 'Inter', system-ui, sans-serif",
  serif: "Georgia, 'Times New Roman', 'Noto Serif', serif",
}

/** White or near-black, whichever reads on the accent. Computed, so a brand override cannot break it. */
export function inkFor(accent: string, preferred: string): string {
  if (contrastRatio(preferred, accent) >= 4.5) return preferred
  return contrastRatio('#ffffff', accent) >= contrastRatio(DARK_INK, accent) ? '#ffffff' : DARK_INK
}

export function resolvedAccent(tokens: ThemeTokens, branding: Pick<Branding, 'accent'>): string {
  const candidate = branding.accent
  if (candidate && judgeAccent(candidate, tokens.surface0).ok) return candidate
  return tokens.accent
}

export function themeCss(
  tokens: ThemeTokens,
  branding: Pick<Branding, 'accent' | 'displayFont'>,
  scope: string,
): string {
  const accent = resolvedAccent(tokens, branding)
  const ink = inkFor(accent, accent === tokens.accent ? tokens.accentInk : '#ffffff')
  const light = tokens.colorScheme === 'light'
  const display = FONT_STACKS[branding.displayFont ?? tokens.fontDisplay]
  const body = FONT_STACKS[tokens.fontBody]

  /**
   * `accent-hi` is the hover and the eyebrow colour. On a dark surface it brightens; on a light
   * one it deepens — mixing toward white on white would erase the one saturated colour.
   */
  const accentHi = light
    ? `color-mix(in srgb, ${accent} 82%, black)`
    : `color-mix(in srgb, ${accent} 78%, white)`
  const accentDim = light
    ? `color-mix(in srgb, ${accent} 55%, white)`
    : `color-mix(in srgb, ${accent} 66%, black)`

  const edge =
    tokens.cardEdge === 'none'
      ? '1px solid transparent'
      : light
        ? `1px solid ${tokens.surface3}`
        : `1px solid color-mix(in srgb, ${accent} 14%, transparent)`

  const rules = [
    `--color-surface-0:${tokens.surface0}`,
    `--color-surface-1:${tokens.surface1}`,
    `--color-surface-2:${tokens.surface2}`,
    `--color-surface-3:${tokens.surface3}`,
    `--color-text-hi:${tokens.textHi}`,
    `--color-text-mid:${tokens.textMid}`,
    `--color-text-lo:${tokens.textLo}`,
    `--color-accent:${accent}`,
    `--color-accent-hi:${accentHi}`,
    `--color-accent-dim:${accentDim}`,
    `--color-accent-ink:${ink}`,
    `--radius-card:${tokens.radiusCard}px`,
    `--radius-modal:${tokens.radiusModal}px`,
    `--radius-input:${tokens.radiusInput}px`,
    `--font-display:${display}`,
    `--font-sans:${body}`,
    `--edge:${edge}`,
    `--edge-plain:1px solid ${tokens.surface3}`,
    // Re-emitted rather than inherited: `--scrim` is composed from the surface at the point it is
    // declared, so a scoped preview inheriting `:root`'s would put a black fade on an ivory page.
    `--scrim:linear-gradient(to top,${tokens.surface0} 0%,color-mix(in srgb,${tokens.surface0} 82%,transparent) 26%,color-mix(in srgb,${tokens.surface0} 30%,transparent) 62%,transparent 100%)`,
    `color-scheme:${tokens.colorScheme}`,
  ]

  // The card shadow, when the theme asks for one, lands on the same hairline hook every card uses.
  const shadow =
    tokens.cardEdge === 'shadow'
      ? `${scope} .edge{box-shadow:0 1px 2px rgba(0,0,0,.06),0 8px 24px -12px rgba(0,0,0,.18);}`
      : ''

  return `${scope}{${rules.join(';')};background:${tokens.surface0};color:${tokens.textMid};}${shadow}`
}
