import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/AuthShell'
import { SetPasswordForm } from '@/components/auth/SetPasswordForm'
import { redeemableLink } from '@/lib/auth/credential-links'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Set your password — Mehfilbox', robots: { index: false } }

/**
 * Where a credential link lands (D-33).
 *
 * The link is checked before the form is shown, so a spent or expired one explains itself
 * instead of failing after the person has chosen and typed a password twice. Missing, expired and
 * spent read identically — a link that says which tells whoever found it something about an
 * account they should not know.
 */
export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await redeemableLink(token)

  if (!link) {
    return (
      <AuthShell>
        <h1 className="type-display-lg mb-2">This link is no longer valid</h1>
        <p className="type-body mb-6 text-text-mid">
          It may have been used already, or it may have expired. Ask for a new one — nothing has
          been lost.
        </p>
        <Link href="/login/forgot" className="type-body underline underline-offset-4">
          Email me a new link
        </Link>
      </AuthShell>
    )
  }

  return <SetPasswordForm token={token} first={link.purpose === 'set-password'} />
}
