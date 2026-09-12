import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Your weddings — Mehfilbox', robots: { index: false, follow: false } }

/**
 * The couple's account runs on the light set, like the console (doc 04 §2) — a person here is
 * reading and deciding, not watching. Deliberately not a second operator console (D-37): the
 * chrome is smaller and the vocabulary is theirs.
 */
export default function MyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-svh"
      style={{
        colorScheme: 'light',
        background: 'var(--color-l-surface-0)',
        color: 'var(--color-l-text-hi)',
      }}
    >
      {children}
    </div>
  )
}
