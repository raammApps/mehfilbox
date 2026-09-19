import { redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { CreateWizard } from '@/components/admin/CreateWizard'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { CREDIT_PLAN_IDS, planLabel } from '@/lib/plans'
import { getPriceListForDisplay } from '@/lib/pricing'
import { DEFAULT_THEME_ID } from '@/themes/registry'
import { allThemes } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

export default async function NewCataloguePage() {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')

  const org = await getSessionOrg(session)
  const styles = org ? await getRepository().listPresets(org.id) : []

  // What each plan is called comes from the price list; how many credits of it the studio holds from
  // its balance (N-119). A couple has no basket — they buy a plan, not credits (D-61) — so they are
  // shown the plans without a count rather than a "0 credits" that would read as a problem.
  const prices = await getPriceListForDisplay()
  const balance =
    org && org.kind !== 'couple' ? await getRepository().creditBalance(org.id, new Date().toISOString()) : null
  const plans = CREDIT_PLAN_IDS.map((id) => ({
    id,
    name: planLabel(prices, id),
    available: balance ? balance.byPlan[id].available : null,
  }))

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org?.name}
      orgKind={org?.kind}
    >
      <div className="mb-6">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">
          {org?.kind === 'couple' ? 'A catalogue of your own' : 'New catalogue'}
        </h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          {org?.kind === 'couple'
            ? 'An anniversary, a birthday, a naming day. A draft costs nothing; publishing needs a credit, which your studio or we can add.'
            : 'About half an hour, most of it the upload running while you do something else.'}
        </p>
      </div>

      {/* `lib/env` is server-only, so the address preview gets its inputs as props. */}
      <CreateWizard
        rootDomain={env.ROOT_DOMAIN}
        tenancyMode={env.TENANCY_MODE}
        studioSlug={org?.slug ?? ''}
        studioLocale={org?.locale ?? 'en'}
        themes={await allThemes()}
        studioTheme={org?.branding.theme ?? DEFAULT_THEME_ID}
        styles={styles}
        plans={plans}
        mode={org?.kind === 'couple' ? 'couple' : 'studio'}
      />
    </AdminChrome>
  )
}
