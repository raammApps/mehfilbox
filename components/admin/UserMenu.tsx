'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { IconExit } from './icons'

/**
 * Who is signed in, and how to stop being signed in.
 *
 * Both were wrong. The identity sat as grey 12px text at the bottom of the left rail — the one
 * place on a web application nobody looks for it — and there was no way to sign out at all.
 *
 * A menu rather than a permanently visible block: this is checked once a session and then never
 * again, so it should cost a corner of the screen, not a corner of the rail.
 *
 * `router.refresh()` after signing out is load-bearing. Admin pages are server-rendered against
 * the session cookie, and without it a back-button press can repaint a page belonging to the
 * operator who just left.
 */
export function UserMenu({
  name,
  email,
  orgName,
}: {
  name: string
  email?: string
  orgName?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  // Escape and click-outside. A menu that can only be closed by choosing something from it is a
  // trap, and this one sits over every page in the console.
  useEffect(() => {
    if (!open) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  const signOut = async () => {
    setBusy(true)
    await fetch('/api/admin/session', { method: 'DELETE' })
    router.replace('/login')
    router.refresh()
  }

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-haspopup="menu"
        // The name is in the accessible name because the avatar itself is two letters, and
        // "SS" tells a screen reader nothing about whose account this is.
        aria-label={`Account — ${name}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-l-text-hi)] text-[13px] font-semibold text-white transition-opacity hover:opacity-85"
      >
        <span aria-hidden>{initials(name)}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-11 z-30 w-[228px] rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-1.5 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.08),0_12px_28px_-8px_rgba(0,0,0,0.22)]"
        >
          <div className="border-b border-[var(--color-l-line)] px-2.5 pb-2.5 pt-1.5">
            <p className="truncate text-[13px] font-semibold">{name}</p>
            {email ? (
              <p className="truncate text-[12px] text-[var(--color-l-text-mid)]">{email}</p>
            ) : null}
            {orgName ? (
              <p className="mt-1 truncate text-[12px] text-[var(--color-l-text-mid)]">
                Signed in to {orgName}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => void signOut()}
            disabled={busy}
            className="mt-1 flex w-full items-center gap-2.5 rounded-[var(--radius-input)] px-2.5 py-2 text-[13px] transition-colors hover:bg-[var(--color-l-surface-2)] disabled:opacity-50"
          >
            <span aria-hidden className="opacity-80">
              <IconExit />
            </span>
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

/** "Kalyanam Weddings" → "KW"; a single word gives one letter rather than a random second. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]![0]!
  const last = words.length > 1 ? words[words.length - 1]![0]! : ''
  return `${first}${last}`.toUpperCase()
}
