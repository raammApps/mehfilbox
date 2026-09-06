import Link from 'next/link'

export const metadata = { title: 'Mehfilbox' }

/**
 * The root domain. Phase 0 sells in person, from a phone (doc 03 "not wireframed"), so this is
 * a signpost rather than a marketing site.
 */
export default function RootPage() {
  return (
    <main className="gutter-x mx-auto flex min-h-svh max-w-[640px] flex-col justify-center">
      <h1 className="type-display-lg mb-3">Mehfilbox</h1>
      <p className="type-body-lg mb-8 text-text-mid">
        A wedding&rsquo;s best moments, presented as the couple&rsquo;s own private streaming
        service.
      </p>
      <Link
        href="/admin"
        className="inline-flex h-12 w-fit items-center rounded-[var(--radius-pill)] bg-accent px-6 font-semibold text-accent-ink"
      >
        Operator sign in
      </Link>
    </main>
  )
}
