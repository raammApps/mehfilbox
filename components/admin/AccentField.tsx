'use client'

import { formatRatio, judgeAccent } from '@/lib/contrast'
import type { ThemeDefinition } from '@/themes/contract'
import { inkFor } from '@/themes/css'

/** Five curated presets plus a custom picker. Most operators will use a preset (doc 14 §5). */
export const ACCENT_PRESETS = [
  { value: '#d11a2a', label: 'Marquee red' },
  { value: '#c2410c', label: 'Ember' },
  { value: '#b8860b', label: 'Old gold' },
  { value: '#9d174d', label: 'Deep rose' },
  { value: '#1d6f5c', label: 'Emerald' },
] as const

/**
 * The accent, with its contrast gate (doc 08 `<ThemePicker>`), as one field.
 *
 * Contrast is validated **at pick time, in the UI**: a planner will hand over a brand pink that
 * is unreadable on the page, and they have to be told while they can still change it — not by a
 * build log they never see. One component for the wedding's branding, the studio's look and a
 * house style, because a second copy of a colour picker with a contrast gate in it is how one of
 * them quietly stops checking contrast (N-26).
 */
export function AccentField({
  accent,
  theme,
  onChange,
  disabled = false,
}: {
  accent: string
  /** Judged against *this theme's* page, not against black (D-35). */
  theme: ThemeDefinition
  onChange: (hex: string) => void
  disabled?: boolean
}) {
  const verdict = judgeAccent(accent, theme.tokens.surface0)
  const ink = inkFor(accent, accent === theme.tokens.accent ? theme.tokens.accentInk : '#ffffff')

  return (
    <fieldset className="mb-3" disabled={disabled}>
      <legend className="mb-2 text-[13px] font-semibold">Accent colour</legend>
      <div className="flex flex-wrap items-center gap-2">
        {ACCENT_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => onChange(preset.value)}
            aria-label={preset.label}
            aria-pressed={accent.toLowerCase() === preset.value}
            className={`h-9 w-9 rounded-full border-2 ${
              accent.toLowerCase() === preset.value
                ? 'border-[var(--color-l-text-hi)]'
                : 'border-transparent'
            }`}
            style={{ background: preset.value }}
          />
        ))}

        <label className="ms-2 inline-flex items-center gap-2 text-[13px]">
          Custom
          <input
            type="color"
            value={accent}
            onChange={(event) => onChange(event.target.value)}
            className="h-9 w-12 cursor-pointer rounded border border-[var(--color-l-line)]"
          />
        </label>
      </div>

      {/* The sample sits on the chosen theme's page, because that is where the button will sit. */}
      <div
        className="mt-3 flex items-center gap-3 rounded-[var(--radius-input)] p-3"
        style={{ background: theme.tokens.surface0 }}
      >
        <span
          className="inline-flex h-9 items-center rounded-[var(--radius-pill)] px-4 text-[14px] font-semibold"
          style={{ background: accent, color: ink }}
        >
          Play
        </span>
        <span className="text-[12px]" style={{ color: theme.tokens.textLo }}>
          {formatRatio(verdict.onSurface)} on the page · {formatRatio(verdict.inkOnAccent)} for
          button text
        </span>
      </div>

      {verdict.warning ? (
        <p role="alert" className="mt-2 text-[13px] text-[#a15c00]">
          {verdict.warning}
        </p>
      ) : null}
    </fieldset>
  )
}
