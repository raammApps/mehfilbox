import { notFound } from 'next/navigation'
import { PlatformNav } from '@/components/admin/PlatformNav'
import { ThemeStudio } from '@/components/admin/ThemeStudio'
import { getPlatformAdmin } from '@/lib/admin/platform'
import { getRepository } from '@/lib/db'
import { builtInThemes } from '@/themes/registry'

export const dynamic = 'force-dynamic'

/**
 * Themes, platform-wide (D-35, doc 16 §4).
 *
 * The seven built-in themes are code and are shown for reference and as starting points; what a
 * platform admin adds here reaches every studio's picker the moment it is saved, and a withdrawn
 * one leaves the pickers without leaving the weddings already on it.
 */
export default async function PlatformThemesPage() {
  const admin = await getPlatformAdmin()
  if (!admin) notFound()

  // Straight from the repository, not the cached list: an admin who just saved must see it.
  const custom = await getRepository().listCustomThemes()

  return (
    <div className="mx-auto min-h-svh w-full max-w-[1200px] p-6">
      <header className="mb-4">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">Themes</h1>
        <p className="mt-0.5 max-w-[70ch] text-[14px] text-[var(--color-l-text-mid)]">
          Seven are built in. The ones you add here appear in every studio&rsquo;s picker once
          they clear the same contrast gate the built-in ones are held to. Withdrawing a theme
          hides it from pickers and leaves every wedding already on it exactly as it is.
        </p>
      </header>
      <PlatformNav />

      <ThemeStudio builtIn={builtInThemes()} custom={custom} />
    </div>
  )
}
