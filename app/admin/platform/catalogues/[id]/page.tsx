import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusPill } from '@/components/admin/AdminChrome'
import { ExtendTermControl, OfflineControl } from '@/components/admin/CatalogueTermControls'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { publicUrlOf } from '@/lib/address'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { formatWeddingDate } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * One catalogue, from the platform (doc 16 §8): its state, its term, and the two writes that are
 * ours rather than the studio's — extend the term, take it offline. Still no road into the
 * customizer or the films: support describes, the studio changes.
 */
export default async function PlatformCataloguePage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const { id } = await params
  const repository = getRepository()
  const catalogue = await repository.getCatalogueById(id)
  if (!catalogue) notFound()

  const [org, origin, audit] = await Promise.all([
    repository.getOrg(catalogue.orgId),
    catalogue.originOrgId && catalogue.originOrgId !== catalogue.orgId
      ? repository.getOrg(catalogue.originOrgId)
      : Promise.resolve(null),
    repository.listPlatformAudit({ orgId: catalogue.orgId, limit: 50 }),
  ])
  const trail = audit.filter((entry) => entry.detail.catalogueId === catalogue.id)

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <Link
        href="/admin/platform/catalogues"
        className="mb-3 inline-flex items-center gap-1 text-[13px] text-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]"
      >
        <span aria-hidden>←</span> Catalogues
      </Link>
      <header className="mb-4">
        <h1 className="flex flex-wrap items-center gap-3 text-[24px] font-bold tracking-[-0.01em]">
          {catalogue.coupleName.en}
          <StatusPill status={catalogue.status} />
        </h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          Owned by{' '}
          <Link href={`/admin/platform/orgs/${catalogue.orgId}`} className="underline underline-offset-4">
            {org?.name ?? 'an org that no longer exists'}
          </Link>
          {origin ? ` · made by ${origin.name}` : ''} · wedding {formatWeddingDate(catalogue.weddingDate, 'en')} ·{' '}
          <code className="text-[12px]">{catalogue.slug}</code> · {catalogue.subStatus}
        </p>
        <p className="mt-1">
          <a href={publicUrlOf(catalogue)} target="_blank" rel="noreferrer" className="font-mono text-[12px] underline underline-offset-4">
            {publicUrlOf(catalogue)}
          </a>
        </p>
      </header>
      <PlatformNav />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <ExtendTermControl catalogueId={catalogue.id} includedUntil={catalogue.includedUntil} />
        <OfflineControl
          catalogueId={catalogue.id}
          status={catalogue.status}
          everPublished={catalogue.publishedAt !== null}
        />
      </div>

      <h2 className="mb-2 text-[15px] font-semibold">What has been done to this wedding</h2>
      {trail.length === 0 ? (
        <p className="text-[13px] text-[var(--color-l-text-mid)]">Nothing yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {trail.map((entry) => (
            <li key={entry.id} className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white px-4 py-3 text-[13px]">
              <span className="font-medium">{entry.action}</span>
              <span className="text-[var(--color-l-text-mid)]">
                {' '}
                by {entry.actorEmail} · {new Date(entry.createdAt).toLocaleString('en-IN')}
              </span>
              {typeof entry.detail.from === 'string' && typeof entry.detail.to === 'string' ? (
                <p className="mt-1 text-[var(--color-l-text-mid)]">
                  {entry.detail.from.slice(0, 10)} → {entry.detail.to.slice(0, 10)}
                </p>
              ) : null}
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
