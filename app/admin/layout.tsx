import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Mehfilbox — admin', robots: { index: false, follow: false } }

/**
 * The admin runs on the light set (doc 04 §2) — an operator spends thirty minutes here in an
 * office, not two minutes here in the dark. The guest surface stays near-black.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
