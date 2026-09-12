import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AdminChrome } from '@/components/admin/AdminChrome'
import { HouseStyleActions } from '@/components/admin/HouseStyleActions'
import { ThemeSwatch } from '@/components/admin/ThemeCards'
import { getOperatorSession, getSessionOrg } from '@/lib/admin/session'
import { getTemplate } from '@/lib/admin/templates'
import { getRepository } from '@/lib/db'
import { themeFrom } from '@/themes/registry'
import { allThemes } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

/**
 * A studio's house styles (D-36, doc 16 §5): what its new weddings start from, by name.
 *
 * Each card says what the style is in one line — theme, layout, language, code — and whether it
 * is frozen, which is the fact a studio needs before clicking Edit rather than after.
 */
export default async function HouseStylesPage() {
  const session = await getOperatorSession()
  if (!session) redirect('/admin/login')
  const org = await getSessionOrg(session)
  if (!org) redirect('/admin')

  const repository = getRepository()
  const [presets, themes] = await Promise.all([repository.listPresets(org.id), allThemes()])
  const frozenCounts = await Promise.all(
    presets.map((preset) => repository.countPublishedCataloguesOnPreset(preset.id)),
  )

  return (
    <AdminChrome
      operatorName={session.operator.name}
      operatorEmail={session.operator.email}
      orgName={org.name}
      orgKind={org.kind}
    >
      <div className="mx-auto w-full max-w-[900px] p-6">
        <Link
          href="/admin/studio"
          className="mb-3 inline-flex items-center gap-1 text-[13px] text-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]"
        >
          <span aria-hidden>←</span> Your studio
        </Link>
        <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[24px] font-bold tracking-[-0.01em]">House styles</h1>
            <p className="mt-0.5 max-w-[62ch] text-[14px] text-[var(--color-l-text-mid)]">
              A theme, a layout, your branding, a language and whether a guest code is on — saved
              once, offered on the wizard&rsquo;s second step. Editing one changes only weddings
              created afterwards.
            </p>
          </div>
          <Link
            href="/admin/studio/styles/new"
            className="inline-flex h-11 items-center rounded-[var(--radius-pill)] bg-accent px-5 text-[14px] font-semibold text-accent-ink"
          >
            New house style
          </Link>
        </header>

        {presets.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-l-line)] px-4 py-10 text-center text-[14px] text-[var(--color-l-text-mid)]">
            None yet. Make one here, or open a delivered wedding and choose <em>Keep this look</em>.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {presets.map((preset, index) => {
              const theme = themeFrom(preset.branding, themes)
              const frozen = frozenCounts[index] ?? 0
              return (
                <li
                  key={preset.id}
                  className="flex flex-wrap items-center gap-4 rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-3"
                >
                  <span className="w-[132px] shrink-0">
                    <ThemeSwatch theme={theme} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
                      <Link href={`/admin/studio/styles/${preset.id}`} className="underline-offset-4 hover:underline">
                        {preset.name}
                      </Link>
                      {preset.isDefault ? (
                        <span className="rounded-[var(--radius-pill)] bg-[var(--color-l-text-hi)] px-2 py-0.5 text-[11px] font-semibold text-white">
                          Default
                        </span>
                      ) : null}
                      {frozen > 0 ? (
                        <span className="text-[12px] font-normal text-[var(--color-l-text-mid)]">
                          · {frozen} published wedding{frozen === 1 ? '' : 's'} — look fixed
                        </span>
                      ) : null}
                    </p>
                    <p className="text-[13px] text-[var(--color-l-text-mid)]">
                      {theme.name} · {getTemplate(preset.templateId).label} ·{' '}
                      {preset.locale === 'hi' ? 'हिंदी' : 'English'} ·{' '}
                      {preset.passcodeOn ? 'guest code on' : 'no guest code'}
                      {preset.branding.presentedBy ? ` · presented by ${preset.branding.presentedBy}` : ''}
                    </p>
                    <div className="mt-2">
                      <HouseStyleActions
                        presetId={preset.id}
                        name={preset.name}
                        isDefault={preset.isDefault}
                        frozen={frozen > 0}
                      />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </AdminChrome>
  )
}
