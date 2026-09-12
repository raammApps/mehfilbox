'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SaveState, type SaveStatus } from '@/components/admin/SaveState'

/**
 * The six things a couple actually does with their catalogue (D-37), each a small panel that
 * writes through `PATCH /api/my/catalogues/:id` and refreshes the page. Live, not draft: a code
 * change that waited for a Publish is a code change that did not happen.
 */

async function patch(catalogueId: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
  const response = await fetch(`/api/my/catalogues/${catalogueId}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.ok) return { ok: true }
  const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
  return { ok: false, message: data?.error?.message ?? 'Could not save' }
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {hint ? <p className="mb-3 mt-0.5 text-[13px] text-[var(--color-l-text-mid)]">{hint}</p> : <div className="mb-3" />}
      {children}
    </section>
  )
}

const button = 'h-10 rounded-[var(--radius-pill)] px-4 text-[14px] font-semibold disabled:opacity-50'
const primary = `${button} bg-accent text-accent-ink`
const secondary = `${button} border border-[var(--color-l-line)] bg-white`

export function GuestCodePanel({ catalogueId, hasCode }: { catalogueId: string; hasCode: boolean }) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)

  const save = async (next: string | null) => {
    setStatus('saving')
    setError(null)
    const result = await patch(catalogueId, { passcode: next })
    setStatus(result.ok ? 'saved' : 'error')
    if (!result.ok) setError(result.message ?? null)
    else {
      setCode('')
      router.refresh()
    }
  }

  return (
    <Panel
      title="Guest code"
      hint={
        hasCode
          ? 'Guests type this code from the invitation before the page opens. Changing or removing it signs out everyone who typed the old one.'
          : 'Anyone with the link can open the page. Add a code if you would rather guests typed one first.'
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void save(code)
        }}
        className="flex flex-wrap items-center gap-2"
      >
        <label className="sr-only" htmlFor="guest-code">
          {hasCode ? 'New guest code' : 'Guest code'}
        </label>
        <input
          id="guest-code"
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={hasCode ? 'New code' : 'e.g. 4821'}
          autoComplete="off"
          minLength={4}
          maxLength={64}
          className="h-10 w-[160px] rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[15px]"
        />
        <button type="submit" disabled={code.trim().length < 4 || status === 'saving'} className={primary}>
          {hasCode ? 'Change code' : 'Set code'}
        </button>
        {hasCode ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Remove the guest code? Anyone with the link will be able to open the page, and everyone who typed the old code is signed out.')) {
                void save(null)
              }
            }}
            disabled={status === 'saving'}
            className={secondary}
          >
            Remove code
          </button>
        ) : null}
      </form>
      <SaveState status={status} savedLabel="Saved — it applies now" className="mt-2" />
      {error ? <p className="mt-1 text-[13px] text-[var(--color-error)]">{error}</p> : null}
    </Panel>
  )
}

export function LetterPanel({
  catalogueId,
  body,
  signature,
}: {
  catalogueId: string
  body: string
  signature: string
}) {
  const router = useRouter()
  const [text, setText] = useState(body)
  const [sign, setSign] = useState(signature)
  const [status, setStatus] = useState<SaveStatus>('idle')

  const save = async () => {
    setStatus('saving')
    const result = await patch(catalogueId, { letter: { body: text, signature: sign } })
    setStatus(result.ok ? 'saved' : 'error')
    if (result.ok) router.refresh()
  }

  return (
    <Panel title="Your message" hint="The letter on the page. Blank lines make paragraphs. It goes live the moment you save.">
      <label className="sr-only" htmlFor="letter-body">
        Message
      </label>
      <textarea
        id="letter-body"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={8}
        className="mb-2 w-full rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2 text-[15px] leading-relaxed"
      />
      <label className="mb-1 block text-[13px] font-semibold" htmlFor="letter-signature">
        Signed
      </label>
      <input
        id="letter-signature"
        type="text"
        value={sign}
        onChange={(event) => setSign(event.target.value)}
        maxLength={200}
        className="mb-3 h-10 w-full max-w-[320px] rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[15px]"
      />
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={status === 'saving'} className={primary}>
          Save message
        </button>
        <SaveState status={status} savedLabel="Saved — guests see it now" />
      </div>
    </Panel>
  )
}

export function SectionsPanel({
  catalogueId,
  sections,
}: {
  catalogueId: string
  sections: { id: string; label: string; enabled: boolean }[]
}) {
  const router = useRouter()
  const [status, setStatus] = useState<SaveStatus>('idle')

  const toggle = async (id: string, enabled: boolean) => {
    setStatus('saving')
    const result = await patch(catalogueId, { sections: [{ id, enabled }] })
    setStatus(result.ok ? 'saved' : 'error')
    if (result.ok) router.refresh()
  }

  return (
    <Panel title="Sections" hint="Hide a section without losing it. Reordering and adding new ones is done in the full editor.">
      <ul className="flex flex-col gap-2">
        {sections.map((section) => (
          <li key={section.id} className="flex items-center justify-between gap-3 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-2">
            <span className="text-[14px]">{section.label}</span>
            <label className="flex items-center gap-2 text-[13px] text-[var(--color-l-text-mid)]">
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={(event) => void toggle(section.id, event.target.checked)}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              {section.enabled ? 'Shown' : 'Hidden'}
            </label>
          </li>
        ))}
      </ul>
      <SaveState status={status} savedLabel="Saved — guests see it now" className="mt-2" />
    </Panel>
  )
}

export function SupportWindowPanel({
  catalogueId,
  studioName,
  until,
}: {
  catalogueId: string
  studioName: string
  /** ISO timestamp while the window is open, otherwise null. */
  until: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<SaveStatus>('idle')
  const open = until !== null && new Date(until).getTime() > Date.now()

  const set = async (days: 0 | 7 | 14) => {
    setStatus('saving')
    const result = await patch(catalogueId, { supportDays: days })
    setStatus(result.ok ? 'saved' : 'error')
    if (result.ok) router.refresh()
  }

  return (
    <Panel
      title={`${studioName}'s access`}
      hint="Off since the handover. Open a window if you want them to fix or re-style something — it closes on its own, so there is nothing to remember to switch off."
    >
      <p className="mb-3 text-[14px]">
        {open
          ? `Open until ${new Date(until).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.`
          : 'Closed. Only you can change this page.'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void set(7)} disabled={status === 'saving'} className={secondary}>
          Open for 7 days
        </button>
        <button type="button" onClick={() => void set(14)} disabled={status === 'saving'} className={secondary}>
          14 days
        </button>
        {open ? (
          <button type="button" onClick={() => void set(0)} disabled={status === 'saving'} className={secondary}>
            Close now
          </button>
        ) : null}
        <SaveState status={status} />
      </div>
    </Panel>
  )
}

export function CloseAccountPanel() {
  const router = useRouter()
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)

  const close = async () => {
    setBusy(true)
    const response = await fetch('/api/my/close', { method: 'POST' })
    if (response.ok) {
      router.replace('/login?door=couple')
      router.refresh()
      return
    }
    setBusy(false)
  }

  return (
    <Panel
      title="Close this account"
      hint="Nothing is deleted. Your pages keep serving and archive on their own schedule; you stop being able to sign in. Write to us if you change your mind."
    >
      <label className="mb-2 block text-[13px]">
        Type <span className="font-mono font-semibold">close</span> to confirm
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoCapitalize="none"
          className="h-10 w-[160px] rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 font-mono text-[14px]"
        />
        <button
          type="button"
          onClick={() => void close()}
          disabled={confirm.trim() !== 'close' || busy}
          className={`${button} bg-[var(--color-error)] text-white`}
        >
          {busy ? 'Closing…' : 'Close account'}
        </button>
      </div>
    </Panel>
  )
}
