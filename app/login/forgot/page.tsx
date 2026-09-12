import type { Metadata } from 'next'
import { ForgotForm } from '@/components/auth/ForgotForm'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Forgot password — Mehfilbox', robots: { index: false } }

export default async function ForgotPage({
  searchParams,
}: {
  searchParams: Promise<{ door?: string }>
}) {
  const { door } = await searchParams
  return <ForgotForm door={door === 'couple' ? 'couple' : 'studio'} />
}
