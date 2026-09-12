import { notFound, redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { CustomizerShell } from '@/components/admin/CustomizerShell'
import { getOperatorSession } from '@/lib/admin/session'
import { seedModules } from '@/lib/admin/templates'
import { getRepository } from '@/lib/db'
import { effectiveModules } from '@/lib/db/repository'
import { publicUrlOf } from '@/lib/address'

export const dynamic = 'force-dynamic'

export default async function CustomizerPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')

  const { id } = await params
  const repository = getRepository()
  const catalogue = await repository.getCatalogue(id, session.orgId)
  if (!catalogue) notFound()

  const [titles, albums, photos] = await Promise.all([
    repository.listTitles(catalogue.id),
    repository.listAlbums(catalogue.id),
    repository.listPhotosForCatalogue(catalogue.id),
  ])

  // A catalogue that has never been through the customizer starts from its template rather
  // than from an empty list — an operator composing a page from nothing takes an hour.
  const existing = effectiveModules(catalogue, true)
  // Films and photographs wait for Publish too (N-57), and a film sitting invisible with no
  // explanation is the failure mode that decision has to avoid.
  const pending = await repository.countPendingContent(catalogue.id)
  const modules = existing.length > 0 ? existing : seedModules(catalogue.template, catalogue, titles, albums)

  return (
    <AdminChrome
      operatorName={session.operator.name}
      catalogue={{
        id: catalogue.id,
        name: catalogue.coupleName.en,
        slug: catalogue.slug,
        status: catalogue.status,
      }}
    >
      <CustomizerShell
        catalogue={catalogue}
        titles={titles}
        albums={albums}
        photos={photos}
        initialModules={modules}
        publicUrl={publicUrlOf(catalogue)}
        pendingContent={pending}
      />
    </AdminChrome>
  )
}
