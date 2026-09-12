import { redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { CreateWizard } from '@/components/admin/CreateWizard'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { DEFAULT_THEME_ID } from '@/themes/registry'
import { allThemes } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

export default async function NewCataloguePage() {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')

  const org = await getSessionOrg(session)
  const styles = org ? await getRepository().listPresets(org.id) : []

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org?.name}
      orgKind={org?.kind}
    >
      <div className="mb-6">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">New catalogue</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          About half an hour, most of it the upload running while you do something else.
        </p>
      </div>

      {/* `lib/env` is server-only, so the address preview gets its inputs as props. */}
      <CreateWizard
        rootDomain={env.ROOT_DOMAIN}
        tenancyMode={env.TENANCY_MODE}
        studioSlug={org?.slug ?? ''}
        studioLocale={org?.locale ?? 'en'}
        themes={await allThemes()}
        studioTheme={org?.branding.theme ?? DEFAULT_THEME_ID}
        styles={styles}
      />
    </AdminChrome>
  )
}
