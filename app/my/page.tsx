import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PublicLink } from '@/components/admin/PublicLink'
import { CoupleChrome } from '@/components/my/CoupleChrome'
import { publicUrlOf } from '@/lib/address'
import { getOperatorSession } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { formatWeddingDate } from '@/lib/format'
import { getCoupleSession, relationOf } from '@/lib/my/session'
import type { Catalogue, Org } from '@/lib/schema'

export const dynamic = 'force-dynamic'

const OCCASION_LABEL: Record<Catalogue['occasion'], string> = {
  wedding: 'Wedding',
  anniversary: 'Anniversary',
  proposal: 'Proposal',
  birthday: 'Birthday',
  engagement: 'Engagement',
}

/**
 * The couple's home (D-37): everything their account owns or is linked to, from any studio, each
 * with its status, its link and who made it. A couple with one wedding sees one card; the account
 * is built for the anniversary that comes after it.
 */
export default async function MyPage() {
  const couple = await getCoupleSession()
  if (!couple) {
    // A studio operator who typed /my belongs in the console; a stranger belongs at the door.
    if (await getOperatorSession()) redirect('/admin')
    redirect('/login?door=couple')
  }

  const repository = getRepository()
  const catalogues = await repository.listCataloguesForCouple(couple.org.id)

  // Who made each one — usually one studio, sometimes two, never a query per card.
  const makerIds = [...new Set(catalogues.map((c) => c.originOrgId).filter((id): id is string => !!id))]
  const makers = new Map<string, Org>()
  for (const id of makerIds) {
    const org = await repository.getOrg(id)
    if (org) makers.set(id, org)
  }

  return (
    <CoupleChrome name={couple.session.operator.name} email={couple.session.operator.email} orgName={couple.org.name}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-[-0.01em]">Your weddings</h1>
          <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
            Everything made for you, in one place — however many studios it took.
          </p>
        </div>
        <Link
          href="/admin/new"
          className="inline-flex h-10 items-center rounded-[var(--radius-pill)] border border-[var(--color-l-line)] bg-white px-4 text-[13px] font-semibold"
        >
          Start a catalogue of your own
        </Link>
      </div>

      {catalogues.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] bg-white px-6 py-12 text-center text-[14px] text-[var(--color-l-text-mid)]">
          Nothing here yet. When your studio links a wedding to this address it appears here — or
          start one of your own for an anniversary, a birthday, a naming day.
        </p>
      ) : (
        <ul aria-label="Your catalogues" className="grid gap-4 sm:grid-cols-2">
          {catalogues.map((catalogue) => {
            const relation = relationOf(catalogue, couple.org.id)
            const maker = catalogue.originOrgId ? makers.get(catalogue.originOrgId) : null
            const madeByYou = catalogue.originOrgId === couple.org.id
            const live = catalogue.status === 'published'
            const paused = catalogue.subStatus === 'grace' || catalogue.subStatus === 'cold' || catalogue.subStatus === 'lapsed'
            return (
              <li key={catalogue.id} className="flex flex-col rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
                <p className="type-label text-[var(--color-l-text-mid)]">
                  {OCCASION_LABEL[catalogue.occasion]} · {formatWeddingDate(catalogue.weddingDate, 'en')}
                </p>
                <h2 className="mt-1 text-[19px] font-semibold leading-tight">{catalogue.coupleName.en}</h2>
                <p className="mt-1.5 text-[13px] text-[var(--color-l-text-mid)]">
                  {relation === 'linked'
                    ? `Being prepared by ${maker?.name ?? 'your studio'}`
                    : madeByYou
                      ? 'Made by you'
                      : `Filmed by ${maker?.name ?? 'your studio'}`}
                  {' · '}
                  {paused ? 'Paused' : live ? 'Live' : 'Not published yet'}
                </p>

                {live ? (
                  <div className="mt-3">
                    <PublicLink url={publicUrlOf(catalogue)} status={catalogue.status} compact />
                  </div>
                ) : null}

                <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--color-l-line)] pt-3">
                  <Link
                    href={`/my/c/${catalogue.id}`}
                    className="rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-3.5 py-1.5 text-[13px] font-semibold text-white"
                  >
                    Manage
                  </Link>
                  {live ? (
                    <a
                      href={publicUrlOf(catalogue)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3.5 py-1.5 text-[13px] text-[var(--color-l-text-mid)]"
                    >
                      Open
                    </a>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </CoupleChrome>
  )
}
