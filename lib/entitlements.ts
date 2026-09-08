import { z } from 'zod'

/**
 * What a catalogue is allowed to hold (doc 15 §3).
 *
 * `MAX_TITLES = 15` and `MAX_PHOTOS = 60` were constants. The moment a partner buys more space,
 * or a couple upgrades after the handover, a constant is the wrong shape — so the numbers move
 * behind a resolver and every caller asks rather than imports.
 *
 * **The defaults stay low on purpose.** Doc 05 §2 is explicit that the 15-title cap is a curation
 * requirement first and a cost ceiling second: if planners routinely push past it, the product
 * has drifted into being an archive. Storage is sellable; turning this into Google Drive with a
 * nicer player is not the goal.
 */

/**
 * **Storage is the only limit.**
 *
 * There were counts here — 15 films, 60 photographs — and they came from doc 05 §2's argument that
 * a cap is a curation requirement first and a cost ceiling second. That argument was written when
 * a wedding meant a highlights film and a ceremony edit. A real Indian wedding is every function
 * from both sides, 10–15 hours, and a count cap now refuses content the customer has paid to
 * store: an 80 GB plan with a film per function hits fifteen long before it hits its gigabytes.
 *
 * So the plans sell gigabytes and nothing else (`docs/PRICING.md`), and the customer decides
 * whether that is twenty short films or six long ones. It is also the honest cap, because it is
 * the one that maps to what a catalogue actually costs us.
 */
export const DEFAULT_LIMITS = {
  storageGb: 20,
} as const

export const limitsSchema = z.object({
  storageGb: z.number().int().positive(),
})

export type Limits = z.infer<typeof limitsSchema>

/** A row from `entitlements`, which may set any subset of the limits. */
export const entitlementSchema = z.object({
  id: z.string().uuid(),
  /** Exactly one of these is set; the check constraint in the migration is the enforcement. */
  orgId: z.string().uuid().nullable().default(null),
  catalogueId: z.string().uuid().nullable().default(null),
  planId: z.string().nullable().default(null),
  maxTitles: z.number().int().positive().nullable().default(null),
  maxPhotos: z.number().int().positive().nullable().default(null),
  storageGb: z.number().int().positive().nullable().default(null),
  /** An expired entitlement is inert rather than deleted, so the history survives a lapse. */
  validUntil: z.string().nullable().default(null),
  createdAt: z.string(),
})

export type Entitlement = z.infer<typeof entitlementSchema>

/**
 * Catalogue entitlement → org entitlement → default. The order is the substance.
 *
 * A couple who buys storage must not be silently capped by their partner's tier, because by then
 * the partner is out of the relationship entirely — they cannot see the catalogue and cannot be
 * asked to upgrade. So the catalogue's own grant wins, per field, over the org's.
 *
 * Per *field* rather than per row — which currently means one field, but the shape is kept because
 * the next grant we sell will not be storage.
 *
 * `maxTitles` and `maxPhotos` remain on the entitlement row and are deliberately **not resolved**.
 * The columns hold grants written before storage became the only limit; dropping them would throw
 * away history for no gain, and reading them would reinstate a cap we decided not to sell.
 */
export function resolveLimits(
  catalogueEntitlement: Entitlement | null,
  orgEntitlement: Entitlement | null,
  now: Date = new Date(),
): Limits {
  const live = (entitlement: Entitlement | null): Entitlement | null => {
    if (!entitlement) return null
    if (!entitlement.validUntil) return entitlement
    return new Date(entitlement.validUntil).getTime() > now.getTime() ? entitlement : null
  }

  const first = live(catalogueEntitlement)
  const second = live(orgEntitlement)

  const pick = (field: 'storageGb'): number =>
    first?.[field] ?? second?.[field] ?? DEFAULT_LIMITS[field]

  return { storageGb: pick('storageGb') }
}


/** Gigabytes, from bytes. One place, so the console and the guards never disagree by 1024. */
export function bytesToGb(bytes: number): number {
  return bytes / 1024 ** 3
}

/**
 * Whether one more upload fits.
 *
 * `null` sizes count as zero — a film still transcoding has not reported what it occupies, and
 * refusing an upload on the strength of a number we do not have yet would block a legitimate
 * second file while the first is still processing. It errs toward letting content in, which is
 * the right direction for a keepsake: the cost of a slightly over-quota catalogue is pennies, and
 * the cost of refusing a wedding film is a phone call.
 */
export function storageCheck(
  usedBytes: number,
  incomingBytes: number,
  limits: Limits,
): { fits: boolean; usedGb: number; limitGb: number } {
  const usedGb = bytesToGb(usedBytes)
  return {
    fits: bytesToGb(usedBytes + incomingBytes) <= limits.storageGb,
    usedGb,
    limitGb: limits.storageGb,
  }
}


/**
 * What an hour of finished film occupies, by ladder (`PRICING.md` §1).
 *
 * Bunny's standard encoding covers everything to 1080p at no cost, so the two tiers differ only in
 * the space they take — which is why the product sells gigabytes and never counts hours. These
 * exist to answer the question a partner actually asks at purchase, *"is 100 GB a lot?"*, and
 * nothing enforces them.
 *
 * **Estimates, not measurements.** N-24a is the item that uploads a real fifteen-hour wedding and
 * replaces these with what was observed. Until then the console says "about", because a number
 * presented precisely is believed precisely.
 */
export const GB_PER_HOUR = { standard: 2.15, fullHd: 4.29 } as const

/** Roughly how many finished hours a plan holds, at each ladder. */
export function hoursFor(storageGb: number): { standard: number; fullHd: number } {
  return {
    standard: Math.round(storageGb / GB_PER_HOUR.standard),
    fullHd: Math.round(storageGb / GB_PER_HOUR.fullHd),
  }
}

/** Where a catalogue sits against its plan. */
export type StorageUsage = {
  usedGb: number
  limitGb: number
  ratio: number
  /**
   * `warn` at 80%, which `PRICING.md` §6 asks for and which exists because the failure it prevents
   * is specific: a partner discovers the cap at 80% *uploaded*, which is the middle of a wedding
   * and hours into a slow connection. Being told at 80% *used* is early enough to buy more space
   * or drop the ladder to 720p before it matters.
   */
  level: 'ok' | 'warn' | 'full'
}

export function storageUsage(usedBytes: number, limits: Limits): StorageUsage {
  const usedGb = bytesToGb(usedBytes)
  const ratio = limits.storageGb > 0 ? usedGb / limits.storageGb : 0
  return {
    usedGb,
    limitGb: limits.storageGb,
    ratio,
    level: ratio >= 1 ? 'full' : ratio >= 0.8 ? 'warn' : 'ok',
  }
}
