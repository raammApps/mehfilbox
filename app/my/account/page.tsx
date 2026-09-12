import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CoupleChrome } from '@/components/my/CoupleChrome'
import { CloseAccountPanel } from '@/components/my/panels'
import { getCoupleSession } from '@/lib/my/session'

export const dynamic = 'force-dynamic'

/** Sign-in and closure (D-37). Billing is the studio's (D-26), so there is nothing to itemise here yet. */
export default async function MyAccountPage() {
  const couple = await getCoupleSession()
  if (!couple) redirect('/login?door=couple')

  return (
    <CoupleChrome name={couple.session.operator.name} email={couple.session.operator.email} orgName={couple.org.name}>
      <h1 className="mb-6 text-[24px] font-bold tracking-[-0.01em]">Account</h1>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
          <h2 className="text-[15px] font-semibold">Sign-in</h2>
          <p className="mb-3 mt-0.5 text-[13px] text-[var(--color-l-text-mid)]">
            You sign in as <strong className="font-semibold">{couple.session.operator.email}</strong>.
            Your studio set this up; the password is yours.
          </p>
          <Link
            href="/login/change-password"
            className="inline-flex h-10 items-center rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-4 text-[14px] font-semibold"
          >
            Change password
          </Link>
        </section>

        <CloseAccountPanel />
      </div>
    </CoupleChrome>
  )
}
