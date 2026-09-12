import { notFound, redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { CustomizerShell } from '@/components/admin/CustomizerShell'
import { getEditableCatalogue, getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { seedModules } from '@/lib/admin/templates'
import { getRepository } from '@/lib/db'
import { effectiveModules } from '@/lib/db/repository'
import { publicUrlOf } from '@/lib/address'
import { allThemes } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

export default async function CustomizerPage({ params }: { params: Promise<{ id: string }> }) {
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

  const [titles, albums, photos, themes] = await Promise.all([
    repository.listTitles(catalogue.id),
    repository.listAlbums(catalogue.id),
    repository.listPhotosForCatalogue(catalogue.id),
    // All of them, not only the enabled: a wedding on a withdrawn theme previews as it publishes.
    allThemes(),
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
      <CustomizerShell
        catalogue={catalogue}
        titles={titles}
        albums={albums}
        photos={photos}
        initialModules={modules}
        publicUrl={publicUrlOf(catalogue)}
        pendingContent={pending}
        themes={themes}
        audience={org?.kind === 'couple' ? 'couple' : 'studio'}
      />
    </AdminChrome>
  )
}
