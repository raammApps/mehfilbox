import { notFound, redirect } from 'next/navigation'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { PremiereScreen } from '@/components/streaming/PremiereScreen'
import { addressFor, requireCanonicalAddress } from '@/lib/address'
import { resolveAccess } from '@/lib/catalogue-access'
import { createTranslator, resolveLocalised } from '@/lib/i18n'
import { guestLocale } from '@/lib/guest-locale'
import { formatInZone } from '@/lib/time'
import { resolveTheme } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

/**
 * The countdown (N-72): a published wedding before its premiere. Anyone with the link sees it —
 * the guest code, if there is one, is for the films, and they are not here yet.
 */
export default async function PremierePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const verdict = await resolveAccess(slug)
  if (verdict.kind === 'missing') notFound()

  const { basePath } = await addressFor(verdict.catalogue)
  // Already live, or not a premiere at all: the browse page decides where the guest belongs.
  if (verdict.kind !== 'premiere') redirect(basePath || '/')
  const address = await requireCanonicalAddress(verdict.catalogue, '/premiere')

  const { catalogue } = verdict
  const locale = await guestLocale(catalogue)
  const t = createTranslator(locale)
  const when = formatInZone(catalogue.premiereAt!, catalogue.timezone, locale)

  return (
    <>
      <ThemeStyle branding={catalogue.branding} theme={await resolveTheme(catalogue.branding)} />
      <PremiereScreen
        premiereAt={catalogue.premiereAt!}
        coupleName={resolveLocalised(catalogue.coupleName, locale)}
        basePath={address.basePath}
        strings={{
          eyebrow: t('premiere.eyebrow'),
          heading: t('premiere.heading', { when }),
          body: t('premiere.body'),
          days: t('premiere.days'),
          hours: t('premiere.hours'),
          minutes: t('premiere.minutes'),
          seconds: t('premiere.seconds'),
          now: t('premiere.now'),
          watch: t('premiere.watch'),
        }}
      />
    </>
  )
}
