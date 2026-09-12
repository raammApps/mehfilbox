import Link from 'next/link'
import { notFound } from 'next/navigation'
import { StatusPill } from '@/components/admin/AdminChrome'
import { PasswordLinkButton } from '@/components/admin/OperatorControls'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Every couple's account with its catalogues (doc 16 §8) — the support view for "we can't get
 * in", which is the one thing a couple writes to us about. One write: a set-password link.
 */
export default async function PlatformCouplesPage() {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  const repository = getRepository()
  const couples = await repository.listOrgs('couple')
  const rows = await Promise.all(
    couples.map(async (org) => ({
      org,
      operators: await repository.listOperators(org.id),
      catalogues: await repository.listCataloguesForCouple(org.id),
    })),
  )

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1100px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Couples</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          Accounts issued by studios, and what each one can see.
        </p>
      </header>
      <PlatformNav />

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
          No couple accounts yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map(({ org, operators, catalogues }) => (
            <li key={org.id} className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-[16px] font-semibold">
                  <Link href={`/admin/platform/orgs/${org.id}`} className="underline-offset-4 hover:underline">
                    {org.name}
                  </Link>
                </p>
                <span className="text-[12px] text-[var(--color-l-text-mid)]">
                  since {new Date(org.createdAt).toLocaleDateString('en-IN')}
                </span>
              </div>
              <ul className="mt-2 flex flex-col gap-1.5">
                {operators.map((operator) => (
                  <li key={operator.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-medium">{operator.email}</span>
                    <PasswordLinkButton operatorId={operator.id} email={operator.email} />
                  </li>
                ))}
                {operators.length === 0 ? (
                  <li className="text-[13px] text-[var(--color-error)]">Nobody can sign in to this account.</li>
                ) : null}
              </ul>
              <ul className="mt-3 flex flex-wrap gap-2">
                {catalogues.map((catalogue) => (
                  <li key={catalogue.id} className="flex items-center gap-2 rounded-[var(--radius-input)] border border-[var(--color-l-line)] px-3 py-1.5 text-[13px]">
                    <Link href={`/admin/platform/catalogues/${catalogue.id}`} className="font-medium underline-offset-4 hover:underline">
                      {catalogue.coupleName.en}
                    </Link>
                    <StatusPill status={catalogue.status} />
                    <span className="text-[var(--color-l-text-mid)]">
                      {catalogue.orgId === org.id ? 'theirs' : 'being prepared'}
                    </span>
                  </li>
                ))}
                {catalogues.length === 0 ? (
                  <li className="text-[13px] text-[var(--color-l-text-mid)]">No catalogues.</li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
