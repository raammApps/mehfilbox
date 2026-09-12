'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { TEMPLATES } from '@/lib/admin/templates'
import type { Branding, Locale, Preset } from '@/lib/schema'
import type { ThemeDefinition } from '@/themes/contract'
import { DEFAULT_THEME_ID, themeFrom } from '@/themes/registry'
import { AccentField } from './AccentField'
import { TemplateThumbnail } from './TemplateThumbnail'
import { ThemeCards } from './ThemeCards'
import { TypefaceField, type DisplayFont } from './TypefaceField'

/**
 * One house style (D-36): the five decisions a studio makes the same way every time, saved once.
 *
 * The branding fields are the same components the wedding's panel and the studio's look use —
 * the accent's contrast gate included — and the theme cards are the wizard's. A style that a
 * published wedding was made from arrives frozen: the look is shown, disabled, with the one way
 * forward on top of it.
 */
export function HouseStyleEditor({
  preset,
  themes,
  frozenCount,
  studioBranding,
  studioLocale,
}: {
  /** `null` for a new style. */
  preset: Preset | null
  themes: readonly ThemeDefinition[]
  /** Published weddings made from this style; above zero its look cannot change. */
  frozenCount: number
  /** What a new style starts from: the studio's own look. */
  studioBranding: Branding
  studioLocale: Locale
}) {
  const router = useRouter()
  const seed = preset?.branding ?? studioBranding
  const [name, setName] = useState(preset?.name ?? '')
  const [isDefault, setIsDefault] = useState(preset?.isDefault ?? false)
  const [templateId, setTemplateId] = useState(preset?.templateId ?? 'keepsake')
  const [theme, setTheme] = useState(seed.theme ?? DEFAULT_THEME_ID)
  const [accent, setAccent] = useState(seed.accent ?? '#d11a2a')
  const [displayFont, setDisplayFont] = useState<DisplayFont | null>(seed.displayFont ?? null)
  const [presentedBy, setPresentedBy] = useState(seed.presentedBy ?? '')
  const [logoUrl, setLogoUrl] = useState(seed.logoUrl ?? '')
  const [platformCredit, setPlatformCredit] = useState(seed.platformCredit !== false)
  const [locale, setLocale] = useState<Locale>(preset?.locale ?? studioLocale)
  const [passcodeOn, setPasscodeOn] = useState(preset?.passcodeOn ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [frozen, setFrozen] = useState<number>(frozenCount)

  const selected = themeFrom({ theme }, themes)
  const offered = themes.filter((candidate) => candidate.enabled || candidate.id === theme)
  const lookLocked = frozen > 0

  const body = () => ({
    name: name.trim(),
    isDefault,
    templateId,
    branding: {
      theme,
      accent,
      displayFont: displayFont ?? undefined,
      presentedBy: presentedBy || undefined,
      logoUrl: logoUrl || undefined,
      platformCredit,
    },
    locale,
    passcodeOn,
  })

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // A frozen style may still be renamed or made the default; the look is not sent.
      const payload = lookLocked && preset ? { name: name.trim(), isDefault } : body()
      const response = await fetch(preset ? `/api/admin/presets/${preset.id}` : '/api/admin/presets', {
        method: preset ? 'PATCH' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = (await response.json().catch(() => null)) as {
        preset?: { id: string }
        error?: { code?: string; message?: string; fields?: Record<string, string> }
      } | null
      if (!response.ok) {
        if (result?.error?.code === 'FROZEN') setFrozen(Number(result.error.fields?.count ?? 1))
        throw new Error(result?.error?.message ?? `Request failed (${response.status})`)
      }
      router.push('/admin/studio/styles')
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  async function duplicate() {
    if (!preset) return
    setBusy(true)
    setError(null)
    try {
      const response = await fetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: `${preset.name} (copy)`, duplicateOf: preset.id }),
      })
      if (!response.ok) throw new Error(`Could not duplicate (${response.status})`)
      const result = (await response.json()) as { preset: { id: string } }
      router.push(`/admin/studio/styles/${result.preset.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong')
      setBusy(false)
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="flex flex-col gap-5">
      {lookLocked ? (
        <div
          role="status"
          className="rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-warn)_45%,white)] bg-[color-mix(in_srgb,var(--color-warn)_10%,white)] p-4"
        >
          <p className="text-[14px] font-semibold">
            {frozen} published wedding{frozen === 1 ? ' was' : 's were'} delivered in this style, so
            its look is fixed.
          </p>
          <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
            The record of what a couple was given has to keep meaning something. Rename it or make
            it the default here; to change the look, duplicate it and edit the copy.
          </p>
          <button
            type="button"
            onClick={() => void duplicate()}
            disabled={busy}
            className="mt-3 h-10 rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-5 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            Duplicate and edit
          </button>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <label className="text-[13px]">
          <span className="mb-1 block font-semibold">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            maxLength={60}
            placeholder="Winter classic"
            className="h-10 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
        </label>
        <label className="flex items-center gap-2 self-end pb-2 text-[14px]">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(event) => setIsDefault(event.target.checked)}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          The default for new weddings
        </label>
      </div>

      <fieldset disabled={lookLocked} className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <legend className="px-1 text-[13px] font-semibold">Theme</legend>
        <ThemeCards themes={offered} value={theme} onChange={setTheme} />
      </fieldset>

      <fieldset disabled={lookLocked} className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <legend className="px-1 text-[13px] font-semibold">Layout</legend>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TEMPLATES.map((option) => {
            const chosen = templateId === option.id
            return (
              <li key={option.id}>
                <label
                  className={`flex h-full cursor-pointer flex-col rounded-[var(--radius-card)] border-2 p-3 transition-colors ${
                    chosen
                      ? 'border-[var(--color-accent)]'
                      : 'border-[var(--color-l-line)] hover:border-[var(--color-l-text-mid)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="layout"
                    checked={chosen}
                    onChange={() => setTemplateId(option.id)}
                    className="sr-only"
                  />
                  <TemplateThumbnail sectionTypes={option.sections.map((s) => s.type)} />
                  <span className="mt-3 text-[15px] font-semibold">{option.label}</span>
                  <span className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
                    {option.description}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </fieldset>

      <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.09em] text-[var(--color-l-text-mid)]">
          Branding
        </h2>
        <TypefaceField value={displayFont} theme={selected} onChange={setDisplayFont} disabled={lookLocked} />
        <AccentField accent={accent} theme={selected} onChange={setAccent} disabled={lookLocked} />
        <fieldset disabled={lookLocked}>
          <label className="mb-1 block text-[13px] font-semibold" htmlFor="style-presented-by">
            Presented by
          </label>
          <input
            id="style-presented-by"
            value={presentedBy}
            onChange={(event) => setPresentedBy(event.target.value)}
            placeholder="Your company name"
            className="mb-3 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
          />
          <label className="mb-1 block text-[13px] font-semibold" htmlFor="style-logo-url">
            Logo URL
          </label>
          <input
            id="style-logo-url"
            type="url"
            value={logoUrl}
            onChange={(event) => setLogoUrl(event.target.value)}
            placeholder="https://…"
            className="mb-3 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
          />
          <label className="flex cursor-pointer items-center gap-3 text-[14px]">
            <input
              type="checkbox"
              checked={platformCredit}
              onChange={(event) => setPlatformCredit(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-accent)]"
            />
            Show &ldquo;Made with Mehfilbox&rdquo; in the footer
          </label>
        </fieldset>
      </div>

      <fieldset disabled={lookLocked} className="grid gap-4 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4 sm:grid-cols-2">
        <div>
          <p className="mb-2 text-[13px] font-semibold">Language</p>
          <div className="flex max-w-[320px] gap-2">
            {(
              [
                ['en', 'English'],
                ['hi', 'हिंदी'],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px] has-[:checked]:border-[var(--color-accent)] has-[:checked]:font-semibold"
              >
                <input
                  type="radio"
                  name="style-locale"
                  value={value}
                  checked={locale === value}
                  onChange={() => setLocale(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 text-[14px]">
          <input
            type="checkbox"
            checked={passcodeOn}
            onChange={(event) => setPasscodeOn(event.target.checked)}
            className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
          />
          <span>
            Start with a guest code
            <span className="block text-[12px] text-[var(--color-l-text-mid)]">
              A six-digit code is generated when the wedding is created and shown to you once.
            </span>
          </span>
        </label>
      </fieldset>

      {error ? (
        <p role="alert" className="text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={busy || name.trim().length === 0}
          className="h-11 rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink disabled:opacity-60"
        >
          {busy ? 'Saving…' : preset ? 'Save' : 'Add this style'}
        </button>
        <span className="text-[13px] text-[var(--color-l-text-mid)]">
          Only weddings created afterwards start from it. Nothing already delivered moves.
        </span>
      </div>
    </form>
  )
}
