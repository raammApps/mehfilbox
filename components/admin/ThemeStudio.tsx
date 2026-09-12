'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatRatio, judgeTheme } from '@/lib/contrast'
import { posterDataUri, tileColours } from '@/lib/poster'
import {
  POSTER_PALETTES,
  THEME_BODY_FONTS,
  THEME_DISPLAY_FONTS,
  type CustomTheme,
  type ThemeDefinition,
  type ThemeTokens,
} from '@/themes/contract'
import { FONT_STACKS, themeCss } from '@/themes/css'
import { fromCustom } from '@/themes/registry'
import { ThemeSwatch } from './ThemeCards'

/**
 * Where a platform admin authors a theme (D-35, doc 16 §4).
 *
 * A theme is a token set, so the editor is a form over the tokens, a specimen painted by the same
 * `themeCss` the guest page uses, and the contrast verdict beside it — the same pairs the
 * built-in seven are held to, judged live so a failing colour is seen before Save refuses it.
 *
 * Starting from a built-in is the normal path: pick the nearest, change what differs, name it.
 */

type Draft = {
  id: string
  name: string
  description: string
  tokens: ThemeTokens
  enabled: boolean
}

type Mode = { kind: 'new' } | { kind: 'edit'; id: string }

const COLOURS: { key: keyof ThemeTokens & string; label: string; hint: string }[] = [
  { key: 'surface0', label: 'Page', hint: 'Behind everything' },
  { key: 'surface1', label: 'Card', hint: 'Posters, the modal' },
  { key: 'surface2', label: 'Raised card', hint: 'Inputs, hover' },
  { key: 'surface3', label: 'Lines', hint: 'Borders, dividers' },
  { key: 'textHi', label: 'Headings', hint: 'Names, titles' },
  { key: 'textMid', label: 'Body text', hint: 'Most words' },
  { key: 'textLo', label: 'Small text', hint: 'Dates, eyebrows' },
  { key: 'accent', label: 'Accent', hint: 'Play, the primary button' },
  { key: 'accentInk', label: 'Text on the accent', hint: 'The button label' },
]

const RADII: { key: 'radiusCard' | 'radiusModal' | 'radiusInput'; label: string; max: number }[] = [
  { key: 'radiusCard', label: 'Cards', max: 40 },
  { key: 'radiusModal', label: 'Modal', max: 48 },
  { key: 'radiusInput', label: 'Inputs', max: 24 },
]

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function draftFrom(theme: ThemeDefinition, mode: Mode): Draft {
  return {
    id: mode.kind === 'edit' ? theme.id : '',
    name: mode.kind === 'edit' ? theme.name : '',
    description: mode.kind === 'edit' ? theme.description : '',
    tokens: { ...theme.tokens },
    enabled: theme.enabled,
  }
}

export function ThemeStudio({
  builtIn,
  custom,
}: {
  builtIn: readonly ThemeDefinition[]
  custom: CustomTheme[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>({ kind: 'new' })
  const [draft, setDraft] = useState<Draft>(() => draftFrom(builtIn[0]!, { kind: 'new' }))
  const [idTouched, setIdTouched] = useState(false)
  // Hex typed by hand, kept apart from the token until it parses — otherwise every half-typed
  // value would be rejected or, worse, painted.
  const [hexText, setHexText] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const verdict = judgeTheme(draft.tokens)

  const startFrom = (theme: ThemeDefinition, next: Mode) => {
    setMode(next)
    setDraft(draftFrom(theme, next))
    setIdTouched(next.kind === 'edit')
    setHexText({})
    setStatus('idle')
    setError(null)
    setFieldErrors({})
  }

  const setToken = <K extends keyof ThemeTokens>(key: K, value: ThemeTokens[K]) => {
    setDraft((current) => ({ ...current, tokens: { ...current.tokens, [key]: value } }))
    setStatus('idle')
  }

  const save = async () => {
    setStatus('saving')
    setError(null)
    setFieldErrors({})
    const isNew = mode.kind === 'new'
    try {
      const response = await fetch(
        isNew ? '/api/admin/platform/themes' : `/api/admin/platform/themes/${mode.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(
            isNew
              ? draft
              : {
                  name: draft.name,
                  description: draft.description,
                  tokens: draft.tokens,
                  enabled: draft.enabled,
                },
          ),
        },
      )
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string; fields?: Record<string, string> }
        } | null
        setFieldErrors(body?.error?.fields ?? {})
        throw new Error(body?.error?.message ?? `Request failed (${response.status})`)
      }
      setStatus('saved')
      if (isNew) setMode({ kind: 'edit', id: draft.id })
      router.refresh()
    } catch (cause) {
      setStatus('error')
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    }
  }

  const toggle = async (theme: CustomTheme) => {
    const response = await fetch(`/api/admin/platform/themes/${theme.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !theme.enabled }),
    })
    if (response.ok) {
      if (mode.kind === 'edit' && mode.id === theme.id) {
        setDraft((current) => ({ ...current, enabled: !theme.enabled }))
      }
      router.refresh()
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(280px,360px)_1fr]">
      <section aria-label="Themes">
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--color-l-text-mid)]">
          Yours {custom.length > 0 ? `(${custom.length})` : ''}
        </h2>
        {custom.length === 0 ? (
          <p className="mb-4 rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-6 text-center text-[13px] text-[var(--color-l-text-mid)]">
            None yet. Start from one of the built-in seven on the right.
          </p>
        ) : (
          <ul className="mb-4 flex flex-col gap-2">
            {custom.map((theme) => {
              const definition = fromCustom(theme)
              const editing = mode.kind === 'edit' && mode.id === theme.id
              return (
                <li
                  key={theme.id}
                  className={`rounded-[var(--radius-card)] border bg-white p-2 ${
                    editing ? 'border-accent ring-1 ring-accent' : 'border-[var(--color-l-line)]'
                  } ${theme.enabled ? '' : 'opacity-70'}`}
                >
                  <ThemeSwatch theme={definition} />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[14px] font-semibold">
                      {theme.name}
                      {!theme.enabled ? (
                        <span className="ms-1.5 text-[11px] font-normal text-[var(--color-l-text-mid)]">
                          withdrawn
                        </span>
                      ) : null}
                    </span>
                    <span className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => startFrom(definition, { kind: 'edit', id: theme.id })}
                        className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggle(theme)}
                        className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold"
                      >
                        {theme.enabled ? 'Withdraw' : 'Restore'}
                      </button>
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}

        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--color-l-text-mid)]">
          Built in
        </h2>
        <ul className="flex flex-col gap-2">
          {builtIn.map((theme) => (
            <li
              key={theme.id}
              className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-2"
            >
              <span className="w-[112px] shrink-0">
                <ThemeSwatch theme={theme} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">{theme.name}</span>
                <span className="block text-[12px] leading-snug text-[var(--color-l-text-mid)]">
                  {theme.description}
                </span>
              </span>
              <button
                type="button"
                onClick={() => startFrom(theme, { kind: 'new' })}
                className="h-8 shrink-0 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 text-[12px] font-semibold"
              >
                Start from this
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label={mode.kind === 'new' ? 'New theme' : `Editing ${draft.name}`} className="min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px] font-semibold">
            {mode.kind === 'new' ? 'New theme' : `Editing ${draft.name}`}
          </h2>
          {mode.kind === 'edit' ? (
            <p className="text-[12px] text-[var(--color-l-text-mid)]">
              Saving repaints every wedding on this theme. Withdraw it instead if that is not what
              you mean.
            </p>
          ) : null}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <form
            className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <label className="text-[13px]">
                <span className="mb-1 block font-semibold">Name</span>
                <input
                  value={draft.name}
                  onChange={(event) => {
                    const name = event.target.value
                    setDraft((current) => ({
                      ...current,
                      name,
                      id: mode.kind === 'new' && !idTouched ? slugify(name) : current.id,
                    }))
                    setStatus('idle')
                  }}
                  required
                  className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
                />
              </label>
              <label className="text-[13px]">
                <span className="mb-1 block font-semibold">Id</span>
                <input
                  value={draft.id}
                  onChange={(event) => {
                    setIdTouched(true)
                    setDraft((current) => ({ ...current, id: slugify(event.target.value) }))
                  }}
                  disabled={mode.kind === 'edit'}
                  required
                  pattern="[a-z0-9]+(-[a-z0-9]+)*"
                  className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 font-mono text-[13px] disabled:bg-[var(--color-l-surface-2)]"
                />
                {fieldErrors.id ? (
                  <span className="mt-1 block text-[12px] text-[var(--color-error)]">{fieldErrors.id}</span>
                ) : (
                  <span className="mt-1 block text-[12px] text-[var(--color-l-text-mid)]">
                    Stored on every wedding that picks it, so it cannot change later.
                  </span>
                )}
              </label>
            </div>

            <label className="mb-4 block text-[13px]">
              <span className="mb-1 block font-semibold">One line for the picker</span>
              <input
                value={draft.description}
                onChange={(event) => {
                  const description = event.target.value
                  setDraft((current) => ({ ...current, description }))
                  setStatus('idle')
                }}
                maxLength={160}
                placeholder="The feel, not the mechanics"
                className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
              />
            </label>

            <fieldset className="mb-4">
              <legend className="mb-2 text-[13px] font-semibold">Colours</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {COLOURS.map((colour) => {
                  const value = draft.tokens[colour.key] as string
                  return (
                    <label key={colour.key} className="flex items-center gap-2 text-[12px]">
                      <input
                        type="color"
                        aria-label={colour.label}
                        value={value}
                        onChange={(event) => {
                          setToken(colour.key, event.target.value as never)
                          setHexText((current) => ({ ...current, [colour.key]: '' }))
                        }}
                        className="h-9 w-10 shrink-0 cursor-pointer rounded border border-[var(--color-l-line)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{colour.label}</span>
                        <input
                          aria-label={`${colour.label} hex`}
                          value={hexText[colour.key] || value}
                          onChange={(event) => {
                            const text = event.target.value.trim()
                            setHexText((current) => ({ ...current, [colour.key]: text }))
                            if (/^#[0-9a-fA-F]{6}$/.test(text)) setToken(colour.key, text.toLowerCase() as never)
                          }}
                          onBlur={() => setHexText((current) => ({ ...current, [colour.key]: '' }))}
                          className="h-7 w-full rounded border border-[var(--color-l-line)] px-1.5 font-mono text-[12px]"
                        />
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-1 text-[13px] font-semibold">Scheme</legend>
                <div className="flex gap-2">
                  {(['dark', 'light'] as const).map((scheme) => (
                    <label
                      key={scheme}
                      className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[14px] has-[:checked]:border-[var(--color-accent)]"
                    >
                      <input
                        type="radio"
                        name="colorScheme"
                        checked={draft.tokens.colorScheme === scheme}
                        onChange={() => setToken('colorScheme', scheme)}
                      />
                      {scheme === 'dark' ? 'Dark' : 'Light'}
                    </label>
                  ))}
                </div>
                <p className="mt-1 text-[12px] text-[var(--color-l-text-mid)]">
                  Tells the browser which way its own controls should go.
                </p>
              </fieldset>

              <label className="text-[13px]">
                <span className="mb-1 block font-semibold">Card edge</span>
                <select
                  value={draft.tokens.cardEdge}
                  onChange={(event) => setToken('cardEdge', event.target.value as ThemeTokens['cardEdge'])}
                  className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-2 text-[14px]"
                >
                  <option value="hairline">Hairline in the accent</option>
                  <option value="shadow">Soft shadow</option>
                  <option value="none">None</option>
                </select>
              </label>
            </div>

            <fieldset className="mb-4">
              <legend className="mb-1 text-[13px] font-semibold">Corners</legend>
              <div className="grid grid-cols-3 gap-2">
                {RADII.map((radius) => (
                  <label key={radius.key} className="text-[12px]">
                    <span className="mb-1 block">{radius.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={radius.max}
                      value={draft.tokens[radius.key]}
                      onChange={(event) =>
                        setToken(
                          radius.key,
                          Math.max(0, Math.min(radius.max, Number.parseInt(event.target.value || '0', 10))),
                        )
                      }
                      className="h-9 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-2 text-[14px]"
                    />
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <label className="text-[13px]">
                <span className="mb-1 block font-semibold">Headline face</span>
                <select
                  value={draft.tokens.fontDisplay}
                  onChange={(event) => setToken('fontDisplay', event.target.value as ThemeTokens['fontDisplay'])}
                  className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-2 text-[14px]"
                >
                  {THEME_DISPLAY_FONTS.map((face) => (
                    <option key={face} value={face}>
                      {face}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px]">
                <span className="mb-1 block font-semibold">Body face</span>
                <select
                  value={draft.tokens.fontBody}
                  onChange={(event) => setToken('fontBody', event.target.value as ThemeTokens['fontBody'])}
                  className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-2 text-[14px]"
                >
                  {THEME_BODY_FONTS.map((face) => (
                    <option key={face} value={face}>
                      {face}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[13px]">
                <span className="mb-1 block font-semibold">Poster palette</span>
                <select
                  value={draft.tokens.posterPalette}
                  onChange={(event) => setToken('posterPalette', event.target.value as ThemeTokens['posterPalette'])}
                  className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-2 text-[14px]"
                >
                  {POSTER_PALETTES.map((palette) => (
                    <option key={palette} value={palette}>
                      {palette}
                    </option>
                  ))}
                </select>
                <span className="mt-1 block text-[12px] text-[var(--color-l-text-mid)]">
                  Artwork behind films with no poster.
                </span>
              </label>
            </div>

            {/* The gate, live. Save refuses the same pairs; showing them here is the difference between
                a form that teaches and one that says "invalid". */}
            <ul aria-label="Contrast" className="mb-4 grid gap-1 text-[12px] sm:grid-cols-2">
              {verdict.pairs.map((pair) => {
                const ok = pair.ratio >= pair.min
                return (
                  <li key={pair.name} className={ok ? 'text-[var(--color-l-text-mid)]' : 'font-semibold text-[var(--color-error)]'}>
                    <span aria-hidden>{ok ? '✓' : '✗'}</span> {pair.name} · {formatRatio(pair.ratio)}
                    {ok ? '' : ` (needs ${pair.min}:1)`}
                  </li>
                )
              })}
            </ul>

            {error ? (
              <p role="alert" className="mb-3 text-[13px] text-[var(--color-error)]">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={status === 'saving' || !verdict.ok || !draft.name || !draft.id}
                className="h-11 rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink disabled:opacity-60"
              >
                {status === 'saving' ? 'Saving…' : mode.kind === 'new' ? 'Add this theme' : 'Save changes'}
              </button>
              {status === 'saved' ? (
                <span className="text-[13px] text-[var(--color-l-text-mid)]">
                  Saved. Every studio&rsquo;s picker has it now.
                </span>
              ) : !verdict.ok ? (
                <span className="text-[13px] text-[var(--color-error)]">
                  Fix the contrast above first.
                </span>
              ) : null}
            </div>
          </form>

          <ThemeSpecimen tokens={draft.tokens} name={draft.name || 'Untitled'} />
        </div>
      </section>
    </div>
  )
}

/**
 * The theme on a page-shaped sample, painted by `themeCss` exactly as a guest page is — so what
 * this shows and what a guest gets cannot drift. Not the full demo bundle: a whole catalogue in
 * a side column is a preview nobody can read, and the tokens are all that vary.
 */
function ThemeSpecimen({ tokens, name }: { tokens: ThemeTokens; name: string }) {
  const tiles = tileColours(tokens.posterPalette)
  return (
    <div
      data-theme-specimen
      className="overflow-hidden rounded-[var(--radius-modal)] border border-[var(--color-l-line)]"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <style>{themeCss(tokens, {}, '[data-theme-specimen]')}</style>
      <div className="flex items-center justify-between px-4 py-3">
        <span
          className="text-[15px] font-extrabold tracking-tight"
          style={{ color: 'var(--color-text-hi)', fontFamily: 'var(--font-display)' }}
        >
          {name}
        </span>
        <span aria-hidden className="h-7 w-7 rounded-full" style={{ background: tiles[0] }} />
      </div>
      <div className="px-4 pb-4">
        <h3
          className="text-[26px] font-extrabold leading-none tracking-tight"
          style={{ color: 'var(--color-text-hi)', fontFamily: 'var(--font-display)' }}
        >
          Aanya &amp; Vikram
        </h3>
        <p className="mt-2 text-[14px]" style={{ color: 'var(--color-text-mid)' }}>
          Three days in Jaipur, and the films that came out of them.
        </p>
        <p
          className="mt-1 text-[11px] uppercase tracking-[0.09em]"
          style={{ color: 'var(--color-text-lo)' }}
        >
          14 February 2026 · Presented by Kalyanam Weddings
        </p>
        <div className="mt-3 flex gap-2">
          <span
            className="inline-flex h-9 items-center rounded-[var(--radius-pill)] px-4 text-[14px] font-semibold"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-ink)' }}
          >
            ▶ Play
          </span>
          <span
            className="inline-flex h-9 items-center rounded-[var(--radius-pill)] px-4 text-[14px] font-semibold"
            style={{ border: '1px solid var(--color-text-lo)', color: 'var(--color-text-hi)' }}
          >
            More
          </span>
        </div>
        <p
          className="mt-4 text-[11px] font-bold uppercase tracking-[0.09em]"
          style={{ color: 'var(--color-text-lo)' }}
        >
          The films
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {['the-baraat', 'the-pheras', 'sangeet-night'].map((slug) => (
            <span
              key={slug}
              className="edge block overflow-hidden"
              style={{
                borderRadius: 'var(--radius-card)',
                border: 'var(--edge)',
                background: 'var(--color-surface-1)',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a data URI, no optimiser needed */}
              <img
                src={posterDataUri({ slug, label: '', width: 320, height: 180, palette: tokens.posterPalette })}
                alt=""
                className="block aspect-video w-full object-cover"
              />
              <span
                className="block truncate px-2 py-1.5 text-[11px] font-semibold"
                style={{ color: 'var(--color-text-hi)', fontFamily: FONT_STACKS[tokens.fontBody] }}
              >
                {slug.replace(/-/g, ' ')}
              </span>
            </span>
          ))}
        </div>
        <div
          className="mt-3 rounded-[var(--radius-input)] px-3 py-2 text-[13px]"
          style={{ background: 'var(--color-surface-2)', color: 'var(--color-text-mid)' }}
        >
          A raised card, with body text on it.
        </div>
      </div>
    </div>
  )
}
