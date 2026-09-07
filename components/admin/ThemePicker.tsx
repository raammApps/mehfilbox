'use client'

import { useEffect, useState } from 'react'
import { formatRatio, judgeAccent } from '@/lib/contrast'
import { SaveState } from './SaveState'
import type { Catalogue } from '@/lib/schema'

/** Five curated presets plus a custom picker. Most operators will use a preset (doc 14 §5). */
/** Only faces `lib/fonts.ts` actually loads; see `DISPLAY_FONTS`. */
const FACES = [
  { value: 'archivo' as const, label: 'Archivo', stack: "var(--font-archivo), Impact, sans-serif" },
  { value: 'mukta' as const, label: 'Mukta', stack: "var(--font-mukta), sans-serif" },
  { value: 'inter' as const, label: 'Inter', stack: "var(--font-inter), system-ui, sans-serif" },
]

const PRESETS = [
  { value: '#d11a2a', label: 'Marquee red' },
  { value: '#c2410c', label: 'Ember' },
  { value: '#b8860b', label: 'Old gold' },
  { value: '#9d174d', label: 'Deep rose' },
  { value: '#1d6f5c', label: 'Emerald' },
] as const

/**
 * Contrast is validated **at pick time, in the UI** (doc 08 `<ThemePicker>`).
 *
 * A planner will hand over a brand pink that is unreadable on black. They have to be told
 * while they can still change it — not by a build log they never see.
 */
export function ThemePicker({
  catalogue,
  onPreview,
}: {
  catalogue: Catalogue
  /** Called on every edit so the preview follows the picker rather than the last save. */
  onPreview?: (branding: Catalogue['branding']) => void
}) {
  /**
   * Seeded from the draft when there is one (N-56). An operator who set a colour yesterday and
   * has not published yet must come back to their colour, not to the one the couple can see —
   * otherwise the panel quietly discards unpublished work every time the page reloads.
   */
  const pending = catalogue.draftBranding ?? catalogue.branding
  const [accent, setAccent] = useState(pending.accent ?? '#d11a2a')
  const [presentedBy, setPresentedBy] = useState(pending.presentedBy ?? '')
  const [logoUrl, setLogoUrl] = useState(pending.logoUrl ?? '')
  const [displayFont, setDisplayFont] = useState(pending.displayFont ?? 'archivo')
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [touched, setTouched] = useState(false)

  const verdict = judgeAccent(accent)

  /**
   * Autosave, debounced — the same model the sections beside this panel already use.
   *
   * It used to need its own button while everything else on the screen saved itself, so an
   * operator would type "Presented by", press the large Publish button, and lose it: Publish
   * copied draft sections and never touched branding. Two save models in one screen means
   * neither is learnable, and the one that silently discarded work was the one that looked
   * final.
   *
   * That is fully resolved now (N-56): this writes `draft_branding` and Publish promotes it, so
   * the panel and the sections beside it save the same way *and* reach the couple the same way.
   *
   * `touched` keeps the first render from writing the values it just read back.
   */
  /**
   * The fields this panel does not edit, captured once.
   *
   * Depending on `catalogue.branding` here was a live wire: Publish promotes the draft, which
   * changes that prop, which re-ran this effect and the autosave below — recreating the draft
   * milliseconds after it was promoted, so the console announced "guests are still seeing the
   * last published version" the instant after a successful publish. Publish appeared to do
   * nothing at all. Nothing outside this panel edits these fields while it is open, so reading
   * them once is both correct and the only stable option.
   */
  const [carriedOver] = useState(() => {
    const { accent: _a, presentedBy: _p, logoUrl: _l, displayFont: _d, ...rest } = pending
    return rest
  })

  // Report upward on every change, not just on save: an accent the operator is still choosing
  // should already be visible in the preview beside them.
  useEffect(() => {
    if (!touched) return
    onPreview?.({
      ...carriedOver,
      accent,
      presentedBy: presentedBy || undefined,
      logoUrl: logoUrl || undefined,
      displayFont,
    })
  }, [accent, presentedBy, logoUrl, displayFont, touched, onPreview, carriedOver])

  useEffect(() => {
    if (!touched) return
    setSaveState('saving')

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/catalogues/${catalogue.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            // Draft, not live (N-56): the couple keeps seeing the published branding until the
            // operator publishes. Sent whole every time, because the column is replaced rather
            // than merged — omitting a field here is how it gets cleared.
            draftBranding: {
              accent,
              presentedBy: presentedBy || undefined,
              logoUrl: logoUrl || undefined,
              displayFont,
            },
          }),
        })
        setSaveState(response.ok ? 'saved' : 'error')
        /**
         * Clear the flag, exactly as the sections' autosave clears `dirty` after writing.
         *
         * Without this the panel is permanently "touched", so the effect re-saves on any
         * dependency change — including `catalogue.branding`, which *changes when Publish
         * promotes the draft*. The result was a publish that appeared to do nothing: it
         * succeeded, the refreshed props re-fired this effect, the draft was written again and
         * the page went straight back to "guests are still seeing the last published version".
         */
        if (response.ok) setTouched(false)
      } catch {
        setSaveState('error')
      }
    }, 700)

    return () => window.clearTimeout(timer)
  }, [accent, presentedBy, logoUrl, displayFont, touched, catalogue.id])

  return (
    <section
      aria-label="Branding"
      className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
    >
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--color-l-text-mid)]">
        Branding
      </h2>

      <fieldset className="mb-4">
        <legend className="mb-2 text-[13px] font-semibold">Headline typeface</legend>
        <div className="flex flex-wrap gap-2">
          {FACES.map((face) => (
            <button
              key={face.value}
              type="button"
              onClick={() => {
                setDisplayFont(face.value)
                setTouched(true)
              }}
              aria-pressed={displayFont === face.value}
              // Each button is set in the face it selects, because the only question an
              // operator is really asking is "what does it look like".
              style={{ fontFamily: face.stack }}
              className={`h-11 rounded-[var(--radius-input)] border px-4 text-[16px] ${
                displayFont === face.value
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-[var(--color-l-line)]'
              }`}
            >
              {face.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[var(--color-l-text-mid)]">
          Used for the couple’s name, section headings and the wordmark. Body text stays as it is
          — it has to be readable on a phone at arm’s length.
        </p>
      </fieldset>

      <fieldset className="mb-3">
        <legend className="mb-2 text-[13px] font-semibold">Accent colour</legend>
        <div className="flex flex-wrap items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => {
                setAccent(preset.value)
                setTouched(true)
              }}
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
              onChange={(event) => {
                setAccent(event.target.value)
                setTouched(true)
              }}
              className="h-9 w-12 cursor-pointer rounded border border-[var(--color-l-line)]"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-[var(--radius-input)] bg-[#0c0c0d] p-3">
          <span
            className="inline-flex h-9 items-center rounded-[var(--radius-pill)] px-4 text-[14px] font-semibold text-white"
            style={{ background: accent }}
          >
            Play
          </span>
          <span className="text-[12px]" style={{ color: '#93939a' }}>
            {formatRatio(verdict.onSurface)} on black · {formatRatio(verdict.inkOnAccent)} for
            button text
          </span>
        </div>

        {verdict.warning ? (
          <p role="alert" className="mt-2 text-[13px] text-[#a15c00]">
            {verdict.warning}
          </p>
        ) : null}
      </fieldset>

      <label className="mb-1 block text-[13px] font-semibold" htmlFor="presented-by">
        Presented by
      </label>
      <input
        id="presented-by"
        type="text"
        value={presentedBy}
        placeholder="Your company name"
        onChange={(event) => {
          setPresentedBy(event.target.value)
          setTouched(true)
        }}
        className="mb-3 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
      />

      <label className="mb-1 block text-[13px] font-semibold" htmlFor="logo-url">
        Logo URL
      </label>
      <input
        id="logo-url"
        type="url"
        value={logoUrl}
        placeholder="https://…"
        onChange={(event) => {
          setLogoUrl(event.target.value)
          setTouched(true)
        }}
        className="mb-4 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
      />

      {/*
        No button: branding saves itself, like the sections beside it. A button here implied the
        rest of the screen needed one too, and its absence elsewhere then read as "not saved".
      */}
      {/*
        The shared component rather than a fourth hand-rolled copy — which is what this was, and
        exactly the drift N-30 introduced `SaveState` to stop. It also said "Saved", which stopped
        being true when branding became a draft (N-56): saved and *shown to the couple* are now
        different things here, as they always were for the sections beside it.
      */}
      {saveState === 'idle' ? (
        <p className="text-[13px] text-[var(--color-l-text-mid)]">
          Changes save as you make them, and reach the couple when you publish.
        </p>
      ) : (
        <SaveState status={saveState} savedLabel="Saved as draft" />
      )}

      <p className="mt-3 text-[12px] text-[var(--color-l-text-mid)]">
        The near-black background is fixed across every catalogue. It is the thing being bought.
      </p>
    </section>
  )
}
