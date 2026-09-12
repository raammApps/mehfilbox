import { notFound, redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { TitleList } from '@/components/admin/TitleList'
import { getEditableCatalogue, getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function TitlesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // Owner, or the originating studio inside the couple's support window (doc 16 §3).
  const editable = await getEditableCatalogue(id)
  if (!editable) {
    if (!(await getOperatorSession())) redirect('/admin/login')
    notFound()
  }
  const { session, catalogue } = editable
  const repository = getRepository()

  const org = await getSessionOrg(session)

  const titles = await repository.listTitles(catalogue.id)

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
        <h2 className="text-[19px] font-bold tracking-[-0.01em]">Films</h2>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          Upload them, name them, and choose which ones a guest is shown.
        </p>
      </div>

      <TitleList catalogueId={catalogue.id} titles={titles} />
    </AdminChrome>
  )
}
