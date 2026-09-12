import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ChangePasswordForm } from '@/components/auth/ChangePasswordForm'
import { getOperatorSession } from '@/lib/admin/session'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Change password — Mehfilbox', robots: { index: false } }

/**
 * Where a temporary password is replaced (D-33), and where anyone signed in changes theirs.
 * The session route sends a flagged account here as its landing; everyone else reaches it from
 * the account menu.
 */
export default async function ChangePasswordPage() {
  const session = await getOperatorSession()
  if (!session) redirect('/login')
  return <ChangePasswordForm forced={session.operator.mustChangePassword} />
}
