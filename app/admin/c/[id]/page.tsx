import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { AttentionChip } from '@/components/admin/CatalogueBoard'
import { CatalogueAnalytics } from '@/components/admin/CatalogueAnalytics'
import { CoupleAccountPanel } from '@/components/admin/CoupleAccountPanel'
import { HandoverPanel } from '@/components/admin/HandoverPanel'
import { PublicLink } from '@/components/admin/PublicLink'
import { SendToCouple } from '@/components/admin/SendToCouple'
import { SetupChecklist } from '@/components/admin/SetupChecklist'
import { getEditableCatalogue, getSessionOrg } from '@/lib/admin/session'
import { catalogueAttention } from '@/lib/admin/catalogue-health'
import { setupChecklist } from '@/lib/admin/setup-checklist'
import { hoursFor, resolveLimits, storageUsage } from '@/lib/entitlements'
import { getRepository } from '@/lib/db'
import { formatWeddingDate } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import { render } from '@/lib/notify/templates'
import { publicUrlOf } from '@/lib/address'

export const dynamic = 'force-dynamic'

export default async function CatalogueOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const editable = await getEditableCatalogue(id)
  if (!editable) {
    const { getOperatorSession } = await import('@/lib/admin/session')
    if (!(await getOperatorSession())) redirect('/admin/login')
    notFound()
  }
  const { session, catalogue, via } = editable
  const repository = getRepository()

  const [titles, photos, org, transfer, grants, usedBytes] = await Promise.all([
    repository.listTitles(catalogue.id),
    repository.listPhotosForCatalogue(catalogue.id),
    getSessionOrg(session),
    repository.getLiveTransferForCatalogue(catalogue.id),
    repository.getEntitlements(catalogue.id, catalogue.orgId),
    repository.catalogueStorageBytes(catalogue.id),
  ])

  // The couple's account, when the studio has issued one (D-37): who signs in, and to what.
  const coupleOrg = catalogue.coupleOrgId ? await repository.getOrg(catalogue.coupleOrgId) : null
  const coupleOperator = coupleOrg ? (await repository.listOperators(coupleOrg.id))[0] ?? null : null
  const linkedCouple = coupleOperator ? { email: coupleOperator.email, name: coupleOperator.name } : null

  const limits = resolveLimits(grants.catalogue, grants.org)

  const counts = {
    titles: titles.length,
    ready: titles.filter((t) => t.status === 'ready').length,
    published: titles.filter((t) => t.published).length,
    failed: titles.filter((t) => t.status === 'failed').length,
    photos: photos.length,
  }

  const checklist = setupChecklist(catalogue, counts)
  const usage = storageUsage(usedBytes, limits)
  const capacity = hoursFor(limits.storageGb)
  const attention = catalogueAttention({
    status: catalogue.status,
    subStatus: catalogue.subStatus,
    counts,
    includedUntil: catalogue.includedUntil,
  })
  const url = publicUrlOf(catalogue)

  // A couple has nobody to hand their own wedding to, and a studio inside a support window is
  // there to fix the page, not to move it (doc 16 §3).
  const canHandOver = org?.kind === 'partner' && via === 'owner'

  /**
   * The delivery copy, composed here from the same template the email uses (N-36). Rendering it
   * on the server keeps the two channels saying the same thing in the same language — the
   * alternative is a second copy of the words in a client component, which is how the two drift.
   */
  const deliveryMessage = render('delivery', catalogue.locale, {
    coupleName: resolveLocalised(catalogue.coupleName, catalogue.locale),
    studioName: catalogue.branding.presentedBy ?? 'your studio',
    url,
    date: formatWeddingDate(catalogue.includedUntil, catalogue.locale),
  }).text

  // Prefilled from the couple's account, or from a handover already in flight: that address is
  // the couple's, and retyping it is a chance to get it wrong.
  const outstandingTransferEmail = linkedCouple?.email ?? transfer?.toEmail ?? null

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org?.name}
      orgKind={org?.kind}
      catalogue={{
        id: catalogue.id,
        name: catalogue.coupleName.en,
        slug: catalogue.slug,
        status: catalogue.status,
      }}
    >
      {via === 'support' ? (
        <p className="mb-5 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-warn)_45%,white)] bg-[color-mix(in_srgb,var(--color-warn)_10%,white)] px-4 py-3 text-[13px]">
          <strong className="font-semibold">On the couple&rsquo;s invitation.</strong> This wedding is
          theirs now; they opened a window for you until{' '}
          {catalogue.supportAccessUntil ? formatWeddingDate(catalogue.supportAccessUntil, 'en') : 'they close it'}
          . Films, photographs, sections and branding are yours to fix; the settings and the
          handover are not.
        </p>
      ) : null}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <AttentionChip attention={attention} />
        <p className="text-[13px] text-[var(--color-l-text-mid)]">
          Wedding {formatWeddingDate(catalogue.weddingDate, 'en')} · included until{' '}
          {formatWeddingDate(catalogue.includedUntil, 'en')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="grid gap-3 sm:grid-cols-3">
            {/*
              Storage rather than a film count, because storage is what the plan sells and what a
              catalogue actually costs. "9 of 15 films" measured the wrong thing and refused the
              wrong uploads.
            */}
            <Stat
              label="Storage"
              value={`${usage.usedGb.toFixed(1)} of ${usage.limitGb} GB`}
              hint={
                // What the plan holds, not just what is left of it (N-23, PRICING.md §6). A
                // partner asks "is 100 GB a lot?" and the honest answer is in hours of film.
                usage.level === 'ok'
                  ? `about ${capacity.standard} hrs at 720p · ${capacity.fullHd} at Full HD`
                  : undefined
              }
            />
            <Stat label="Films" value={`${counts.titles} · ${counts.ready} ready`} />
            <Stat label="Shown to guests" value={`${counts.published}`} />
          </div>

          {usage.level !== 'ok' ? (
            /**
             * The warning `PRICING.md` §6 asks for, and it exists to prevent one specific failure:
             * a partner meeting the cap at 80% *uploaded*, which is the middle of a wedding and
             * hours into a slow connection. At 80% *used* there is still time to buy space or drop
             * the ladder to 720p, and both of those are said here rather than left to be guessed.
             */
            <div className="mt-4 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-warn)_45%,white)] bg-[color-mix(in_srgb,var(--color-warn)_10%,white)] p-4">
              <p className="text-[14px] font-semibold">
                {usage.level === 'full'
                  ? 'This plan is full'
                  : `${Math.round(usage.ratio * 100)}% of this plan is used`}
              </p>
              <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
                {(usage.limitGb - usage.usedGb).toFixed(1)} GB left — roughly{' '}
                {hoursFor(Math.max(usage.limitGb - usage.usedGb, 0)).standard} hours more at 720p.
                Extra storage is ₹25 per GB per month, or keep the long functions at 720p and put
                the films people rewatch in Full HD.
              </p>
            </div>
          ) : null}

          {counts.failed > 0 ? (
            <div className="mt-4 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-error)_40%,white)] bg-[color-mix(in_srgb,var(--color-error)_8%,white)] p-4">
              <p className="text-[14px] font-semibold">
                {counts.failed} film{counts.failed > 1 ? 's' : ''} failed to process
              </p>
              <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
                Nothing is silently missing —{' '}
                <Link
                  href={`/admin/c/${catalogue.id}/titles`}
                  className="font-semibold underline underline-offset-4"
                >
                  open Films
                </Link>{' '}
                to see the reason and retry.
              </p>
            </div>
          ) : null}

          <div className="mt-4">
            <CatalogueAnalytics titles={titles} />
          </div>

          <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
            <h2 className="text-[15px] font-semibold">The link</h2>
            <p className="mb-3 mt-1 text-[13px] text-[var(--color-l-text-mid)]">
              Unlisted and never indexed. Anyone with this link can watch.
            </p>
            <PublicLink url={url} status={catalogue.status} />
          </section>

          {/*
            Beside the link rather than on its own screen (N-36): the operator who has just
            checked the address is the operator about to send it, and the two thoughts are one.
            Published only — a delivery message pointing at "not yet available" gets forwarded to
            two hundred people who all open nothing.
          */}
          {canHandOver && catalogue.status === 'published' ? (
            <div className="mt-4">
              <SendToCouple
                catalogueId={catalogue.id}
                message={deliveryMessage}
                defaultEmail={outstandingTransferEmail}
              />
            </div>
          ) : null}

          {canHandOver ? (
            <div className="mt-4">
              <CoupleAccountPanel catalogueId={catalogue.id} linked={linkedCouple} />
            </div>
          ) : null}

          {canHandOver ? (
            <div className="mt-4">
              <HandoverPanel
                catalogueId={catalogue.id}
                linkedEmail={linkedCouple?.email ?? null}
                outstanding={
                  transfer
                    ? {
                        toEmail: transfer.toEmail,
                        expiresAtLabel: formatWeddingDate(transfer.expiresAt, 'en'),
                      }
                    : null
                }
              />
            </div>
          ) : null}

          <div className="mt-5 flex flex-wrap gap-2">
            <Link
              href={`/admin/c/${catalogue.id}/titles`}
              className="inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-accent px-5 font-semibold text-accent-ink"
            >
              Upload and title films
            </Link>
            <Link
              href={`/admin/c/${catalogue.id}/customizer`}
              className="inline-flex h-11 items-center rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-5 font-semibold"
            >
              Arrange and publish
            </Link>
          </div>
        </div>

        <SetupChecklist checklist={checklist} />
      </div>
    </AdminChrome>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
      <p className="type-label text-[var(--color-l-text-mid)]">{label}</p>
      <p className="mt-1 text-[24px] font-bold tracking-[-0.02em]">{value}</p>
      {/* Only where a number needs translating. "100 GB" means nothing to someone deciding
          whether to buy it; "about 46 hours at 720p" does. */}
      {hint ? <p className="mt-1 text-[12px] text-[var(--color-l-text-mid)]">{hint}</p> : null}
    </div>
  )
}
