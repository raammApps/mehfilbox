import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CreateStudioForm } from '@/components/admin/CreateStudioForm'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

/** Every studio (doc 16 §8): search, status, credits, catalogues — and the door to make one. */
export default async function PlatformStudiosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const { q = '' } = await searchParams
  const repository = getRepository()
  const now = new Date().toISOString()
  const [orgs, counts] = await Promise.all([repository.listOrgs('partner'), repository.catalogueCountsByOrg()])
  const needle = q.trim().toLowerCase()
  const studios = needle
    ? orgs.filter((org) => `${org.name} ${org.slug}`.toLowerCase().includes(needle))
    : orgs
  const balances = await Promise.all(studios.map((org) => repository.creditBalance(org.id, now)))

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Studios</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          Self-registration stays open; this is for the one sold over the phone.
        </p>
      </header>
      <PlatformNav />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <form method="get" className="flex gap-2">
          <label className="sr-only" htmlFor="studio-search">
            Search studios
          </label>
          <input
            id="studio-search"
            name="q"
            defaultValue={q}
            placeholder="Name or address"
            className="h-10 w-[260px] rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 text-[14px]"
          />
          <button type="submit" className="h-10 rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-4 text-[14px] font-semibold">
            Search
          </button>
        </form>
        <CreateStudioForm />
      </div>

      {studios.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
          {needle ? 'No studio matches that.' : 'No studios yet.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
          <table className="w-full border-collapse bg-white text-[14px]">
            <thead>
              <tr className="border-b border-[var(--color-l-line)] text-start">
                <Th>Studio</Th>
                <Th>Access</Th>
                <Th>Address</Th>
                <Th>Catalogues</Th>
                <Th>Credits</Th>
                <Th>Since</Th>
              </tr>
            </thead>
            <tbody>
              {studios.map((org, index) => (
                <tr key={org.id} className="border-b border-[var(--color-l-line)] last:border-0">
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/platform/orgs/${org.id}`} className="font-medium underline-offset-4 hover:underline">
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">
                    {org.status === 'suspended' ? (
                      <span className="font-medium text-[var(--color-error)]">Suspended</span>
                    ) : (
                      <span className="text-[var(--color-l-text-mid)]">Active</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <code className="text-[12px] text-[var(--color-l-text-mid)]">{org.slug}</code>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{counts[org.id] ?? 0}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {balances[index]?.available ?? 0}
                    <span className="text-[var(--color-l-text-mid)]"> · {balances[index]?.consumed ?? 0} spent</span>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-[var(--color-l-text-mid)]">
                    {new Date(org.createdAt).toLocaleDateString('en-IN')}
                  </td>
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
