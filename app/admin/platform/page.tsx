import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Every org on the platform (doc 15 §1, N-16).
 *
 * The first platform-wide view, and written one at a time on purpose: a platform admin is not a
 * member of any org, so nothing here falls out of an existing scoped query.
 *
 * **Read-only, deliberately.** Support means "look at what the partner is describing", and the
 * moment this can edit somebody else's wedding it becomes the most dangerous page in the
 * product. There is no write path from here at all — not a disabled button, none.
 */
export default async function PlatformPage() {
  const admin = await getPlatformAdmin()
  // Not a redirect to login: an operator who wanders here should not learn the surface exists.
  if (!admin) notFound()

  const repository = getRepository()
  const [orgs, counts] = await Promise.all([
    repository.listOrgs(),
    repository.catalogueCountsByOrg(),
  ])
  // One query per org is fine at this size; a `creditBalancesByOrg` is the day it is not.
  const now = new Date().toISOString()
  const balances = Object.fromEntries(
    await Promise.all(orgs.map(async (org) => [org.id, await repository.creditBalance(org.id, now)] as const)),
  )

  const partners = orgs.filter((org) => org.kind === 'partner')
  const couples = orgs.filter((org) => org.kind === 'couple')
  const catalogues = Object.values(counts).reduce((total, n) => total + n, 0)

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.01em]">Platform</h1>
          <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
            Signed in as {admin.name}. Read-only, apart from suspending a studio and the themes.
          </p>
        </div>
        <nav aria-label="Platform" className="flex flex-wrap gap-4 text-[13px]">
          <Link href="/admin/platform/themes" className="underline underline-offset-4">
            Themes
          </Link>
          <Link href="/admin" className="underline underline-offset-4">
            My own console
          </Link>
        </nav>
      </header>

      <dl aria-label="At a glance" className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Partners" value={partners.length} />
        <Stat label="Couples" value={couples.length} />
        <Stat label="Catalogues" value={catalogues} />
      </dl>

      <h2 className="mb-2 text-[15px] font-semibold">Every org</h2>
      {orgs.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
          Nobody has registered yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
          <table className="w-full border-collapse bg-white text-[14px]">
            <thead>
              <tr className="border-b border-[var(--color-l-line)] text-start">
                <Th>Name</Th>
                <Th>Kind</Th>
                <Th>Access</Th>
                <Th>Address</Th>
                <Th>Catalogues</Th>
                <Th>Credits</Th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((org) => (
                <tr key={org.id} className="border-b border-[var(--color-l-line)] last:border-0">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/platform/orgs/${org.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {org.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-l-text-mid)]">{org.kind}</td>
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
                    {balances[org.id]?.available ?? 0}
                    <span className="text-[var(--color-l-text-mid)]"> · {balances[org.id]?.consumed ?? 0} spent</span>
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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white px-4 py-3">
      <dt className="type-label text-[var(--color-l-text-mid)]">{label}</dt>
      <dd className="mt-0.5 text-[26px] font-bold leading-none tracking-[-0.02em]">{value}</dd>
    </div>
  )
}
