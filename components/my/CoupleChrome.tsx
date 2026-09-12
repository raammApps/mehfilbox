import Link from 'next/link'
import { UserMenu } from '@/components/admin/UserMenu'

/**
 * The frame around a couple's account (D-37). Two links and the account menu: there is nothing
 * else to navigate, and a rail full of sections would be the operator console it is meant not
 * to be.
 */
export function CoupleChrome({
  name,
  email,
  orgName,
  children,
}: {
  name: string
  email: string
  orgName: string
  children: React.ReactNode
}) {
  return (
    <div className="mx-auto min-h-svh w-full max-w-[960px]">
      <div className="sticky top-0 z-20 flex items-center gap-5 border-b border-[var(--color-l-line)] bg-[var(--color-l-surface-1)] px-4 py-2.5 md:px-6">
        <Link href="/my" className="text-[17px] font-bold tracking-[-0.01em]">
          Mehfilbox
        </Link>
        <nav aria-label="Your account" className="flex items-center gap-4 text-[14px]">
          <Link href="/my" className="underline-offset-4 hover:underline">
            Your weddings
          </Link>
          <Link href="/my/account" className="underline-offset-4 hover:underline">
            Account
          </Link>
        </nav>
        <div className="ms-auto">
          <UserMenu name={name} email={email} orgName={orgName} />
        </div>
      </div>
      <main className="p-4 md:p-6">{children}</main>
    </div>
  )
}
