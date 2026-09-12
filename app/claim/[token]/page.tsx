import { createHash } from 'node:crypto'
import type { Metadata } from 'next'
import { ClaimForm } from '@/components/admin/ClaimForm'
import { getRepository } from '@/lib/db'
import { resolveLocalised } from '@/lib/i18n'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { title: 'Your wedding', robots: { index: false } }

/**
 * Where a couple lands from the link their planner sent them.
 *
 * Renders what they are being given before asking for anything, because a stranger asking for a
 * password with no context is indistinguishable from a phishing page — and this arrives over
 * WhatsApp, forwarded, with no sender they can check.
 */
export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const hash = createHash('sha256').update(token).digest('hex')

  const repository = getRepository()
  const transfer = await repository.getTransferByTokenHash(hash)
  const live =
    transfer && !transfer.claimedAt && new Date(transfer.expiresAt).getTime() > Date.now()

  const catalogue = live ? await repository.getCatalogueById(transfer.catalogueId) : null
  const partner = live ? await repository.getOrg(transfer.fromOrgId) : null
  // An address that already has an account accepts by signing in (D-37), and the form says so.
  const existing = live ? await repository.getOperatorByEmail(transfer.toEmail) : null

  if (!live || !catalogue) {
    return (
      <div className="mx-auto max-w-[420px] py-16">
        <h1 className="text-[24px] font-bold">This link is no longer valid</h1>
        <p className="mt-2 text-[15px] text-[var(--color-l-text-mid)]">
          It may have been used already, or it may have expired. Ask whoever sent it for a new
          one — nothing has been lost.
        </p>
      </div>
    )
  }

  return (
    <ClaimForm
      token={token}
      coupleName={resolveLocalised(catalogue.coupleName, 'en')}
      partnerName={partner?.name ?? 'Your planner'}
      email={transfer.toEmail}
      existing={existing !== null}
    />
  )
}
