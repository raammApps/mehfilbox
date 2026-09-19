import { redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { StudioBranding } from '@/components/admin/StudioBranding'
import Link from 'next/link'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { DomainPanel } from '@/components/admin/DomainPanel'
import { getRepository } from '@/lib/db'
import { instructionsOf } from '@/lib/domains'
import { RedeemCode } from '@/components/admin/RedeemCode'
import { availableByPlan, CREDIT_PLAN_IDS, describeGrants, planLabel } from '@/lib/plans'
import { getPriceListForDisplay, priceLabel } from '@/lib/pricing'
import { allThemes } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

/**
 * The studio's own look, set once (N-26).
 *
 * `PRODUCT.md` §6 calls saved presets the honest first version of a theme marketplace. This is the
 * honest first version of *that*: one studio-wide default that every new wedding is created from.
 * Named multi-presets are worth building when a studio asks for a second look, and not before.
 */
export default async function StudioPage() {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')

  const org = await getSessionOrg(session)
  if (!org) redirect('/admin')
  const [styles, balance, domains, prices] = await Promise.all([
    getRepository().listPresets(org.id),
    getRepository().creditBalance(org.id, new Date().toISOString()),
    getRepository().listDomains(org.id),
    getPriceListForDisplay(),
  ])
  // From the price list, never typed here (N-118): what a credit costs is the platform's to change.
  // One price per plan, because a credit is of a plan and the plans do not cost the same (N-119).
  const creditPrices = CREDIT_PLAN_IDS.flatMap((id) => {
    const price = priceLabel(prices, id)
    return price ? [`${planLabel(prices, id)} ${price}`] : []
  })
  const packPrice = priceLabel(prices, 'deliver-5')
  const studioDomain = domains.find((domain) => domain.catalogueId === null) ?? null

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org.name}
      orgKind={org.kind}
    >
      <div className="mx-auto w-full max-w-[560px] p-6">
        <h1 className="mb-1 text-[24px] font-bold tracking-[-0.01em]">Your studio&rsquo;s look</h1>
        <p className="mb-6 text-[14px] text-[var(--color-l-text-mid)]">
          Every new wedding starts from this. Changing it does not repaint weddings you have
          already delivered — those keep the look the couple was given.
        </p>

        <StudioBranding branding={org.branding} themes={await allThemes()} />

        {/* What publishing costs, in the one place a studio looks at its own account (D-38). */}
        <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
          <h2 className="text-[15px] font-semibold">Credits</h2>
          <p className="mt-1 text-[13px] text-[var(--color-l-text-mid)]">
            <span className="font-semibold text-[var(--color-l-text-hi)]">
              {describeGrants(availableByPlan(balance), prices) ?? '0 credits'} available
            </span>
            {' · '}
            {balance.consumed} spent{balance.expired > 0 ? ` · ${balance.expired} expired` : ''}. A
            wedding&rsquo;s first publish spends one credit of the plan it is on; publishing it again
            after a change is free.
            Your first was on us; after that a credit is{' '}
            {creditPrices.length > 0 ? creditPrices.join(', ') : 'priced on request'}
            {packPrice ? `, and five Deliver credits are ${packPrice}` : ''}.
          </p>
          {/* A reward code (N-121). Studios only: a couple holds no basket, and the server refuses them the same way. */}
          {org.kind === 'partner' ? (
            <RedeemCode
              planNames={
                Object.fromEntries(CREDIT_PLAN_IDS.map((id) => [id, planLabel(prices, id)])) as Record<
                  (typeof CREDIT_PLAN_IDS)[number],
                  string
                >
              }
            />
          ) : null}
        </section>

        {/* films.yourstudio.in/<wedding> — every wedding this studio makes, from its own domain (doc 16 §1). */}
        <div className="mt-6">
          <DomainPanel
            scope="studio"
            catalogueId={null}
            initial={studioDomain ? { domain: studioDomain, instructions: instructionsOf(studioDomain) } : null}
          />
        </div>

        {/* Named looks, the plural of this page (D-36). One line here; the list is its own page. */}
        <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
          <h2 className="text-[15px] font-semibold">House styles</h2>
          <p className="mb-3 mt-1 text-[13px] text-[var(--color-l-text-mid)]">
            {styles.length === 0
              ? 'Save a theme, layout, branding, language and guest-code choice under a name, and the wizard offers it.'
              : `${styles.length} saved${styles.some((style) => style.isDefault) ? `, “${styles.find((style) => style.isDefault)!.name}” is the default` : ''}.`}
          </p>
          <Link href="/admin/studio/styles" className="text-[14px] font-semibold underline underline-offset-4">
            {styles.length === 0 ? 'Make the first one' : 'Manage house styles'}
          </Link>
        </section>
      </div>
    </AdminChrome>
  )
}
