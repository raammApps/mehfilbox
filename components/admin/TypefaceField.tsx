'use client'

import type { Catalogue } from '@/lib/schema'
import type { ThemeDefinition } from '@/themes/contract'
import { FONT_STACKS } from '@/themes/css'

export type DisplayFont = NonNullable<Catalogue['branding']['displayFont']>

/** Only faces `lib/fonts.ts` actually loads; see `DISPLAY_FONTS`. */
const FACES: { value: DisplayFont; label: string }[] = [
  { value: 'archivo', label: 'Archivo' },
  { value: 'mukta', label: 'Mukta' },
  { value: 'inter', label: 'Inter' },
]

/**
 * The headline face. `null` is "the theme's own" (D-35): a Classic wedding gets the serif unless
 * a studio insists on its own, and it is written as an absent field so the theme decides at
 * render time. Each button is set in the face it selects, because the only question an operator
 * is really asking is "what does it look like".
 */
export function TypefaceField({
  value,
  theme,
  onChange,
  disabled = false,
}: {
  value: DisplayFont | null
  theme: ThemeDefinition
  onChange: (face: DisplayFont | null) => void
  disabled?: boolean
}) {
  const button = (selected: boolean, family: string, label: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      style={{ fontFamily: family }}
      className={`h-11 rounded-[var(--radius-input)] border px-4 text-[16px] ${
        selected ? 'border-accent ring-1 ring-accent' : 'border-[var(--color-l-line)]'
      }`}
    >
      {label}
    </button>
  )

  return (
    <fieldset className="mb-4" disabled={disabled}>
      <legend className="mb-2 text-[13px] font-semibold">Headline typeface</legend>
      <div className="flex flex-wrap gap-2">
        {button(value === null, FONT_STACKS[theme.tokens.fontDisplay], `${theme.name}’s own`, () =>
          onChange(null),
        )}
        {FACES.map((face) => (
          <span key={face.value}>
            {button(value === face.value, FONT_STACKS[face.value], face.label, () =>
              onChange(face.value),
            )}
          </span>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-[var(--color-l-text-mid)]">
        Used for the couple’s name, section headings and the wordmark. Body text stays as it is
        — it has to be readable on a phone at arm’s length.
      </p>
    </fieldset>
  )
}
