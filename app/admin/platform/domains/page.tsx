import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MarkAttachedButton } from '@/components/admin/DomainAdmin'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'

export const dynamic = 'force-dynamic'

/**
 * Every custom domain and its status (doc 16 §8), awaiting attachment first. With no
 * `DomainProvider` configured, a verified domain waits here until a person adds it to the host
 * and says so — honest, rather than a status that says "active" about a domain nobody attached.
 */
export default async function PlatformDomainsPage() {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const repository = getRepository()
  const [domains, orgs] = await Promise.all([repository.listAllDomains(), repository.listOrgs()])
  const orgName = new Map(orgs.map((org) => [org.id, org.name]))
  const manual = env.DOMAIN_DRIVER === 'none'
  const waiting = domains.filter((domain) => domain.status === 'verified').length

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Domains</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          {manual
            ? `Attachment is by hand on this deployment (DOMAIN_DRIVER=none): add a verified domain to the hosting project, then mark it here.${waiting > 0 ? ` ${waiting} waiting.` : ''}`
            : `Attachment is automatic (${env.DOMAIN_DRIVER}); a verified domain goes live on its own.`}
        </p>
      </header>
      <PlatformNav />

      {domains.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
          No custom domains yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
          <table className="w-full border-collapse bg-white text-[14px]">
            <thead>
              <tr className="border-b border-[var(--color-l-line)] text-start">
                <Th>Host</Th>
                <Th>Whose</Th>
                <Th>Serves</Th>
                <Th>Status</Th>
                <Th>Last seen</Th>
                <Th><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {domains.map((domain) => (
                <tr key={domain.id} className="border-b border-[var(--color-l-line)] align-top last:border-0">
                  <td className="px-3 py-2.5 font-mono text-[13px]">{domain.host}</td>
                  <td className="px-3 py-2.5">
                    <Link href={`/admin/platform/orgs/${domain.orgId}`} className="underline-offset-4 hover:underline">
                      {orgName.get(domain.orgId) ?? '—'}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-[13px] text-[var(--color-l-text-mid)]">
                    {domain.catalogueId ? (
                      <Link href={`/admin/platform/catalogues/${domain.catalogueId}`} className="underline-offset-4 hover:underline">
                        one wedding
                      </Link>
                    ) : (
                      'every wedding the studio makes'
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span data-status={domain.status} className={domain.status === 'failed' ? 'font-medium text-[var(--color-error)]' : domain.status === 'active' ? 'font-medium' : ''}>
                      {domain.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[var(--color-l-text-mid)]">
                    {domain.lastCheckedAt ? new Date(domain.lastCheckedAt).toLocaleString('en-IN') : 'never checked'}
                    {domain.error ? <span className="block">{domain.error}</span> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    {domain.status === 'verified' || domain.status === 'failed' ? (
                      <MarkAttachedButton domainId={domain.id} host={domain.host} />
                    ) : null}
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
