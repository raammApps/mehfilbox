import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CouponSwitch, CreateCouponForm } from '@/components/admin/CouponConsole'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { describeCoupon } from '@/lib/coupons'
import { getRepository } from '@/lib/db'
import { formatRupees } from '@/lib/format'
import { CREDIT_PLAN_IDS, planLabel } from '@/lib/plans'

export const dynamic = 'force-dynamic'

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
const day = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : null

/**
 * Coupon codes (N-121, D-61).
 *
 * A marketing cohort or a reward is a code rather than a price change. Made here, switched off here
 * and never deleted — a code somebody redeemed is history, and its **campaign** label is how a cohort is
 * read back: "what did the spring campaign cost, and who used it". Every change is on the audit trail.
 */
export default async function PlatformCouponsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string }>
}) {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()
  const { campaign: filter } = await searchParams

  const repository = getRepository()
  const [coupons, redemptions, orgs, plans] = await Promise.all([
    repository.listCoupons(),
    repository.listCouponRedemptions(),
    repository.listOrgs(),
    repository.listPlans(),
  ])

  const orgName = new Map(orgs.map((org) => [org.id, org.name]))
  const byId = new Map(coupons.map((coupon) => [coupon.id, coupon]))
  const planList = Object.fromEntries(plans.map((plan) => [plan.id, plan]))
  const planNames = Object.fromEntries(CREDIT_PLAN_IDS.map((id) => [id, planLabel(planList, id)])) as Record<
    (typeof CREDIT_PLAN_IDS)[number],
    string
  >
  // What a discount can be limited to: anything that can be bought (has a price), in console order.
  const products = plans.filter((plan) => plan.pricePaise !== null).map((plan) => ({ id: plan.id, name: plan.name }))

  const used = new Map<string, number>()
  for (const redemption of redemptions) used.set(redemption.couponId, (used.get(redemption.couponId) ?? 0) + 1)

  // The cohort view: one row per campaign, in the order it was last worked on.
  const campaigns = [...new Set(coupons.map((coupon) => coupon.campaign))].map((name) => {
    const own = coupons.filter((coupon) => coupon.campaign === name)
    const ids = new Set(own.map((coupon) => coupon.id))
    const rows = redemptions.filter((redemption) => ids.has(redemption.couponId))
    return {
      name,
      coupons: own.length,
      redemptions: rows.length,
      studios: new Set(rows.map((row) => row.payerOrgId)).size,
      amountOffPaise: rows.reduce((sum, row) => sum + row.amountOffPaise, 0),
      credits: rows.reduce((sum, row) => sum + row.creditsGranted, 0),
    }
  })

  const shown = filter
    ? redemptions.filter((redemption) => byId.get(redemption.couponId)?.campaign === filter)
    : redemptions

  const th = 'px-3 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-[var(--color-l-text-mid)]'
  const td = 'px-3 py-2.5 align-top'

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1200px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Coupons</h1>
        <p className="mt-0.5 max-w-[70ch] text-[14px] text-[var(--color-l-text-mid)]">
          Codes for cohorts and rewards, instead of a price change. A discount lowers one checkout by a
          figure the server works out; a reward hands a studio credits directly and needs no payment.
          Every code answers &ldquo;that did not work&rdquo; in the same words whatever is wrong with it, so nobody
          can tell which ones exist.
        </p>
      </header>
      <PlatformNav />

      <CreateCouponForm products={products} planNames={planNames} />

      <section className="mb-8">
        <h2 className="text-[17px] font-semibold">Campaigns</h2>
        <p className="mb-3 text-[13px] text-[var(--color-l-text-mid)]">
          Each campaign&rsquo;s coupons and what came of them. Choose one to read its redemptions.
        </p>
        {campaigns.length === 0 ? (
          <p className="text-[13px] text-[var(--color-l-text-mid)]">No coupons yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
            <table className="w-full border-collapse bg-white text-[13px]" data-testid="campaigns">
              <thead>
                <tr className="border-b border-[var(--color-l-line)]">
                  <th className={th}>Campaign</th>
                  <th className={th}>Coupons</th>
                  <th className={th}>Redemptions</th>
                  <th className={th}>Payers</th>
                  <th className={th}>Taken off</th>
                  <th className={th}>Credits granted</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.name} className="border-b border-[var(--color-l-line)] last:border-0">
                    <td className={td}>
                      <Link
                        href={`/admin/platform/coupons?campaign=${encodeURIComponent(campaign.name)}`}
                        className="font-semibold underline underline-offset-4"
                      >
                        {campaign.name}
                      </Link>
                    </td>
                    <td className={`${td} tabular-nums`}>{campaign.coupons}</td>
                    <td className={`${td} tabular-nums`}>{campaign.redemptions}</td>
                    <td className={`${td} tabular-nums`}>{campaign.studios}</td>
                    <td className={`${td} tabular-nums`}>{campaign.amountOffPaise > 0 ? formatRupees(campaign.amountOffPaise) : '—'}</td>
                    <td className={`${td} tabular-nums`}>{campaign.credits > 0 ? campaign.credits : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mb-8">
        <h2 className="text-[17px] font-semibold">Codes</h2>
        {coupons.length === 0 ? (
          <p className="mt-2 text-[13px] text-[var(--color-l-text-mid)]">Nothing here yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
            <table className="w-full border-collapse bg-white text-[13px]" data-testid="coupons">
              <thead>
                <tr className="border-b border-[var(--color-l-line)]">
                  <th className={th}>Code</th>
                  <th className={th}>What it does</th>
                  <th className={th}>Campaign</th>
                  <th className={th}>Window</th>
                  <th className={th}>Used</th>
                  <th className={th}>For</th>
                  <th className={th}>Status</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => {
                  const count = used.get(coupon.id) ?? 0
                  return (
                    <tr key={coupon.id} className="border-b border-[var(--color-l-line)] last:border-0">
                      <td className={`${td} font-mono font-semibold`}>{coupon.code}</td>
                      <td className={td}>{describeCoupon(coupon, planList)}</td>
                      <td className={td}>{coupon.campaign}</td>
                      <td className={`${td} text-[var(--color-l-text-mid)]`}>
                        {day(coupon.validFrom) ?? 'any time'} → {day(coupon.validUntil) ?? 'no end'}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {count}
                        {coupon.maxRedemptions !== null ? ` of ${coupon.maxRedemptions}` : ''}
                        <span className="block text-[12px] text-[var(--color-l-text-mid)]">
                          {coupon.maxPerPayer === null ? 'no limit each' : `${coupon.maxPerPayer} each`}
                        </span>
                      </td>
                      <td className={`${td} text-[var(--color-l-text-mid)]`}>
                        {coupon.doors.map((door) => (door === 'studio' ? 'Studios' : 'Couples')).join(' + ')}
                        {coupon.planIds.length > 0
                          ? ` · ${coupon.planIds.map((id) => planLabel(planList, id)).join(', ')}`
                          : ''}
                      </td>
                      <td className={`${td} font-semibold ${coupon.active ? 'text-[#1c5f2a]' : 'text-[var(--color-l-text-mid)]'}`}>
                        {coupon.active ? 'Active' : 'Disabled'}
                      </td>
                      <td className={`${td} text-right`}>
                        <CouponSwitch couponId={coupon.id} code={coupon.code} active={coupon.active} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[17px] font-semibold">
          Redemptions{filter ? <> — {filter}</> : null}
        </h2>
        {filter ? (
          <p className="mb-2 text-[13px]">
            <Link href="/admin/platform/coupons" className="underline underline-offset-4">
              Show every campaign
            </Link>
          </p>
        ) : null}
        {shown.length === 0 ? (
          <p className="mt-2 text-[13px] text-[var(--color-l-text-mid)]">No redemptions{filter ? ' in this campaign' : ''} yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--color-l-line)]">
            <table className="w-full border-collapse bg-white text-[13px]" data-testid="redemptions">
              <thead>
                <tr className="border-b border-[var(--color-l-line)]">
                  <th className={th}>When</th>
                  <th className={th}>Who</th>
                  <th className={th}>Code</th>
                  <th className={th}>Campaign</th>
                  <th className={th}>Worth</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((redemption) => {
                  const coupon = byId.get(redemption.couponId)
                  return (
                    <tr key={redemption.id} className="border-b border-[var(--color-l-line)] last:border-0">
                      <td className={`${td} tabular-nums`}>{when(redemption.createdAt)}</td>
                      <td className={td}>{orgName.get(redemption.payerOrgId) ?? 'A studio that has since gone'}</td>
                      <td className={`${td} font-mono`}>{coupon?.code ?? '—'}</td>
                      <td className={td}>{coupon?.campaign ?? '—'}</td>
                      <td className={`${td} tabular-nums`}>
                        {redemption.creditsGranted > 0
                          ? `${redemption.creditsGranted} credit${redemption.creditsGranted === 1 ? '' : 's'}`
                          : formatRupees(redemption.amountOffPaise)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
