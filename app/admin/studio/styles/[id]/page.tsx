import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { HouseStyleEditor } from '@/components/admin/HouseStyleEditor'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { allThemes } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

/** One house style — `new`, or an existing one the studio owns (anyone else's is a 404). */
export default async function HouseStylePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')
  const org = await getSessionOrg(session)
  if (!org) redirect('/admin')

  const { id } = await params
  const repository = getRepository()
  const preset = id === 'new' ? null : await repository.getPreset(id, org.id)
  if (id !== 'new' && !preset) notFound()

  const [themes, frozenCount] = await Promise.all([
    allThemes(),
    preset ? repository.countPublishedCataloguesOnPreset(preset.id) : Promise.resolve(0),
  ])

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org.name}
      orgKind={org.kind}
    >
      <div className="mx-auto w-full max-w-[900px] p-6">
        <Link
          href="/admin/studio/styles"
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]"
        >
          <span aria-hidden>←</span> House styles
        </Link>
        <h1 className="mb-5 text-[24px] font-bold tracking-[-0.01em]">
          {preset ? preset.name : 'New house style'}
        </h1>
        <HouseStyleEditor
          preset={preset}
          themes={themes}
          frozenCount={frozenCount}
          studioBranding={org.branding}
          studioLocale={org.locale}
        />
      </div>
    </AdminChrome>
  )
}
