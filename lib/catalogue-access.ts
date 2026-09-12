import 'server-only'
import { cookies } from 'next/headers'
import { passcodeCookieName, verifyPasscodeGrant } from './auth'
import { getCachedBundle, getCachedCatalogueBySlug } from './catalogue-cache'
import { ApiError } from './http/errors'
import { SERVING_SUB_STATUSES, type Catalogue, type CatalogueBundle } from './schema'

/**
 * The one place a guest request is authorised (doc 05 §4, doc 02 §5).
 *
 * Every guest route and the playback-token endpoint go through this, so "draft is not a 404",
 * "lapsed is a renewal screen, never a 404" and "passcode before content" cannot be
 * accidentally implemented three different ways.
 */

export type AccessVerdict =
  | { kind: 'ok'; catalogue: Catalogue }
  | { kind: 'missing' }
  | { kind: 'draft'; catalogue: Catalogue }
  | { kind: 'locked'; catalogue: Catalogue }
  | { kind: 'lapsed'; catalogue: Catalogue }
  /** Published, but before its premiere (N-72): a countdown, not the films. */
  | { kind: 'premiere'; catalogue: Catalogue }

/** Today as `YYYY-MM-DD`, so an expiry compares like the date column it came from. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function resolveAccess(slug: string): Promise<AccessVerdict> {
  // Cached read, uncached decision. Which rows exist is content; whether this guest may see
  // them is decided below, per request, from their cookies.
  const catalogue = await getCachedCatalogueBySlug(slug)
  if (!catalogue) return { kind: 'missing' }

  // A lapsed subscription is checked before publication state: the couple must always land on
  // the renewal screen rather than on anything that reads as "your wedding is gone".
  if (!SERVING_SUB_STATUSES.includes(catalogue.subStatus)) {
    return { kind: 'lapsed', catalogue }
  }

  // The date is authoritative too, not decorative. Status alone meant an operator could set an
  // expiry, watch it pass, and find the catalogue still serving — a setting that lies is worse
  // than no setting. Compared as dates, so a catalogue serves through the whole of its last day
  // in every timezone a guest might be in.
  if (catalogue.includedUntil && catalogue.includedUntil < today()) {
    return { kind: 'lapsed', catalogue }
  }

  if (catalogue.status !== 'published') return { kind: 'draft', catalogue }
  // Before the passcode: anyone with the link may see the countdown, and the code is for the films.
  if (catalogue.premiereAt && Date.parse(catalogue.premiereAt) > Date.now()) {
    return { kind: 'premiere', catalogue }
  }

  if (catalogue.privacy === 'passcode') {
    const grant = (await cookies()).get(passcodeCookieName(catalogue.slug))?.value
    if (!verifyPasscodeGrant(grant, catalogue.id, catalogue.passcodeVersion)) {
      return { kind: 'locked', catalogue }
    }
  }

  return { kind: 'ok', catalogue }
}

/** Everything the guest page renders, fetched once per request. */
export async function loadBundle(catalogue: Catalogue): Promise<CatalogueBundle> {
  return getCachedBundle(catalogue)
}

/** API variant: the same rules, expressed as the error codes in doc 07. */
export async function requireServableCatalogue(slug: string): Promise<Catalogue> {
  const verdict = await resolveAccess(slug)
  switch (verdict.kind) {
    case 'ok':
      return verdict.catalogue
    case 'missing':
    case 'draft':
      throw new ApiError('CATALOGUE_NOT_FOUND', 'No such catalogue')
    case 'locked':
      throw new ApiError('PASSCODE_REQUIRED', 'This catalogue needs a passcode')
    case 'lapsed':
      throw new ApiError('SUBSCRIPTION_INACTIVE', 'This catalogue needs renewing')
    case 'premiere':
      // Not yet, and not a secret: the API says so the way the page does, without a code.
      throw new ApiError('CATALOGUE_NOT_FOUND', 'This catalogue has not premiered yet')
  }
}
