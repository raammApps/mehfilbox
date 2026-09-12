import { notFound, redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { PhotoManager } from '@/components/admin/PhotoManager'
import { getEditableCatalogue, getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function PhotosPage({ params }: { params: Promise<{ id: string }> }) {
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

  const photos = await repository.listPhotosForCatalogue(catalogue.id)

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
        <h2 className="text-[19px] font-bold tracking-[-0.01em]">Photographs</h2>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          Resized in the browser before upload, so a 40MB frame from a DSLR does not have to travel.
        </p>
      </div>

      <PhotoManager catalogueId={catalogue.id} initialPhotos={photos} />
    </AdminChrome>
  )
}
