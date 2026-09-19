import { resolveLocalised } from './i18n'
import { RESERVED_SUBDOMAINS, type Locale, type LocalisedString } from './schema'

/** `1284` → `21:24`; `428` → `7:08`. Used in the player, on cards, and in share text. */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Card badge duration — minutes only, because a badge reading `4:07` implies precision. */
export function formatDurationBadge(totalSeconds: number | null): string | null {
  if (!totalSeconds || totalSeconds <= 0) return null
  const minutes = Math.max(1, Math.round(totalSeconds / 60))
  return `${minutes}m`
}

export function formatWeddingDate(iso: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

/** A URL-safe slug from a display name, used for title slugs and slug suggestions. */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

/** "Aanya & Vikram" → "aanya-vikram". Falls back to a stable suffix when nothing survives. */
/**
 * The couple's names plus the year of the wedding — `aanya-and-vikram-2026`.
 *
 * **The year is not decoration; it is what keeps the namespace usable.** Addresses live in one
 * global space, so before this the second studio to photograph a Priya & Arjun wedding was
 * refused an address by a catalogue they are not permitted to see, with an error that could only
 * read as a fault in the product. Indian couple names repeat often enough that this was going to
 * bite within a few hundred weddings.
 *
 * The **wedding** year rather than today's: a wedding booked in December and delivered in January
 * belongs to the year the couple will always call theirs.
 *
 * The year narrows collisions; it cannot remove them, since one studio may shoot two weddings
 * with the same names in a year. `disambiguate` is what closes that, and the two are meant to be
 * read together.
 */
export function suggestSlug(
  coupleName: LocalisedString | string,
  weddingDate?: string | null,
): string {
  const base = slugify(resolveLocalised(coupleName, 'en'))
  if (base.length < 3) return `wedding-${Math.random().toString(36).slice(2, 6)}`

  // Matched rather than parsed: `new Date('2026')` is a valid date, and a half-typed field would
  // otherwise produce a confident, wrong year while the operator is still typing.
  const year = /^(\d{4})-\d{2}-\d{2}$/.exec((weddingDate ?? '').trim())?.[1]
  return year ? `${base}-${year}` : base
}

/** A taken address's suffix, kept short enough to read aloud and stay memorable. */
const SUFFIX_PATTERN = /-[a-z0-9]{3}$/

/**
 * The free neighbour of an address that is already taken.
 *
 * Guarantees the partner never meets a refusal they cannot resolve: whatever they typed, there is
 * always an address one click away. Three base-36 characters is ~46,000 alternatives for a given
 * name and year, against a collision space of "one studio, two identical couples, one year".
 *
 * Replaces an existing suffix rather than appending one. Stacking would give `…-2026-k3f-p1x` on
 * the second attempt and something unreadable on the third, and the whole point of this scheme is
 * that the common case stays clean.
 */
export function disambiguate(slug: string): string {
  const base = slug.replace(SUFFIX_PATTERN, '')
  return `${base}-${Math.random().toString(36).slice(2, 5)}`
}

/**
 * Slugs are per-catalogue and appear in share links, so collisions get a numeric suffix rather
 * than the random one `disambiguate` gives an org or catalogue address — a film list is small
 * enough that "highlights-2" reads as intentional, where a partner-facing address needs to hide
 * that a collision happened at all.
 *
 * Shared by upload (the first slug a film gets) and a title rename (N-84, re-deriving it from a
 * new name) — one rule for what "the free neighbour of this name" means, not two that drift.
 */
export function uniqueSlug(name: string, taken: string[]): string {
  const base = slugify(name) || 'film'
  if (!taken.includes(base)) return base
  let n = 2
  while (taken.includes(`${base}-${n}`)) n += 1
  return `${base}-${n}`
}

/** Strip an extension and de-noise a videographer's filename into a first-draft title. */
export function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[a-z0-9]+$/i, '')
  return (
    withoutExtension
      .replace(/[_\-.]+/g, ' ')
      // Drop the delivery cruft every studio adds: v3, final, FINAL2, 4k, h264, color.
      .replace(/\b(final|fin|v\d+|ver\d+|copy|export|render|4k|1080p?|720p?|h26[45]|prores|color|colour|graded|master)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
      // Studios deliver WED_FINAL_V3.mp4 as often as they deliver sangeet.mp4, so shouting
      // filenames are normalised rather than passed through to a guest-visible title.
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()) || 'Untitled'
  )
}

/**
 * A free org address derived from a name.
 *
 * Shared by partner registration and by a couple claiming their wedding, because two copies of
 * "find a slug nobody has" drift, and the one that drifts is the one that starts handing out
 * duplicates.
 */
export async function suggestOrgSlug(
  name: string,
  taken: (slug: string) => Promise<{ id: string } | null>,
): Promise<string> {
  const base = slugify(name) || 'couple'

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`
    if ((RESERVED_SUBDOMAINS as readonly string[]).includes(slug)) continue
    if (!(await taken(slug))) return slug
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`
}



/**
 * Whole paise as rupees, the way an Indian price is written: `₹1,999`, `₹1,00,000`, and paise only
 * when there are some (`₹1,999.50`) — a price that is a round number should not wear `.00`.
 */
export function formatRupees(paise: number): string {
  const rupees = paise / 100
  const whole = Number.isInteger(rupees)
  return `₹${new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees)}`
}

/**
 * What an admin typed into a price box, as whole paise — or `null` when it is not a price.
 *
 * Strict on purpose: `1,999`, `₹1999`, `1999.5` and `1999.50` are prices; `19.999`, `-5`, `1e3`
 * and `12k` are typos, and a typo that is quietly rounded into a live price is worse than a
 * refusal. Done on the digits rather than as `Number(x) * 100`, which turns `1.15` into `114.99…`.
 */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, '')
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) return null
  const paise = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'))
  return Number.isSafeInteger(paise) ? paise : null
}
