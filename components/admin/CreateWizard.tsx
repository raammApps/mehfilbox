'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { suggestSlug } from '@/lib/format'
import { TEMPLATES } from '@/lib/admin/templates'
import { FLIX_SUFFIX, type Title } from '@/lib/schema'
import { catalogueUrl, type TenancyMode } from '@/lib/tenant'
import { IconCheck } from './icons'
import { TemplateThumbnail } from './TemplateThumbnail'
import { TitleList } from './TitleList'
import { UploadManager } from './UploadManager'

type Step = 1 | 2 | 3 | 4

const STEPS: { n: Step; label: string; hint: string }[] = [
  { n: 1, label: 'The wedding', hint: 'Names, date and the address guests will use' },
  { n: 2, label: 'The shape', hint: 'A starting layout you can rearrange afterwards' },
  { n: 3, label: 'Upload', hint: 'Films go straight to the video service, not through us' },
  { n: 4, label: 'Titles', hint: 'Name them and choose what guests see' },
]

const DRAFT_KEY = 'mehfilbox.wizard.draft'

/**
 * The four-step create wizard (doc 02 §3).
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
}: {
  /** Passed in rather than read here: `lib/env` is server-only, and this runs in the browser. */
  rootDomain: string
  tenancyMode: TenancyMode
}) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [catalogueId, setCatalogueId] = useState<string | null>(null)

  const [coupleName, setCoupleName] = useState('')
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
        template,
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

    const body = (await response.json()) as { catalogue: { id: string } }
    window.localStorage.removeItem(DRAFT_KEY)

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
    setStep(3)
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
                {catalogueUrl(slug || 'your-couple', rootDomain, '/', tenancyMode).replace(
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
            Pick a starting shape. Every section can be reordered, renamed, hidden or removed
            afterwards — this only decides what is already there when you open the customizer.
          </p>

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
                      {option.sections.length} sections
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          {errors._ ? (
            <p role="alert" className="mb-3 text-[14px] text-[var(--color-error)]">
              {errors._}
            </p>
          ) : null}

          <Nav
            onBack={() => setStep(1)}
            onNext={() => void create()}
            nextLabel={busy ? 'Creating…' : 'Create and start uploading'}
            nextDisabled={busy}
          />
        </section>
      ) : null}

      {step === 3 && catalogueId ? (
        <section>
          <p className="mb-3 text-[14px] text-[var(--color-l-text-mid)]">
            Drop the films in. They keep uploading while you title them on the next step, and
            while you work anywhere else in the admin.
          </p>
          <UploadManager catalogueId={catalogueId} />
          <Nav onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel="Title the films" />
        </section>
      ) : null}

      {step === 4 && catalogueId ? (
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
            onBack={() => setStep(3)}
            onNext={() => router.push(`/admin/c/${catalogueId}/customizer`)}
            nextLabel="Finish and customise"
          />
        </section>
      ) : null}
    </div>
  )
}

/**
 * Steps 1–2 can be walked back; 3–4 cannot, because by then the catalogue exists and "back" past
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
            {n < 4 ? (
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
