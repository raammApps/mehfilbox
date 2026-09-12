'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { Catalogue, Locale, Privacy } from '@/lib/schema'

/** AE-10 — unlisted by default, optional passcode (doc 01 §5.2, doc 05 §4). */
export function CatalogueSettings({ catalogue }: { catalogue: Catalogue }) {
  const router = useRouter()
  const [privacy, setPrivacy] = useState<Privacy>(catalogue.privacy)
  const [passcode, setPasscode] = useState('')
  const [customDomain, setCustomDomain] = useState(catalogue.customDomain ?? '')
  const [locale, setLocale] = useState<Locale>(catalogue.locale)
  const [status, setStatus] = useState<string | null>(null)
  const [confirmName, setConfirmName] = useState('')
  const [deleting, setDeleting] = useState(false)

  const save = async () => {
    const response = await fetch(`/api/admin/catalogues/${catalogue.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        privacy,
        // Only send a passcode when one was typed; an empty box must not wipe a working one.
        ...(privacy === 'passcode' && passcode ? { passcode } : {}),
        ...(privacy === 'unlisted' ? { passcode: null } : {}),
        // Empty means "no custom domain", which is a real choice and must clear the field —
        // unlike the passcode, where empty means "keep the one you have".
        customDomain: customDomain.trim() ? customDomain.trim() : null,
        locale,
      }),
    })
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null
      setStatus(body?.error?.message ?? 'Could not save')
      return
    }
    setStatus('Saved')
    setPasscode('')
    router.refresh()
  }

  const destroy = async () => {
    setDeleting(true)
    const response = await fetch(`/api/admin/catalogues/${catalogue.id}`, { method: 'DELETE' })
    if (!response.ok) {
      setStatus('Could not delete')
      setDeleting(false)
      return
    }
    // Nothing here to return to.
    router.push('/admin')
  }

  const unpublish = async () => {
    if (!window.confirm('Take this catalogue offline? Guests will see "not yet available".')) return
    await fetch(`/api/admin/catalogues/${catalogue.id}/publish`, { method: 'DELETE' })
    router.refresh()
  }

  return (
    <div className="max-w-[560px]">
      {/*
        Per wedding, not per studio (N-29c). The studio's own language is the default a new
        wedding inherits, not a rule it is stuck with — a Jaipur studio serves a Hindi family and
        an English one in the same month.

        In settings rather than in the customizer's branding panel, which is the other obvious
        home: everything in that panel waits for Publish, and two save models in one panel is the
        confusion N-56 removed. Here every control behaves the same way.
      */}
      <section className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <h2 className="mb-1 text-[15px] font-semibold">Language</h2>
        <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
          What this wedding opens in for the couple and their guests. They can still switch, and
          this does not change any other wedding.
        </p>
        <div className="flex gap-2">
          {(
            [
              ['en', 'English'],
              ['hi', 'हिंदी'],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px] has-[:checked]:border-[var(--color-l-text-hi)] has-[:checked]:font-semibold"
            >
              <input
                type="radio"
                name="catalogue-locale"
                value={value}
                checked={locale === value}
                onChange={() => setLocale(value)}
              />
              {label}
            </label>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <h2 className="mb-3 text-[15px] font-semibold">Who can watch</h2>

        <label className="mb-3 flex items-start gap-3">
          <input
            type="radio"
            name="privacy"
            checked={privacy === 'unlisted'}
            onChange={() => setPrivacy('unlisted')}
            className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
          />
          <span className="text-[14px]">
            Unlisted link
            <span className="block text-[13px] text-[var(--color-l-text-mid)]">
              Anyone with the link. Never indexed, never listed anywhere. The default.
            </span>
          </span>
        </label>

        <label className="mb-3 flex items-start gap-3">
          <input
            type="radio"
            name="privacy"
            checked={privacy === 'passcode'}
            onChange={() => setPrivacy('passcode')}
            className="mt-1 h-4 w-4 accent-[var(--color-accent)]"
          />
          <span className="text-[14px]">
            Passcode
            <span className="block text-[13px] text-[var(--color-l-text-mid)]">
              Guests type a code from the invitation. Five wrong tries locks the address out for
              fifteen minutes.
            </span>
          </span>
        </label>

        {privacy === 'passcode' ? (
          <label className="mb-3 block">
            <span className="mb-1 block text-[13px] font-semibold">
              {catalogue.passcodeHash ? 'New passcode (leave blank to keep the current one)' : 'Passcode'}
            </span>
            <input
              type="text"
              value={passcode}
              onChange={(event) => setPasscode(event.target.value)}
              autoComplete="off"
              className="w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px]"
            />
          </label>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void save()}
            className="h-10 rounded-[var(--radius-pill)] bg-accent px-4 text-[14px] font-semibold text-accent-ink"
          >
            Save
          </button>
          <span aria-live="polite" className="text-[13px] text-[var(--color-l-text-mid)]">
            {status}
          </span>
        </div>
      </section>

      <section className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <h2 className="mb-1 text-[15px] font-semibold">Their own address</h2>
        <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
          A domain the couple owns, pointed here. Leave empty to use the address above.
        </p>
        <input
          type="text"
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          value={customDomain}
          onChange={(event) => setCustomDomain(event.target.value)}
          placeholder="aanyaandvikram.in"
          className="h-11 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
        />
        <p className="mt-2 text-[12px] text-[var(--color-l-text-mid)]">
          They point a CNAME at us, and the domain is added to the hosting project. Until both
          are done this is stored but not served.
        </p>
      </section>

      {/*
        Read-only now (D-39). This was a date field a studio could type into, which made the
        renewal date free. The term is what a renewal buys; it is set on our side with a reason.
      */}
      <section className="mb-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
        <h2 className="mb-1 text-[15px] font-semibold">Serving until</h2>
        <p className="text-[15px] font-semibold tabular-nums" data-testid="serving-until">
          {catalogue.includedUntil.slice(0, 10)}
        </p>
        <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
          After this date guests see a renewal screen — never a broken link, and nothing is
          deleted. A renewal extends it; the date moves when the renewal is paid.
        </p>
      </section>

      {catalogue.status === 'published' ? (
        <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
          <h2 className="mb-1 text-[15px] font-semibold">Take offline</h2>
          <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
            Nothing is deleted. Guests see a neutral &ldquo;not yet available&rdquo; page and the
            films stay exactly where they are.
          </p>
          <button
            type="button"
            onClick={() => void unpublish()}
            className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-4 text-[14px] font-semibold"
          >
            Unpublish
          </button>
        </section>
      ) : null}

      <section className="mt-6 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-error)_40%,white)] bg-[color-mix(in_srgb,var(--color-error)_5%,white)] p-4">
        <h2 className="mb-1 text-[15px] font-semibold">Delete this catalogue</h2>
        <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
          Removes the films from the video provider, the photographs from storage, and every
          record of guests watching. This cannot be undone, and there is no copy. If you only
          want it hidden, take it offline instead.
        </p>

        <label className="mb-2 block text-[13px]">
          Type <span className="font-mono font-semibold">{catalogue.slug}</span> to confirm
        </label>
        <input
          type="text"
          value={confirmName}
          onChange={(event) => setConfirmName(event.target.value)}
          autoCapitalize="none"
          spellCheck={false}
          className="mb-3 h-11 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 font-mono text-[14px]"
        />

        <button
          type="button"
          onClick={() => void destroy()}
          // Typing the slug rather than clicking through a dialog: this destroys a wedding, and
          // a confirm box is muscle memory by the third time an operator sees one.
          disabled={confirmName.trim() !== catalogue.slug || deleting}
          className="h-11 rounded-[var(--radius-pill)] bg-[var(--color-error)] px-5 text-[14px] font-semibold text-white disabled:opacity-40"
        >
          {deleting ? 'Deleting…' : 'Delete permanently'}
        </button>
      </section>
    </div>
  )
}
