'use client'

import type { ThemeDefinition } from '@/themes/contract'
import { FONT_STACKS } from '@/themes/css'

/**
 * The theme choice, as swatches (D-35) — used by the customizer's branding panel, the studio's
 * look and the wizard, so the three agree on what a theme looks like before it is applied.
 *
 * Each card is painted from the theme's own tokens: the page, a card on it, a heading, a line of
 * body text and the accent pill. Small, but enough to tell Carnival from Classic at a glance, which
 * is the whole question a studio is asking.
 */
export function ThemeCards({
  themes,
  value,
  onChange,
  name = 'theme',
}: {
  themes: readonly ThemeDefinition[]
  value: string
  onChange: (id: string) => void
  /** The radio group's name — the wizard already has a `template` group on the same step. */
  name?: string
}) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {themes.map((theme) => {
        const chosen = theme.id === value
        return (
          <li key={theme.id}>
            <label
              className={`flex h-full cursor-pointer flex-col rounded-[var(--radius-card)] border-2 bg-white p-2 transition-colors ${
                chosen
                  ? 'border-[var(--color-accent)]'
                  : 'border-[var(--color-l-line)] hover:border-[var(--color-l-text-mid)]'
              }`}
            >
              <input
                type="radio"
                name={name}
                value={theme.id}
                checked={chosen}
                onChange={() => onChange(theme.id)}
                className="sr-only"
              />
              <ThemeSwatch theme={theme} />
              <span className="mt-2 flex items-center gap-1.5 text-[14px] font-semibold">
                {theme.name}
                {theme.source === 'custom' ? (
                  <span className="rounded-[var(--radius-pill)] bg-[var(--color-l-surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-l-text-mid)]">
                    Yours
                  </span>
                ) : null}
                {!theme.enabled ? (
                  <span className="text-[11px] font-normal text-[var(--color-l-text-mid)]">
                    (withdrawn)
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 text-[12px] leading-snug text-[var(--color-l-text-mid)]">
                {theme.description}
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

/** A theme in miniature, from its own tokens. Decorative — the name beside it is the label. */
export function ThemeSwatch({ theme }: { theme: ThemeDefinition }) {
  const t = theme.tokens
  return (
    <span
      aria-hidden
      className="block overflow-hidden"
      style={{ background: t.surface0, borderRadius: Math.min(t.radiusCard, 12), padding: 10 }}
    >
      <span
        className="block"
        style={{
          background: t.surface1,
          borderRadius: Math.min(t.radiusCard, 10),
          border: t.cardEdge === 'none' ? '1px solid transparent' : `1px solid ${t.surface3}`,
          boxShadow: t.cardEdge === 'shadow' ? '0 6px 16px -8px rgba(0,0,0,.3)' : undefined,
          padding: '8px 10px',
        }}
      >
        <span
          className="block truncate text-[15px] font-extrabold leading-tight"
          style={{ color: t.textHi, fontFamily: FONT_STACKS[t.fontDisplay] }}
        >
          Aanya &amp; Vikram
        </span>
        <span className="mt-1 block h-1.5 w-2/3 rounded-full" style={{ background: t.textMid, opacity: 0.55 }} />
        <span className="mt-1 block h-1.5 w-1/2 rounded-full" style={{ background: t.textLo, opacity: 0.45 }} />
        <span
          className="mt-2 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold"
          style={{ background: t.accent, color: t.accentInk }}
        >
          Play
        </span>
      </span>
    </span>
  )
}
