import { notFound } from 'next/navigation'
import { ThemeStyle } from '@/components/chrome/ThemeStyle'
import { requireCanonicalAddress } from '@/lib/address'
import { buildManifest, resolveDownloadAccess } from '@/lib/downloads'
import { guestLocale } from '@/lib/guest-locale'
import { createTranslator, resolveLocalised } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

/**
 * Everything, as links (N-22).
 *
 * **Server-rendered, with no client JavaScript.** A couple reaching this page is often doing so
 * because something has gone wrong — a plan lapsed, a studio stopped answering — and that is the
 * worst moment for a page that needs to boot before it can help. Links in the markup work in
 * every browser, in a download manager, and with the network on its knees.
 *
 * It renders after expiry, through grace and from archive, because the promise is "nothing is
 * ever deleted" and this is the page where a couple finds out whether that was true.
 */
export default async function DownloadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const verdict = await resolveDownloadAccess(slug)

  // A locked catalogue 404s rather than explaining itself: the passcode gate lives on the
  // catalogue's own page, and this must not become a second place to probe for one.
  if (verdict.kind !== 'ok') notFound()

  const { catalogue } = verdict
  await requireCanonicalAddress(catalogue, '/download')
  const locale = await guestLocale(catalogue)
  const t = createTranslator(locale)
  const manifest = await buildManifest(catalogue)

  const films = manifest.items.filter((i) => i.kind === 'film')
  const photographs = manifest.items.filter((i) => i.kind === 'photograph')

  return (
    <>
      <ThemeStyle branding={catalogue.branding} />
      <main className="gutter-x mx-auto max-w-[720px] py-16">
        <p className="type-label mb-4 text-accent-hi">
          {resolveLocalised(catalogue.coupleName, locale)}
        </p>
        <h1 className="type-display-lg mb-3">{t('download.heading')}</h1>
        <p className="type-body-lg mb-10 max-w-[52ch] text-text-mid">{t('download.body')}</p>

        {manifest.items.length === 0 ? (
          <p className="text-text-mid">{t('download.empty')}</p>
        ) : null}

        {films.length > 0 ? (
          <section className="mb-10">
            <h2 className="type-title mb-3">{t('download.films')}</h2>
            <ul className="edge rounded-[var(--radius-card)] bg-surface-1">
              {films.map((item) => (
                <li
                  key={item.url}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-3 px-4 py-3 last:border-0"
                >
                  <span>
                    <span className="type-body">{item.name}</span>
                    <span className="type-meta ml-2 text-text-lo">
                      {item.quality}
                      {item.sizeBytes ? ` · ${(item.sizeBytes / 1024 ** 3).toFixed(1)} GB` : ''}
                    </span>
                  </span>
                  <a
                    href={item.url}
                    download
                    className="type-meta shrink-0 underline underline-offset-4"
                  >
                    {t('download.get')}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {photographs.length > 0 ? (
          <section className="mb-10">
            <h2 className="type-title mb-3">
              {t('download.photographs')}{' '}
              <span className="type-meta text-text-lo">({photographs.length})</span>
            </h2>
            <ul className="flex flex-wrap gap-2">
              {photographs.map((item, index) => (
                <li key={item.url}>
                  <a
                    href={item.url}
                    download
                    className="type-meta edge inline-flex rounded-[var(--radius-pill)] bg-surface-1 px-3 py-1.5 underline-offset-4 hover:underline"
                  >
                    {index + 1}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {manifest.unavailable > 0 ? (
          // Said plainly rather than hidden. A couple who counts nine films and sees eight links
          // needs to know the tenth is stored and reachable, not lost.
          <p className="type-meta text-text-lo">
            {t('download.unavailable', { count: manifest.unavailable })}
          </p>
        ) : null}
      </main>
    </>
  )
}
