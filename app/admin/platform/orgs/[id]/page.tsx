import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusPill } from '@/components/admin/AdminChrome'
import { OrgCreditsControl } from '@/components/admin/OrgCreditsControl'
import { OrgQuotaControl } from '@/components/admin/OrgQuotaControl'
import { OrgStatusControl } from '@/components/admin/OrgStatusControl'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { DEFAULT_LIMITS } from '@/lib/entitlements'
import { formatWeddingDate } from '@/lib/format'
import { publicUrlOf } from '@/lib/address'

export const dynamic = 'force-dynamic'

/**
 * One org's catalogues, for when a partner writes in asking why something looks wrong (N-16).
 *
 * **Almost read-only, and no deeper than this.** It lists what exists and links to the guest page
 * a guest would see. There is still no route from here into the customizer, the films tab or any
 * catalogue write — support means being able to describe what the partner is describing, not
 * being able to change it.
 *
 * The one exception is suspension (N-27), which is a platform decision rather than a support
 * action and cannot be delegated to the studio for obvious reasons. It is recorded, and the trail
 * is shown on this page rather than somewhere only a database client can reach.
 */
export default async function PlatformOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const { id } = await params
  const repository = getRepository()
  const org = await repository.getOrg(id)
  if (!org) notFound()

  // The one place an org id from the URL is trusted — and it is safe precisely because the
  // caller has already been proven to be a platform admin, who by design belongs to no org and
  // therefore cannot be "escalating" into one.
  const [catalogues, operators, audit, entitlement, balance] = await Promise.all([
    repository.listCatalogues({ orgId: org.id }),
    repository.listOperators(org.id),
    repository.listPlatformAudit({ orgId: org.id, limit: 20 }),
    repository.getOrgEntitlement(org.id),
    repository.creditBalance(org.id, new Date().toISOString()),
  ])

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <Link
        href="/admin/platform"
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]"
      >
        <span aria-hidden>←</span> All orgs
      </Link>

      <header className="mb-5">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">{org.name}</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          {org.kind} · <code className="text-[12px]">{org.slug}</code>
          {org.status === 'suspended' ? ' · suspended' : null}
        </p>
      </header>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <OrgStatusControl orgId={org.id} orgName={org.name} status={org.status} />

        <OrgQuotaControl
          orgId={org.id}
          orgName={org.name}
          storageGb={entitlement?.storageGb ?? null}
          defaultGb={DEFAULT_LIMITS.storageGb}
        />

        {/* Studios spend credits; a couple's account starts with none and is granted one here too. */}
        <OrgCreditsControl orgId={org.id} orgName={org.name} balance={balance} />

        <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
          <p className="mb-2 text-[15px] font-semibold">
            Who can sign in {operators.length > 0 ? `(${operators.length})` : ''}
          </p>
          {operators.length === 0 ? (
            /* Not a cosmetic empty state. An org with no operators cannot be signed into at all,
               and it is invisible from every other surface — `kalyanam` reached exactly this state
               when auth users were deleted and `on delete cascade` took the operators with them. */
            <p className="text-[13px] text-[var(--color-error)]">
              Nobody. This org cannot be signed into — its catalogues are intact, but an operator
              row has to be created before anyone can reach them.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {operators.map((operator) => (
                <li key={operator.id} className="text-[13px]">
                  <span className="font-medium">{operator.email}</span>
                  <span className="text-[var(--color-l-text-mid)]"> · {operator.role}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {catalogues.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
          This org has no catalogues.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {catalogues.map((catalogue) => (
            <li
              key={catalogue.id}
              className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-[16px] font-semibold">{catalogue.coupleName.en}</p>
                <StatusPill status={catalogue.status} />
              </div>
              <p className="text-[13px] text-[var(--color-l-text-mid)]">
                {formatWeddingDate(catalogue.weddingDate, 'en')} · included until{' '}
                {formatWeddingDate(catalogue.includedUntil, 'en')}
              </p>
              <p className="mt-2">
                {/* The guest page, which is what a partner is usually describing. */}
                <a
                  href={publicUrlOf(catalogue)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[12px] underline underline-offset-4"
                >
                  /{catalogue.slug}
                </a>
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 mb-2 text-[15px] font-semibold">What has been done to this org</h2>
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
