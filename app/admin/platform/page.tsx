import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { probeAll, summarise } from '@/lib/health/probes'

export const dynamic = 'force-dynamic'

/**
 * The platform dashboard (doc 16 §8, D-39): what is on the platform, at a glance, and what was
 * last done to it. A platform admin is not a member of any org, so nothing here falls out of an
 * existing scoped query — every number is a platform-wide read written for this page.
 *
 * The writes doc 15 §1 said to add one at a time live on the pages beside this one, each
 * recorded; the audit page is where the record is read.
 */
export default async function PlatformPage() {
  const admin = await getPlatformAdmin()
  // Not a redirect to login: an operator who wanders here should not learn the surface exists.
  if (!admin) notFound()

  const repository = getRepository()
  const now = new Date().toISOString()
  const [orgs, catalogues, audit] = await Promise.all([
    repository.listOrgs(),
    repository.listAllCatalogues(),
    repository.listPlatformAudit({ limit: 10 }),
  ])
  const [balances, health] = await Promise.all([
    Promise.all(orgs.map((org) => repository.creditBalance(org.id, now))),
    // Remembered for a minute by the probes themselves, so the dashboard costs no extra calls.
    probeAll().then(summarise),
  ])

  const partners = orgs.filter((org) => org.kind === 'partner')
  const couples = orgs.filter((org) => org.kind === 'couple')
  const live = catalogues.filter((catalogue) => catalogue.status === 'published').length
  const outstanding = balances.reduce((total, balance) => total + balance.available, 0)
  const suspended = partners.filter((org) => org.status === 'suspended').length

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Platform</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          Signed in as {admin.name}. Every write here is recorded under Audit.
        </p>
      </header>
      <PlatformNav />

      <dl aria-label="At a glance" className="mb-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Studios" value={partners.length} hint={suspended > 0 ? `${suspended} suspended` : undefined} href="/admin/platform/studios" />
        <Stat label="Couples" value={couples.length} href="/admin/platform/couples" />
        <Stat label="Catalogues" value={catalogues.length} hint={`${live} live · ${catalogues.length - live} draft`} href="/admin/platform/catalogues" />
        <Stat label="Credits outstanding" value={outstanding} hint="unspent, across every studio" />
        <Stat
          label="Health"
          value={health.ok}
          hint={`of ${health.total} services answering${health.state === 'ok' ? '' : health.state === 'down' ? ' — something is down' : ' — something needs a look'}`}
          href="/admin/platform/health"
        />
      </dl>

      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Last done</h2>
        <Link href="/admin/platform/audit" className="text-[13px] underline underline-offset-4">
          The whole trail
        </Link>
      </div>
      {audit.length === 0 ? (
        <p className="text-[13px] text-[var(--color-l-text-mid)]">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {audit.map((entry) => (
            <li
              key={entry.id}
              className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white px-4 py-3 text-[13px]"
            >
              <span className="font-medium">{entry.action}</span>
              {entry.orgSlug ? <code className="ms-2 text-[12px] text-[var(--color-l-text-mid)]">{entry.orgSlug}</code> : null}
              <span className="text-[var(--color-l-text-mid)]">
                {' '}
                by {entry.actorEmail} · {new Date(entry.createdAt).toLocaleString('en-IN')}
              </span>
              {typeof entry.detail.reason === 'string' ? (
                <p className="mt-1 text-[var(--color-l-text-mid)]">{entry.detail.reason}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ label, value, hint, href }: { label: string; value: number; hint?: string; href?: string }) {
  const body = (
    <>
      <dt className="type-label text-[var(--color-l-text-mid)]">{label}</dt>
      <dd className="mt-0.5 text-[26px] font-bold leading-none tracking-[-0.02em]">{value}</dd>
      {hint ? <dd className="mt-1 text-[12px] text-[var(--color-l-text-mid)]">{hint}</dd> : null}
    </>
  )
  const className = 'block rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white px-4 py-3'
  return href ? (
    <Link href={href} className={`${className} hover:border-[var(--color-l-text-mid)]`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}
