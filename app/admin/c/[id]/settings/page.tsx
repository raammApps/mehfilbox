import { notFound, redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { CatalogueSettings } from '@/components/admin/CatalogueSettings'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')

  const { id } = await params
  const catalogue = await getRepository().getCatalogue(id, session.orgId)
  if (!catalogue) notFound()

  const org = await getSessionOrg(session)

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org?.name}
      orgKind={org?.kind}
      catalogue={{
        id: catalogue.id,
        name: catalogue.coupleName.en,
        slug: catalogue.slug,
        status: catalogue.status,
      }}
    >
      <div className="mb-5">
        <h2 className="text-[19px] font-bold tracking-[-0.01em]">Settings</h2>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          Who can watch, the address, how long it is served, and how to remove it.
        </p>
      </div>

      <CatalogueSettings catalogue={catalogue} />
    </AdminChrome>
  )
}
