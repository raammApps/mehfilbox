import { redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { CatalogueBoard, type CatalogueRow } from '@/components/admin/CatalogueBoard'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { formatWeddingDate } from '@/lib/format'
import { catalogueUrl } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** AE-2 — every wedding this operator manages, with status and subscription state. */
export default async function CatalogueListPage() {
  const session = await getOperatorSession()
  if (!session) {
    /**
     * A platform admin has no `operators` row — that is the isolation, not an oversight — so
     * they fail the check above and would have been bounced to a login they had already passed,
     * forever. Send them to the surface that is actually theirs.
     */
    if (await getPlatformAdmin()) redirect('/admin/platform')
    redirect('/admin/login')
  }

  /**
   * A suspended studio keeps its session — bouncing it to login would loop, since the credentials
   * are still valid — so this is where it learns why nothing works. Every API route it could call
   * is already refused by `requireOperator`; without this screen that refusal is an unexplained
   * error toast on a console that looks fine.
   */
  if (session.orgStatus === 'suspended') {
    return (
      <div className="mx-auto flex min-h-svh w-full max-w-[560px] flex-col justify-center p-6">
        <h1 className="mb-2 text-[24px] font-bold tracking-[-0.01em]">This account is suspended</h1>
        <p className="mb-4 text-[15px] text-[var(--color-l-text-mid)]">
          You cannot sign in to manage weddings until it is restored. The weddings you have
          already delivered are unaffected — couples can still open them and everything still
          plays.
        </p>
        <p className="text-[14px] text-[var(--color-l-text-mid)]">
          Email <a className="underline underline-offset-4" href={`mailto:${env.SUPPORT_EMAIL}`}>{env.SUPPORT_EMAIL}</a> to sort it out.
        </p>
      </div>
    )
  }

  const repository = getRepository()

  // Counts come from one method rather than `listTitles` per row: a partner with thirty weddings
  // would otherwise make sixty round trips to draw this screen, and it would get slower with
  // every wedding they sold.
  const [catalogues, counts, org] = await Promise.all([
    repository.listCatalogues({ orgId: session.orgId }),
    repository.catalogueCounts({ orgId: session.orgId }),
    getSessionOrg(session),
  ])

  const rows: CatalogueRow[] = catalogues.map((catalogue) => ({
    id: catalogue.id,
    name: catalogue.coupleName.en,
    slug: catalogue.slug,
    url: catalogueUrl(catalogue.slug, env.ROOT_DOMAIN, '/', env.TENANCY_MODE),
    status: catalogue.status,
    subStatus: catalogue.subStatus,
    weddingDate: catalogue.weddingDate,
    // Formatted on the server: the date format is locale data, and doing it in the browser is
    // how a server-rendered list starts flickering on hydration.
    weddingDateLabel: formatWeddingDate(catalogue.weddingDate, 'en'),
    counts: counts[catalogue.id] ?? { titles: 0, ready: 0, published: 0, failed: 0, photos: 0 },
  }))

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org?.name}
    >
      {/*
        No "New catalogue" button here. The top bar carries exactly one, on every page — this
        page having its own meant the console's most prominent action appeared twice on the one
        screen and nowhere on the screens where an operator actually finishes a job.
      */}
      <div className="mb-6">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Catalogues</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          {catalogues.length === 0
            ? 'Nothing here yet.'
            : `${catalogues.length} wedding${catalogues.length === 1 ? '' : 's'}${org?.name ? ` at ${org.name}` : ''}.`}
        </p>
      </div>

      <CatalogueBoard rows={rows} />
    </AdminChrome>
  )
}
