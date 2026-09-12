import { redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { StudioBranding } from '@/components/admin/StudioBranding'
import Link from 'next/link'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getRepository } from '@/lib/db'
import { allThemes } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

/**
 * The studio's own look, set once (N-26).
 *
 * `PRODUCT.md` §6 calls saved presets the honest first version of a theme marketplace. This is the
 * honest first version of *that*: one studio-wide default that every new wedding is created from.
 * Named multi-presets are worth building when a studio asks for a second look, and not before.
 */
export default async function StudioPage() {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')

  const org = await getSessionOrg(session)
  if (!org) redirect('/admin')
  const styles = await getRepository().listPresets(org.id)

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org.name}
      orgKind={org.kind}
    >
      <div className="mx-auto w-full max-w-[560px] p-6">
        <h1 className="mb-1 text-[24px] font-bold tracking-[-0.01em]">Your studio&rsquo;s look</h1>
        <p className="mb-6 text-[14px] text-[var(--color-l-text-mid)]">
          Every new wedding starts from this. Changing it does not repaint weddings you have
          already delivered — those keep the look the couple was given.
        </p>

        <StudioBranding branding={org.branding} themes={await allThemes()} />

        {/* Named looks, the plural of this page (D-36). One line here; the list is its own page. */}
        <section className="mt-6 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
          <h2 className="text-[15px] font-semibold">House styles</h2>
          <p className="mb-3 mt-1 text-[13px] text-[var(--color-l-text-mid)]">
            {styles.length === 0
              ? 'Save a theme, layout, branding, language and guest-code choice under a name, and the wizard offers it.'
              : `${styles.length} saved${styles.some((style) => style.isDefault) ? `, “${styles.find((style) => style.isDefault)!.name}” is the default` : ''}.`}
          </p>
          <Link href="/admin/studio/styles" className="text-[14px] font-semibold underline underline-offset-4">
            {styles.length === 0 ? 'Make the first one' : 'Manage house styles'}
          </Link>
        </section>
      </div>
    </AdminChrome>
  )
}
