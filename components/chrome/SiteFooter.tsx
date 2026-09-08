import type { Translator } from '@/lib/i18n'

type Props = { presentedBy: string | null; t: Translator; downloadHref?: string | null }

/** Presented by <planner> · privacy · renew (doc 02 §2). Server component; no interactivity. */
export function SiteFooter({ presentedBy, t, downloadHref = null }: Props) {
  return (
    <footer className="gutter-x mt-16 border-t border-surface-3 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {presentedBy ? (
          <p className="type-meta">{t('footer.presentedBy', { name: presentedBy })}</p>
        ) : (
          <span />
        )}
        <p className="type-meta flex flex-wrap gap-4">
          {/* Downloads are a promise, not a feature, so they are reachable from every page of a
              wedding rather than only from the renewal screen someone hopes never to see. */}
          {downloadHref ? (
            <a href={downloadHref} className="underline-offset-4 hover:underline">
              {t('download.all')}
            </a>
          ) : null}
          <a href="/privacy" className="underline-offset-4 hover:underline">
            {t('footer.privacy')}
          </a>
        </p>
      </div>
    </footer>
  )
}
