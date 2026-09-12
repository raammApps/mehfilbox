'use client'

import { useEffect, useState } from 'react'
import type { Catalogue } from '@/lib/schema'
import type { ThemeDefinition } from '@/themes/contract'
import { DEFAULT_THEME_ID, builtInThemes, themeFrom } from '@/themes/registry'
import { AccentField } from './AccentField'
import { SaveState } from './SaveState'
import { ThemeCards } from './ThemeCards'
import { TypefaceField, type DisplayFont } from './TypefaceField'

/**
 * Contrast is validated **at pick time, in the UI** (doc 08 `<ThemePicker>`) — see `AccentField`,
 * which this panel, the studio's look and a house style all share.
 */
/**
 * Where this panel writes (N-26).
 *
 * The same fields serve a wedding and the studio itself, so the panel takes a target rather than
 * being copied. A second copy of a colour picker with a contrast gate in it is how one of them
 * quietly stops checking contrast.
 */
export type BrandingTarget =
  /** A wedding's *draft* branding — it reaches the couple at Publish (N-56). */
  | { kind: 'catalogue'; catalogueId: string }
  /** The studio's own, which every new wedding is created from. Live immediately: it is a setting. */
  | { kind: 'studio' }

export function ThemePicker({
  catalogue,
  target,
  onPreview,
  themes = builtInThemes(),
}: {
  /** The values to start from. For the studio, an org's branding wrapped in a bare object. */
  catalogue: Pick<Catalogue, 'id' | 'branding' | 'draftBranding'>
  target?: BrandingTarget
  /** Called on every edit so the preview follows the picker rather than the last save. */
  onPreview?: (branding: Catalogue['branding']) => void
  /**
   * Every theme that exists, withdrawn ones included (D-35). The panel offers the enabled ones
   * plus whichever this branding is already on, so a wedding on a withdrawn theme still sees its
   * own choice rather than a silently different one.
   */
  themes?: readonly ThemeDefinition[]
}) {
  /**
   * Primitives, not an object.
   *
   * The autosave effect below depends on where it writes, and an object rebuilt each render would
   * re-fire it on every render — the same shape of bug `carriedOver` exists to avoid a few lines
   * down, and the one that made Publish appear to do nothing (N-56).
   */
  const targetKind = target?.kind ?? 'catalogue'
  const targetId = target && target.kind === 'studio' ? null : (target?.catalogueId ?? catalogue.id)
  /**
   * Seeded from the draft when there is one (N-56). An operator who set a colour yesterday and
   * has not published yet must come back to their colour, not to the one the couple can see —
   * otherwise the panel quietly discards unpublished work every time the page reloads.
   */
  const pending = catalogue.draftBranding ?? catalogue.branding
  const [theme, setTheme] = useState(pending.theme ?? DEFAULT_THEME_ID)
  const [accent, setAccent] = useState(pending.accent ?? '#d11a2a')
  const [presentedBy, setPresentedBy] = useState(pending.presentedBy ?? '')
  const [logoUrl, setLogoUrl] = useState(pending.logoUrl ?? '')
  // `null` is "the theme's own face" (D-35): a Classic wedding gets the serif unless a studio
  // insists on its own. Written as an absent field, so the theme decides at render time.
  const [displayFont, setDisplayFont] = useState<DisplayFont | null>(pending.displayFont ?? null)
  // On unless switched off (D-41): absent in a row written before the field existed means on.
  const [platformCredit, setPlatformCredit] = useState(pending.platformCredit !== false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [touched, setTouched] = useState(false)

  const selected = themeFrom({ theme }, themes)
  const offered = themes.filter((candidate) => candidate.enabled || candidate.id === theme)

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
    const {
      accent: _a,
      presentedBy: _p,
      logoUrl: _l,
      displayFont: _d,
      platformCredit: _c,
      theme: _t,
      ...rest
    } = pending
    return rest
  })

  // Report upward on every change, not just on save: an accent the operator is still choosing
  // should already be visible in the preview beside them.
  useEffect(() => {
    if (!touched) return
    onPreview?.({
      ...carriedOver,
      theme,
      accent,
      presentedBy: presentedBy || undefined,
      logoUrl: logoUrl || undefined,
      displayFont: displayFont ?? undefined,
      platformCredit,
    })
  }, [theme, accent, presentedBy, logoUrl, displayFont, platformCredit, touched, onPreview, carriedOver])

  useEffect(() => {
    if (!touched) return
    setSaveState('saving')

    const timer = window.setTimeout(async () => {
      try {
        const branding = {
          theme,
          accent,
          presentedBy: presentedBy || undefined,
          logoUrl: logoUrl || undefined,
          displayFont: displayFont ?? undefined,
          platformCredit,
        }
        const response = await fetch(
          targetKind === 'studio' ? '/api/admin/studio' : `/api/admin/catalogues/${targetId}`,
          {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            /**
             * A wedding's branding is a **draft** — it reaches the couple at Publish (N-56).
             * The studio's own is a setting and takes effect at once (D-31); nothing is on a
             * guest's screen because of it until a wedding is created from it.
             *
             * Sent whole either way, because the column is replaced rather than merged — omitting
             * a field here is how it gets cleared.
             */
            body: JSON.stringify(
              targetKind === 'studio' ? { branding } : { draftBranding: branding },
            ),
          },
        )
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
  }, [theme, accent, presentedBy, logoUrl, displayFont, platformCredit, touched, targetKind, targetId])

  return (
    <section
      aria-label="Branding"
      className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
    >
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--color-l-text-mid)]">
        Branding
      </h2>

      {/*
        The theme first (D-35): it decides the page, the cards, the type and the poster palette,
        and everything below sits on top of it. A studio choosing an accent before a theme would
        be choosing it against the wrong background.
      */}
      <fieldset className="mb-4">
        <legend className="mb-2 text-[13px] font-semibold">Theme</legend>
        <ThemeCards
          themes={offered}
          value={theme}
          onChange={(id) => {
            setTheme(id)
            setTouched(true)
          }}
        />
        <p className="mt-2 text-[12px] text-[var(--color-l-text-mid)]">
          The whole page follows it — background, cards, type and the artwork behind films with
          no poster. Your colour and typeface below sit on top.
        </p>
      </fieldset>

      <TypefaceField
        value={displayFont}
        theme={selected}
        onChange={(face) => {
          setDisplayFont(face)
          setTouched(true)
        }}
      />

      <AccentField
        accent={accent}
        theme={selected}
        onChange={(hex) => {
          setAccent(hex)
          setTouched(true)
        }}
      />

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
        The one place the product may name itself in front of a guest (D-41). On by default; a
        studio reselling to a client who must not see a supplier turns it off here, once, and every
        wedding created afterwards inherits the choice like the rest of the branding.
      */}
      <label className="mb-4 flex cursor-pointer items-start gap-3 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2.5">
        <input
          type="checkbox"
          checked={platformCredit}
          onChange={(event) => {
            setPlatformCredit(event.target.checked)
            setTouched(true)
          }}
          className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
        />
        <span className="text-[14px]">
          Show &ldquo;Made with Mehfilbox&rdquo; in the footer
          <span className="block text-[12px] text-[var(--color-l-text-mid)]">
            A small line at the foot of the page, linking back to us. Turn it off if your client
            should not see a supplier&rsquo;s name.
          </span>
        </span>
      </label>

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
      {/*
        The two targets save into different worlds, so they cannot share one sentence. A wedding's
        branding is a draft that reaches the couple at Publish; the studio's is a setting with
        nobody's page in front of it yet — telling a studio their colour "reaches the couple when
        you publish" on a screen with no Publish on it is just untrue.
      */}
      {saveState === 'idle' ? (
        <p className="text-[13px] text-[var(--color-l-text-mid)]">
          {targetKind === 'studio'
            ? 'Changes save as you make them. Every new wedding starts from this.'
            : 'Changes save as you make them, and reach the couple when you publish.'}
        </p>
      ) : (
        <SaveState
          status={saveState}
          savedLabel={targetKind === 'studio' ? 'Saved' : 'Saved as draft'}
        />
      )}

      <p className="mt-3 text-[12px] text-[var(--color-l-text-mid)]">
        Every theme has been checked so its text reads on its own page. Your accent is checked
        against the theme you chose, above.
      </p>
    </section>
  )
}
