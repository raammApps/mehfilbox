'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { suggestSlug } from '@/lib/format'
import { TEMPLATES } from '@/lib/admin/templates'
import type { Preset } from '@/lib/schema'
import type { ThemeDefinition } from '@/themes/contract'
import { themeFrom } from '@/themes/registry'
import { ThemeCards } from './ThemeCards'
import { FLIX_SUFFIX, OCCASIONS, type Locale, type Occasion, type Privacy, type Title } from '@/lib/schema'
import { DEFAULT_TIMEZONE, TIMEZONES, zonedTimeToUtc } from '@/lib/time'
import { catalogueUrl, type TenancyMode } from '@/lib/tenant'
import { IconCheck } from './icons'
import { TemplateThumbnail } from './TemplateThumbnail'
import { TitleList } from './TitleList'
import { UploadManager } from './UploadManager'

type Step = 1 | 2 | 3 | 4 | 5

/** Five steps (doc 16 §10); the second and third are the ones to do with the couple in the room. */
const STEPS: { n: Step; label: string; hint: string }[] = [
  { n: 1, label: 'The couple', hint: 'Names, date, occasion and the address guests will use' },
  { n: 2, label: 'The look', hint: 'A house style, or a theme and a layout' },
  { n: 3, label: 'Guests & the couple', hint: 'Who can watch, when, in what language, and the couple’s sign-in' },
  { n: 4, label: 'Upload', hint: 'Films go straight to the video service, not through us' },
  { n: 5, label: 'Titles', hint: 'Name them and choose what guests see' },
]

const OCCASION_LABELS: Record<Occasion, string> = {
  wedding: 'Wedding',
  engagement: 'Engagement',
  anniversary: 'Anniversary',
  birthday: 'Birthday',
  proposal: 'Proposal',
}

const DRAFT_KEY = 'mehfilbox.wizard.draft'

/**
 * The five-step create wizard (doc 02 §3, doc 16 §10).
 *
 * Three properties matter more than the form itself:
 *  - **nothing is lost on refresh** — an operator does this between phone calls, so step 1–2
 *    input is mirrored to localStorage until the catalogue exists;
 *  - **upload starts at step 3 and keeps running** through step 4 and beyond. Making an
 *    operator wait for a 6GB upload before they can type a title wastes the only thing they
 *    have less of than money;
 *  - **the address is visible while it is being decided.** The slug field is the one input an
 *    operator cannot change casually later — it is in every guest's WhatsApp — and it used to be
 *    a box labelled "Web address" that never showed the address.
 */
export function CreateWizard({
  rootDomain,
  tenancyMode,
  studioSlug,
  studioLocale,
  themes,
  studioTheme,
  styles,
}: {
  /** Passed in rather than read here: `lib/env` is server-only, and this runs in the browser. */
  rootDomain: string
  tenancyMode: TenancyMode
  /** The studio segment of every address this studio creates (D-32) — `/<studioSlug>/<wedding>`. */
  studioSlug: string
  /** The studio's own language — the default this wedding starts from, not a rule (N-29c). */
  studioLocale: Locale
  /** The themes a studio may pick from (D-35), resolved on the server. */
  themes: readonly ThemeDefinition[]
  /** The studio's default theme — what a wedding starts on unless the couple wants another. */
  studioTheme: string
  /** The studio's house styles (D-36); the default one is preselected. */
  styles: Preset[]
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [catalogueId, setCatalogueId] = useState<string | null>(null)

  const [coupleName, setCoupleName] = useState('')
  const [occasion, setOccasion] = useState<Occasion>('wedding')
  const [appName, setAppName] = useState('')
  const [weddingDate, setWeddingDate] = useState('')
  const [city, setCity] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [slugState, setSlugState] = useState<{
    available: boolean
    reason?: string
    suggestion?: string
  } | null>(null)
  const [template, setTemplate] = useState(TEMPLATES[0]!.id)
  const [theme, setTheme] = useState(studioTheme)
  /**
   * A house style, or "choose myself" (doc 16 §10). The default style is preselected because it
   * is the studio's own answer to this step; picking one fills the language too, since a style
   * carries it — the couple can still change it here.
   */
  const [styleId, setStyleId] = useState<string | null>(
    styles.find((style) => style.isDefault)?.id ?? null,
  )
  /** Generated at creation when a code was asked for but not typed; shown once, on the next step. */
  const [passcode, setPasscode] = useState<string | null>(null)
  // Step 3 — guests and the couple (doc 16 §10).
  const [privacy, setPrivacy] = useState<Privacy>('unlisted')
  const [typedCode, setTypedCode] = useState('')
  const [timezone, setTimezone] = useState(DEFAULT_TIMEZONE)
  const [premiereDate, setPremiereDate] = useState('')
  const [premiereTime, setPremiereTime] = useState('19:00')
  const [coupleEmail, setCoupleEmail] = useState('')
  const [coupleContact, setCoupleContact] = useState('')
  const [delivery, setDelivery] = useState<'link' | 'temporary'>('link')
  const [coupleResult, setCoupleResult] = useState<{ email: string; existing: boolean; temporaryPassword?: string; error?: string } | null>(null)
  const chooseStyle = (id: string | null) => {
    setStyleId(id)
    const style = styles.find((candidate) => candidate.id === id)
    if (!style) return
    setLocale(style.locale)
    setTheme(style.branding.theme ?? studioTheme)
    setTemplate(style.templateId as typeof template)
    setPrivacy(style.passcodeOn ? 'passcode' : 'unlisted')
  }
  /**
   * Seeded from the studio, changeable per wedding (N-29c). The studio's language is what most of
   * their couples read; it is not what all of them read, and asking here costs one line.
   */
  const [locale, setLocale] = useState<Locale>(studioLocale)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // Restore an interrupted wizard.
  useEffect(() => {
    const raw = window.localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    try {
      const draft = JSON.parse(raw) as Record<string, string>
      setCoupleName(draft.coupleName ?? '')
      setAppName(draft.appName ?? '')
      setWeddingDate(draft.weddingDate ?? '')
      setCity(draft.city ?? '')
      setSlug(draft.slug ?? '')
    } catch {
      window.localStorage.removeItem(DRAFT_KEY)
    }
  }, [])

  useEffect(() => {
    if (catalogueId) return
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ coupleName, appName, weddingDate, city, slug }),
    )
  }, [coupleName, appName, weddingDate, city, slug, catalogueId])

  // Suggested from the couple's names and the wedding year until the operator edits it
  // themselves. The year is what keeps one global namespace usable (N-32).
  useEffect(() => {
    if (slugTouched || !coupleName) return
    setSlug(suggestSlug({ en: coupleName }, weddingDate))
  }, [coupleName, weddingDate, slugTouched])

  // Live availability check, debounced.
  useEffect(() => {
    if (slug.length < 3) {
      setSlugState(null)
      return
    }
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/admin/slug-check?slug=${encodeURIComponent(slug)}`)
      if (response.ok) {
        setSlugState(
          (await response.json()) as { available: boolean; reason?: string; suggestion?: string },
        )
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [slug])

  const appNameProblem = FLIX_SUFFIX.test(appName)
  const created = catalogueId !== null

  const create = async () => {
    setBusy(true)
    setErrors({})

    const response = await fetch('/api/admin/catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        coupleName: { en: coupleName },
        appName: { en: appName || `${coupleName} Originals` },
        weddingDate,
        slug,
        city: city ? { en: city } : undefined,
        occasion,
        locale,
        // Step 3: who can watch, and when — in the couple's own time.
        privacy,
        ...(privacy === 'passcode' && typedCode.trim() ? { passcode: typedCode.trim() } : {}),
        timezone,
        premiereAt: premiereDate ? zonedTimeToUtc(premiereDate, premiereTime || '00:00', timezone) : null,
        // From a style, the route copies its layout and branding; otherwise only the theme is
        // sent and the rest of the studio's branding is inherited.
        ...(styleId ? { presetId: styleId } : { template, branding: { theme } }),
      }),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string; fields?: Record<string, string> }
      } | null
      setErrors(body?.error?.fields ?? { _: body?.error?.message ?? 'Could not create the catalogue' })
      setBusy(false)
      return
    }

    const body = (await response.json()) as { catalogue: { id: string }; passcode?: string }
    setPasscode(body.passcode ?? null)
    window.localStorage.removeItem(DRAFT_KEY)

    /**
     * The couple's sign-in, issued now if an address was given (D-33, D-37). Its failure is not
     * the wedding's: the catalogue exists, so the outcome is reported on the next step rather
     * than blocking it, and the overview offers the same form again.
     */
    if (coupleEmail.trim()) {
      const issued = await fetch(`/api/admin/catalogues/${body.catalogue.id}/couple`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: coupleEmail.trim(), name: coupleContact.trim() || coupleName, delivery }),
      })
      const outcome = (await issued.json().catch(() => null)) as {
        email?: string
        existing?: boolean
        temporaryPassword?: string
        error?: { message?: string; fields?: Record<string, string> }
      } | null
      setCoupleResult(
        issued.ok && outcome?.email
          ? { email: outcome.email, existing: outcome.existing ?? false, temporaryPassword: outcome.temporaryPassword }
          : { email: coupleEmail.trim(), existing: false, error: outcome?.error?.fields?.email ?? outcome?.error?.message ?? 'Could not create the sign-in' },
      )
    }

    /**
     * The list is a server component the router has already cached — from *before* this
     * catalogue existed, because the operator was looking at it a moment ago. Without this,
     * clicking "Catalogues" replays that render and says "No weddings here yet" about a wedding
     * that is sitting in the database, which reads as the work having been thrown away.
     *
     * `refresh()` rather than a hard navigation: the operator stays on step 3 and keeps the
     * upload they may already have started.
     */
    router.refresh()

    setCatalogueId(body.catalogue.id)
    setStep(4)
    setBusy(false)
  }

  return (
    <div className="max-w-[720px]">
      <Stepper current={step} created={created} />

      {created ? (
        <p className="mb-5 flex items-center gap-2 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-ok)_30%,white)] bg-[color-mix(in_srgb,var(--color-ok)_8%,white)] px-3.5 py-2.5 text-[13px]">
          <span aria-hidden className="text-[var(--color-ok)]">
            <IconCheck />
          </span>
          <span>
            <strong className="font-semibold">{coupleName}</strong> exists as a draft at{' '}
            <code className="rounded bg-white/70 px-1 py-0.5">/{slug}</code>. Nothing from here on
            can lose it.
          </span>
        </p>
      ) : null}

      {step === 1 ? (
        <section>
          <Card title="The couple" hint="What guests see, and how the wedding is listed for you.">
            <Text
              label="Couple"
              value={coupleName}
              onChange={setCoupleName}
              placeholder="Aanya & Vikram"
              autoFocus
            />
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Text
                label="Wedding date"
                value={weddingDate}
                onChange={setWeddingDate}
                type="date"
                error={errors.weddingDate}
              />
              <Text label="City" value={city} onChange={setCity} placeholder="Jaipur" />
            </div>
            <fieldset className="mb-2">
              <legend className="mb-2 text-[13px] font-semibold">Occasion</legend>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map((option) => (
                  <label
                    key={option}
                    className="cursor-pointer rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 py-1.5 text-[13px] has-[:checked]:border-[var(--color-accent)] has-[:checked]:font-semibold"
                  >
                    <input
                      type="radio"
                      name="occasion"
                      value={option}
                      checked={occasion === option}
                      onChange={() => setOccasion(option)}
                      className="sr-only"
                    />
                    {OCCASION_LABELS[option]}
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>

          <Card
            title="Where it lives"
            hint="The address goes into every guest's phone. Changing it later breaks links already sent."
          >
            <Text
              label="Web address"
              value={slug}
              onChange={(next) => {
                setSlugTouched(true)
                setSlug(next)
              }}
              mono
              error={errors.slug ?? (slugState && !slugState.available ? slugState.reason : undefined)}
            />

            {/*
              The real address, resolved the same way the guest route resolves it — so an
              operator in path mode sees `/c/<slug>` rather than a subdomain that will not exist.
            */}
            <p className="-mt-2 mb-4 flex flex-wrap items-center gap-2 text-[13px]">
              <code className="rounded bg-[var(--color-l-surface-2)] px-2 py-1 text-[12px] text-[var(--color-l-text-mid)]">
                {catalogueUrl(
                  { slug: slug || 'your-couple', tenant: studioSlug || null },
                  rootDomain,
                  '/',
                  tenancyMode,
                ).replace(
                  /^https?:\/\//,
                  '',
                )}
              </code>
              {slugState ? (
                <span
                  className={
                    slugState.available
                      ? 'font-medium text-[#1c5f2a]'
                      : 'font-medium text-[var(--color-error)]'
                  }
                >
                  {slugState.available ? 'Available' : (slugState.reason ?? 'Taken')}
                </span>
              ) : null}
              {/*
                A refusal the operator cannot resolve is the actual complaint behind N-32. The
                address may be held by a catalogue belonging to a studio they are not allowed to
                see, so "taken" is the whole truth we can tell them — but a free one is always a
                click away.
              */}
              {slugState && !slugState.available && slugState.suggestion ? (
                <button
                  type="button"
                  onClick={() => {
                    setSlugTouched(true)
                    setSlug(slugState.suggestion!)
                  }}
                  className="rounded-full border border-[var(--color-l-line)] px-2.5 py-1 text-[12px] font-medium underline-offset-4 hover:underline"
                >
                  Use {slugState.suggestion}
                </button>
              ) : null}
            </p>

            <Text
              label="App name"
              value={appName}
              onChange={setAppName}
              placeholder={coupleName ? `${coupleName} Originals` : 'Aanya & Vikram Originals'}
              hint="The wordmark on the guest's profile screen. Leave it blank to use the suggestion."
              error={
                appNameProblem
                  ? 'Try "…Stream", "…Originals" or "The … Files" instead — the -flix suffix is out.'
                  : errors['appName.en']
              }
            />
          </Card>

          <Nav
            onNext={() => setStep(2)}
            nextDisabled={
              !coupleName || !weddingDate || !slug || appNameProblem || slugState?.available === false
            }
          />
        </section>
      ) : null}

      {step === 2 ? (
        <section>
          <p className="mb-4 text-[14px] text-[var(--color-l-text-mid)]">
            Pick a starting look and shape, with the couple if they are here. Every section can be
            reordered, renamed, hidden or removed afterwards — this only decides what is already
            there when you open the customizer.
          </p>

          {styles.length > 0 ? (
            <fieldset className="mb-6">
              <legend className="mb-1 block text-[14px] font-semibold">Start from</legend>
              <p className="mb-2 text-[13px] text-[var(--color-l-text-mid)]">
                A house style sets the theme, layout, branding, language and guest code in one go.
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {styles.map((style) => {
                  const chosen = styleId === style.id
                  const styleTheme = themeFrom(style.branding, themes)
                  return (
                    <li key={style.id}>
                      <label
                        className={`flex h-full cursor-pointer flex-col rounded-[var(--radius-card)] border-2 bg-white p-3 transition-colors ${
                          chosen
                            ? 'border-[var(--color-accent)]'
                            : 'border-[var(--color-l-line)] hover:border-[var(--color-l-text-mid)]'
                        }`}
                      >
                        <input
                          type="radio"
                          name="style"
                          value={style.id}
                          checked={chosen}
                          onChange={() => chooseStyle(style.id)}
                          className="sr-only"
                        />
                        <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                          {style.name}
                          {style.isDefault ? (
                            <span className="rounded-[var(--radius-pill)] bg-[var(--color-l-surface-2)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-[var(--color-l-text-mid)]">
                              Default
                            </span>
                          ) : null}
                        </span>
                        <span className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
                          {styleTheme.name} · {TEMPLATES.find((t) => t.id === style.templateId)?.label ?? style.templateId} ·{' '}
                          {style.locale === 'hi' ? 'हिंदी' : 'English'} ·{' '}
                          {style.passcodeOn ? 'guest code' : 'no code'}
                        </span>
                      </label>
                    </li>
                  )
                })}
                <li>
                  <label
                    className={`flex h-full cursor-pointer flex-col justify-center rounded-[var(--radius-card)] border-2 border-dashed bg-white p-3 transition-colors ${
                      styleId === null
                        ? 'border-[var(--color-accent)]'
                        : 'border-[var(--color-l-line)] hover:border-[var(--color-l-text-mid)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="style"
                      value=""
                      checked={styleId === null}
                      onChange={() => chooseStyle(null)}
                      className="sr-only"
                    />
                    <span className="text-[15px] font-semibold">Choose myself</span>
                    <span className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
                      Pick a theme and a layout below.
                    </span>
                  </label>
                </li>
              </ul>
            </fieldset>
          ) : null}

          {styleId === null ? (
          <>
          {/*
            Chosen here, with the couple in the room (doc 16 §10), rather than discovered in the
            customizer later: the theme is the first thing a couple has an opinion about.
          */}
          <fieldset className="mb-6">
            <legend className="mb-1 block text-[14px] font-semibold">The look</legend>
            <p className="mb-2 text-[13px] text-[var(--color-l-text-mid)]">
              Starts on your studio&rsquo;s theme. Changeable any time in the customizer.
            </p>
            <ThemeCards
              themes={themes.filter((option) => option.enabled || option.id === theme)}
              value={theme}
              onChange={setTheme}
            />
          </fieldset>

          <ul className="mb-6 grid gap-3 sm:grid-cols-3">
            {TEMPLATES.map((option) => {
              const chosen = template === option.id
              return (
                <li key={option.id}>
                  <label
                    className={`flex h-full cursor-pointer flex-col rounded-[var(--radius-card)] border-2 bg-white p-3 transition-colors ${
                      chosen
                        ? 'border-[var(--color-accent)]'
                        : 'border-[var(--color-l-line)] hover:border-[var(--color-l-text-mid)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      checked={chosen}
                      onChange={() => setTemplate(option.id)}
                      className="sr-only"
                    />

                    <TemplateThumbnail sectionTypes={option.sections.map((s) => s.type)} />

                    <span className="mt-3 flex items-center gap-1.5 text-[15px] font-semibold">
                      {option.label}
                      {chosen ? (
                        <span aria-hidden className="text-[var(--color-accent)]">
                          <IconCheck />
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
                      {option.description}
                    </span>
                    <span className="mt-2 text-[12px] text-[var(--color-l-text-mid)]">
                      {option.sections.length === 0 ? 'Empty page' : `${option.sections.length} sections`}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
          </>
          ) : null}

          {errors._ ? (
            <p role="alert" className="mb-3 text-[14px] text-[var(--color-error)]">
              {errors._}
            </p>
          ) : null}

          <Nav onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </section>
      ) : null}

      {step === 3 ? (
        <section>
          <p className="mb-4 text-[14px] text-[var(--color-l-text-mid)]">
            The questions to ask with the couple in the room. Every one of them can be changed
            later in the wedding&rsquo;s settings.
          </p>

          <Card title="Who can watch" hint="Unlisted means anyone with the link. A guest code is asked for once per phone.">
            <div className="flex max-w-[420px] gap-2">
              {(
                [
                  ['unlisted', 'Anyone with the link'],
                  ['passcode', 'A guest code'],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 py-2 text-[14px] has-[:checked]:border-[var(--color-accent)] has-[:checked]:font-semibold"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value={value}
                    checked={privacy === value}
                    onChange={() => setPrivacy(value)}
                  />
                  {label}
                </label>
              ))}
            </div>
            {privacy === 'passcode' ? (
              <div className="mt-3">
                <Text
                  label="Guest code"
                  value={typedCode}
                  onChange={setTypedCode}
                  placeholder="Leave empty to have one made for you"
                  hint="Six digits works best over the phone. Shown once on the next step if it is generated."
                  mono
                />
              </div>
            ) : null}
          </Card>

          <Card title="Language and time" hint="What the couple reads, and whose clock a premiere is on.">
            <div className="grid gap-4 sm:grid-cols-2">
              <fieldset>
                <legend className="mb-1 block text-[13px] font-semibold">Language</legend>
                <div className="flex gap-2">
                  {(
                    [
                      ['en', 'English'],
                      ['hi', 'हिंदी'],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 py-2 text-[15px] has-[:checked]:border-[var(--color-accent)] has-[:checked]:font-semibold"
                    >
                      <input
                        type="radio"
                        name="locale"
                        value={value}
                        checked={locale === value}
                        onChange={() => setLocale(value)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <label className="text-[13px]">
                <span className="mb-1 block font-semibold">Time zone</span>
                <select
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  className="h-11 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 text-[14px]"
                >
                  {TIMEZONES.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Card>

          <Card title="Premiere" hint="Optional. Until then the link shows a countdown instead of the films.">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Text label="Premiere date" value={premiereDate} onChange={setPremiereDate} type="date" />
              <Text label="Premiere time" value={premiereTime} onChange={setPremiereTime} type="time" />
            </div>
            {premiereDate ? (
              <button type="button" onClick={() => setPremiereDate('')} className="-mt-2 text-[12px] underline underline-offset-4">
                No premiere — live when published
              </button>
            ) : null}
          </Card>

          <Card title="The couple’s sign-in" hint="Optional now; the overview offers it again. Their account shows this wedding as it is prepared.">
            <div className="grid gap-x-4 sm:grid-cols-2">
              <Text label="Couple’s email" value={coupleEmail} onChange={setCoupleEmail} type="email" placeholder="aanya@example.com" />
              <Text label="Name on the account" value={coupleContact} onChange={setCoupleContact} placeholder={coupleName || 'Aanya & Vikram'} />
            </div>
            {coupleEmail.trim() ? (
              <fieldset>
                <legend className="mb-1 block text-[13px] font-semibold">How their first password reaches them</legend>
                <div className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
                  {(
                    [
                      ['link', 'Email them a link to set one'],
                      ['temporary', 'Show me a temporary one now'],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] bg-white px-3 py-2 text-[14px] has-[:checked]:border-[var(--color-accent)] has-[:checked]:font-semibold"
                    >
                      <input type="radio" name="delivery" value={value} checked={delivery === value} onChange={() => setDelivery(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
          </Card>

          {errors._ ? (
            <p role="alert" className="mb-3 text-[14px] text-[var(--color-error)]">
              {errors._}
            </p>
          ) : null}

          <Nav
            onBack={() => setStep(2)}
            onNext={() => void create()}
            nextLabel={busy ? 'Creating…' : 'Create and start uploading'}
            nextDisabled={busy}
          />
        </section>
      ) : null}

      {step === 4 && catalogueId ? (
        <section>
          {coupleResult ? (
            <p
              role="status"
              className={`mb-4 rounded-[var(--radius-card)] border px-4 py-3 text-[14px] ${
                coupleResult.error
                  ? 'border-[color-mix(in_srgb,var(--color-error)_40%,white)] bg-[color-mix(in_srgb,var(--color-error)_8%,white)]'
                  : 'border-[var(--color-l-line)] bg-white'
              }`}
            >
              {coupleResult.error
                ? `The couple’s sign-in could not be made: ${coupleResult.error}. The overview offers it again.`
                : coupleResult.temporaryPassword
                  ? `${coupleResult.email} can sign in with the temporary password `
                  : coupleResult.existing
                    ? `${coupleResult.email} already had an account; this wedding is in it.`
                    : `A link to set their password is on its way to ${coupleResult.email}.`}
              {coupleResult.temporaryPassword ? (
                <strong className="font-mono text-[16px] font-bold">{coupleResult.temporaryPassword}</strong>
              ) : null}
              {coupleResult.temporaryPassword ? ' — shown once; they replace it at first sign-in.' : ''}
            </p>
          ) : null}
          {passcode ? (
            /* Shown once, here, with the couple present — it is not sent anywhere. Settings can
               change it later, which is where it is if this screen is gone. */
            <p
              role="status"
              className="mb-4 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white px-4 py-3 text-[14px]"
            >
              Guest code <strong className="font-mono text-[16px] font-bold">{passcode}</strong> —
              guests will need it to open the page. Write it down now; you can change it in Settings.
            </p>
          ) : null}
          <p className="mb-3 text-[14px] text-[var(--color-l-text-mid)]">
            Drop the films in. They keep uploading while you title them on the next step, and
            while you work anywhere else in the admin.
          </p>
          <UploadManager catalogueId={catalogueId} />
          <Nav onNext={() => setStep(5)} nextLabel="Title the films" />
        </section>
      ) : null}

      {step === 5 && catalogueId ? (
        <section>
          <p className="mb-4 text-[14px] text-[var(--color-l-text-mid)]">
            Names have been guessed from the filenames. Correct them, set a category, and make
            ready the ones you want guests to see. Every change saves as you make it.
          </p>

          {/*
            The step now contains the editor it describes. It used to print this instruction and
            then offer only a button to leave and do the work somewhere else, which made the
            last step of the wizard an empty promise — and left an operator unsure whether
            anything they had done so far had been kept.
          */}
          <StepTitles catalogueId={catalogueId} />

          <Nav
            onBack={() => setStep(4)}
            onNext={() => router.push(`/admin/c/${catalogueId}/customizer`)}
            nextLabel="Finish and customise"
          />
        </section>
      ) : null}
    </div>
  )
}

/**
 * Steps 1–3 can be walked back; 4–5 cannot, because by then the catalogue exists and "back" past
 * its own creation is not a thing the operator can be offered. The stepper says so rather than
 * leaving them to discover it.
 */
function Stepper({ current, created }: { current: Step; created: boolean }) {
  return (
    <ol className="mb-6 flex flex-wrap gap-x-1 gap-y-2" aria-label="Steps">
      {STEPS.map(({ n, label, hint }) => {
        const done = created ? n < current : n < current
        const active = n === current
        return (
          <li key={n} aria-current={active ? 'step' : undefined} className="flex items-center">
            <span
              className={`flex items-center gap-2 rounded-[var(--radius-pill)] px-3 py-1.5 text-[13px] ${
                active
                  ? 'bg-[var(--color-l-text-hi)] font-semibold text-white'
                  : done
                    ? 'bg-[color-mix(in_srgb,var(--color-ok)_14%,white)] text-[#1c5f2a]'
                    : 'bg-[var(--color-l-surface-2)] text-[var(--color-l-text-mid)]'
              }`}
              title={hint}
            >
              <span
                aria-hidden
                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  active ? 'bg-white/20' : done ? 'bg-[var(--color-ok)] text-white' : 'bg-white'
                }`}
              >
                {done ? '✓' : n}
              </span>
              {label}
            </span>
            {n < 5 ? (
              <span aria-hidden className="mx-1 h-px w-3 bg-[var(--color-l-line)] sm:w-5" />
            ) : null}
          </li>
        )
      })}
    </ol>
  )
}

function Card({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section className="mb-4 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {hint ? (
        <p className="mb-4 mt-0.5 text-[13px] text-[var(--color-l-text-mid)]">{hint}</p>
      ) : (
        <div className="mb-4" />
      )}
      {children}
    </section>
  )
}

/**
 * The film list, loaded for the wizard's last step.
 *
 * Fetched rather than passed in because the wizard creates the catalogue at step 2 and the
 * films arrive during step 3 — nothing on the server knew about them when this page rendered.
 */
function StepTitles({ catalogueId }: { catalogueId: string }) {
  const [titles, setTitles] = useState<Title[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const response = await fetch(`/api/admin/catalogues/${catalogueId}`)
      if (!response.ok) return
      const body = (await response.json()) as { titles?: Title[] }
      if (!cancelled) {
        setTitles(body.titles ?? [])
        setLoaded(true)
      }
    }
    void load()
    // Uploads finish while this step is open, so poll gently rather than stranding the
    // operator on a list that was accurate ten seconds ago.
    const timer = setInterval(load, 4000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [catalogueId])

  if (!loaded) return <p className="text-[14px] text-[var(--color-l-text-mid)]">Loading films…</p>
  if (titles.length === 0) {
    return (
      <p className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] px-4 py-6 text-center text-[14px] text-[var(--color-l-text-mid)]">
        No films yet. Go back a step and drop some in — they keep uploading while you work.
      </p>
    )
  }

  return <TitleList catalogueId={catalogueId} titles={titles} />
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  hint,
  error,
  type = 'text',
  mono = false,
  autoFocus = false,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
  hint?: string
  error?: string
  type?: string
  mono?: boolean
  autoFocus?: boolean
}) {
  const id = label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1 block text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- the first field of a create form the
        // operator navigated to deliberately; nothing else on the page competes for focus.
        autoFocus={autoFocus}
        autoCapitalize={mono ? 'none' : undefined}
        spellCheck={mono ? false : undefined}
        className={`h-11 w-full rounded-[var(--radius-input)] border bg-white px-3 text-[15px] ${
          mono ? 'font-mono text-[14px]' : ''
        } ${error ? 'border-[var(--color-error)]' : 'border-[var(--color-l-line)]'}`}
      />
      {error ? (
        <p role="alert" className="mt-1 text-[13px] text-[var(--color-error)]">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">{hint}</p>
      ) : null}
    </div>
  )
}

function Nav({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled,
}: {
  onBack?: () => void
  onNext: () => void
  nextLabel?: string
  nextDisabled?: boolean
}) {
  return (
    <div className="mt-6 flex items-center gap-2">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="h-11 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 text-[14px] font-semibold"
        >
          Back
        </button>
      ) : null}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="h-11 rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink disabled:opacity-50"
      >
        {nextLabel}
      </button>
    </div>
  )
}
