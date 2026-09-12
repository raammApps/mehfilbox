import type { Translator } from '@/lib/i18n'

type Props = {
  presentedBy: string | null
  t: Translator
  downloadHref?: string | null
  /** "Made with Mehfilbox" (D-41). On unless the studio turned it off; never shown without a link. */
  platformCredit?: boolean
  platformHref?: string | null
}

/**
 * Presented by <planner> · download · privacy · made with (doc 02 §2). No interactivity.
 *
 * The platform line is the one place the product names itself in front of a guest, and it is
 * there because a studio left it on — doc 11 §4's "off by default" was reversed on 12 September
 * (D-41): the share is what brings the next studio in, and the studio that would rather not is
 * one click away from not.
 */
export function SiteFooter({
  presentedBy,
  t,
  downloadHref = null,
  platformCredit = true,
  platformHref = null,
}: Props) {
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
          {platformCredit && platformHref ? (
            <a
              href={platformHref}
              data-testid="platform-credit"
              className="underline-offset-4 hover:underline"
            >
              {t('footer.madeWith', { name: 'Mehfilbox' })}
            </a>
          ) : null}
        </p>
      </div>
    </footer>
  )
}
