import { notFound, redirect } from 'next/navigation'
import { PasscodeGate } from '@/components/streaming/PasscodeGate'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { resolveAccess } from '@/lib/catalogue-access'
import {createTranslator, resolveLocalised} from '@/lib/i18n'
import { guestLocale } from '@/lib/guest-locale'
import { resolveTheme } from '@/themes/resolve'
import { addressFor, requireCanonicalAddress } from '@/lib/address'
import { challengeConfig } from '@/lib/captcha/verify'

export const dynamic = 'force-dynamic'

export default async function LockedPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const verdict = await resolveAccess(slug)

  if (verdict.kind === 'missing') notFound()

  const { basePath } = await addressFor(verdict.catalogue)

  // Already satisfied, or never needed: do not strand a guest on a gate they have passed — and
  // in path mode '/' is the marketing page, not this catalogue.
  if (verdict.kind === 'ok') redirect(basePath || '/')
  if (verdict.kind === 'premiere') redirect(`${basePath}/premiere`)
  await requireCanonicalAddress(verdict.catalogue, '/locked')

  const locale = await guestLocale(verdict.catalogue)
  const t = createTranslator(locale)

  return (
    <>
      <ThemeStyle branding={verdict.catalogue.branding} theme={await resolveTheme(verdict.catalogue.branding)} />
      <PasscodeGate
        catalogueSlug={slug}
        basePath={basePath}
        challenge={challengeConfig()}
        coupleName={resolveLocalised(verdict.catalogue.coupleName, locale)}
        strings={{
          heading: t('locked.heading'),
          body: t('locked.body'),
          passcode: t('locked.passcode'),
          submit: t('locked.submit'),
          wrong: t('locked.wrong'),
          lockedOut: t('locked.lockedOut'),
        }}
      />
    </>
  )
}
