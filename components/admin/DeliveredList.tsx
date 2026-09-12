import Link from 'next/link'
import { publicUrlOf } from '@/lib/address'
import { formatWeddingDate } from '@/lib/format'
import type { Catalogue } from '@/lib/schema'

/**
 * What the studio delivered and no longer owns (N-74, doc 16 §3).
 *
 * Before this, a handed-over wedding vanished from the console entirely — which was correct for
 * access and wrong for the business. Under studio-only (D-26) the studio is the renewal
 * mechanism, and a renewal three years after a wedding depends on this list existing. Each row
 * says the one thing a studio can act on: whether the couple has opened a window for them.
 */
export function DeliveredList({ catalogues }: { catalogues: Catalogue[] }) {
  if (catalogues.length === 0) return null
  const now = Date.now()

  return (
    <section aria-label="Delivered" className="mt-10">
      <h2 className="text-[19px] font-bold tracking-[-0.01em]">Delivered</h2>
      <p className="mb-4 mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
        Handed over and now the couple&rsquo;s. Your credit stays on the page; your access does
        not, unless they open a window for you.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {catalogues.map((catalogue) => {
          const windowOpen =
            catalogue.supportAccessUntil !== null && new Date(catalogue.supportAccessUntil).getTime() > now
          const paused =
            catalogue.subStatus === 'grace' || catalogue.subStatus === 'lapsed' || catalogue.subStatus === 'cold'
          return (
            <li key={catalogue.id} className="flex flex-col rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
              <p className="text-[17px] font-semibold leading-tight">{catalogue.coupleName.en}</p>
              <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
                {paused ? 'Paused' : catalogue.status === 'published' ? 'Live' : 'Not published'} · runs to{' '}
                {formatWeddingDate(catalogue.includedUntil, 'en')}
              </p>
              <p className="mt-2 text-[13px]">
                {windowOpen ? (
                  <>
                    <span className="font-semibold text-[#1c5f2a]">Access open</span>
                    <span className="text-[var(--color-l-text-mid)]">
                      {' '}until {formatWeddingDate(catalogue.supportAccessUntil!, 'en')}
                    </span>
                  </>
                ) : (
                  <span className="text-[var(--color-l-text-mid)]">
                    Access closed — the couple can open a window from their account.
                  </span>
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--color-l-line)] pt-3">
                <a
                  href={publicUrlOf(catalogue)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3 py-1.5 text-[13px] text-[var(--color-l-text-mid)]"
                >
                  Open the page
                </a>
                {windowOpen ? (
                  <Link
                    href={`/admin/c/${catalogue.id}/customizer`}
                    className="rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-3 py-1.5 text-[13px] font-semibold text-white"
                  >
                    Open the customizer
                  </Link>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
