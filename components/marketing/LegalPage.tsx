import Link from 'next/link'
import type { ReactNode } from 'react'

/**
 * The shell both legal pages use (N-51). Plain prose on the reading width, because the point of
 * these pages is that a studio owner can actually read them.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <div className="min-h-svh bg-surface-0">
      <header className="gutter-x mx-auto flex max-w-[720px] items-center justify-between py-6">
        <Link href="/" className="type-title underline-offset-4 hover:underline">
          Mehfilbox
        </Link>
        <Link href="/admin" className="type-meta text-text-mid underline-offset-4 hover:underline">
          Studio sign in
        </Link>
      </header>
      <main className="gutter-x mx-auto max-w-[720px] pb-24">
        <h1 className="type-display-lg mb-2">{title}</h1>
        <p className="type-meta mb-10 text-text-lo">Last updated {updated}</p>
        <div className="flex flex-col gap-6 text-text-mid [&_h2]:mt-6 [&_h2]:text-text-hi [&_strong]:text-text-hi">
          {children}
        </div>
      </main>
    </div>
  )
}
