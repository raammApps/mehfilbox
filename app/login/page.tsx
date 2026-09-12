import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { LoginForm, type Door } from '@/components/auth/LoginForm'
import { getOperatorSession } from '@/lib/admin/session'
import { challengeConfig } from '@/lib/captcha/verify'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Sign in — Mehfilbox', robots: { index: false } }

/**
 * The one sign-in page, with two doors (D-33). `/admin/login` redirects here.
 *
 * `email` is prefilled after a handover or a credential link (N-32 §2), so the button that said
 * "Sign in with priya@…" lands on a form addressed to Priya. Only ever a convenience: it fills a
 * field the visitor can edit, and grants nothing on its own.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ door?: string; email?: string }>
}) {
  if (await getOperatorSession()) redirect('/admin')

  const { door, email } = await searchParams
  const chosen: Door = door === 'couple' ? 'couple' : 'studio'
  return (
    <LoginForm
      door={chosen}
      initialEmail={typeof email === 'string' ? email : ''}
      challenge={challengeConfig()}
    />
  )
}
