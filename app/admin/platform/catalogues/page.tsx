import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusPill } from '@/components/admin/AdminChrome'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { formatWeddingDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * Every catalogue across every studio (doc 16 §8), searchable, with its state and renewal date —
 * the renewal season's worklist, and where a "can you take this down" lands.
 */
export default async function PlatformCataloguesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const { q = '' } = await searchParams
  const repository = getRepository()
  const [catalogues, orgs] = await Promise.all([repository.listAllCatalogues(), repository.listOrgs()])
  const orgName = new Map(orgs.map((org) => [org.id, org.name]))

  const needle = q.trim().toLowerCase()
  const rows = catalogues
    .filter((catalogue) =>
      needle
        ? `${catalogue.coupleName.en} ${catalogue.slug} ${orgName.get(catalogue.orgId) ?? ''}`
            .toLowerCase()
            .includes(needle)
        : true,
    )
    // Soonest to lapse first: that is the order the renewal work is done in.
    .sort((a, b) => a.includedUntil.localeCompare(b.includedUntil))

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Catalogues</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          {catalogues.length} across the platform, soonest to lapse first.
        </p>
      </header>
      <PlatformNav />

      <form method="get" className="mb-5 flex gap-2">
        <label className="sr-only" htmlFor="catalogue-search">
          Search catalogues
        </label>
        <input
          id="catalogue-search"
          name="q"
          defaultValue={q}
          placeholder="Couple, address or studio"
          className="h-10 w-[300px] rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
        />
        <button type="submit" className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-4 text-[14px] font-semibold">
          Search
        </button>
      </form>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
          {needle ? 'Nothing matches that.' : 'No catalogues yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
          <table className="w-full border-collapse bg-white text-[14px]">
            <thead>
              <tr className="border-b border-[var(--color-l-line)] text-start">
                <Th>Couple</Th>
                <Th>Owner</Th>
                <Th>State</Th>
                <Th>Wedding</Th>
                <Th>Serving until</Th>
                <Th>Term</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((catalogue) => (
                <tr key={catalogue.id} className="border-b border-[var(--color-l-line)] last:border-0">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/platform/catalogues/${catalogue.id}`} className="font-medium underline-offset-4 hover:underline">
                      {catalogue.coupleName.en}
                    </Link>
                    <code className="ms-2 text-[12px] text-[var(--color-l-text-mid)]">{catalogue.slug}</code>
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/platform/orgs/${catalogue.orgId}`} className="underline-offset-4 hover:underline">
                      {orgName.get(catalogue.orgId) ?? '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={catalogue.status} />
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-[var(--color-l-text-mid)]">
                    {formatWeddingDate(catalogue.weddingDate, 'en')}
                  </td>
                  <td className="px-3 py-2.5 text-[13px] tabular-nums">{catalogue.includedUntil.slice(0, 10)}</td>
                  <td className="px-3 py-2.5 text-[13px] text-[var(--color-l-text-mid)]">{catalogue.subStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th scope="col" className="px-3 py-2 text-start type-label text-[var(--color-l-text-mid)]">
      {children}
    </th>
  )
}
