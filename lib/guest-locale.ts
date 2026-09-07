import 'server-only'
import { cookies } from 'next/headers'
import { parseLocaleOrNull } from '@/lib/i18n'
import type { Catalogue, Locale } from '@/lib/schema'

/** The cookie `TopNav` writes when a guest uses the toggle. */
export const LOCALE_COOKIE = 'mehfilbox_locale'

/**
 * What language to render a wedding in (N-29).
 *
 * A guest's own choice wins, and until they make one the **catalogue's** default applies — which
 * is the studio's, chosen once at registration. Before this every catalogue opened in English and
 * the only route to Hindi was a toggle in the corner, so a Hindi-first studio in Jaipur set up
 * every wedding in English and hoped the family found the switch. That is the wrong way round for
 * this market.
 *
 * One function rather than the seven `parseLocale(cookie)` calls it replaces: the fallback is a
 * rule about the product, and seven copies of a rule is seven chances for one of them to be the
 * old rule.
 */
export async function guestLocale(catalogue: Pick<Catalogue, 'locale'>): Promise<Locale> {
  const chosen = parseLocaleOrNull((await cookies()).get(LOCALE_COOKIE)?.value)
  return chosen ?? catalogue.locale
}
