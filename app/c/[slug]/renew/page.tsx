import { notFound } from 'next/navigation'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { basePathOf, requireCanonicalAddress } from '@/lib/address'
import { resolveAccess } from '@/lib/catalogue-access'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import {createTranslator, resolveLocalised} from '@/lib/i18n'
import { guestLocale } from '@/lib/guest-locale'
import { resolveTheme } from '@/themes/resolve'

export const dynamic = 'force-dynamic'

/**
 * The renewal screen (doc 01 §7).
 *
 * Never a 404 and never deletion. The catalogue is still listed, the films are still there, and
 * the page says so in as many words — getting this wrong is the kind of story that ends a
 * planner relationship and travels.
 */
export default async function RenewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const verdict = await resolveAccess(slug)
  if (verdict.kind === 'missing') notFound()
  await requireCanonicalAddress(verdict.catalogue, '/renew')

  const locale = await guestLocale(verdict.catalogue)
  const t = createTranslator(locale)
  const titles = await getRepository().listTitles(verdict.catalogue.id, { publishedOnly: true })

  return (
    <>
      <ThemeStyle branding={verdict.catalogue.branding} theme={await resolveTheme(verdict.catalogue.branding)} />
      <main className="gutter-x mx-auto flex min-h-svh max-w-[640px] flex-col justify-center py-16">
        <p className="type-label mb-4 text-accent-hi">
          {resolveLocalised(verdict.catalogue.coupleName, locale)}
        </p>
        <h1 className="type-display-lg mb-3">{t('renew.heading')}</h1>
        <p className="type-body-lg mb-8 text-text-mid">{t('renew.body')}</p>

        <ul className="edge mb-8 rounded-[var(--radius-card)] bg-surface-1 p-4">
          {titles.map((title) => (
            <li key={title.id} className="type-body border-b border-surface-3 py-2 last:border-0">
              {resolveLocalised(title.name, locale)}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center gap-4">
          <a
            href={`mailto:${env.SUPPORT_EMAIL}`}
            className="inline-flex h-12 w-fit items-center rounded-[var(--radius-pill)] bg-accent px-6 font-semibold text-accent-ink"
          >
            {t('renew.cta')}
          </a>
          {/*
            The most important link on this screen (N-22). A couple arrives here because their
            wedding stopped playing, and the grace email told them everything is still
            downloadable. If that is true anywhere, it has to be true here.
          */}
          <a
            href={`${basePathOf(verdict.catalogue)}/download`}
            className="inline-flex h-12 w-fit items-center rounded-[var(--radius-pill)] border border-surface-3 px-6 font-semibold text-text-hi"
          >
            {t('download.all')}
          </a>
        </div>
      </main>
    </>
  )
}
