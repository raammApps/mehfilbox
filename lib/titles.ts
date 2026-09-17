import 'server-only'
import { getRepository } from '@/lib/db'
import { uniqueSlug } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import { ApiError } from '@/lib/http/errors'
import type { Title } from '@/lib/schema'

/**
 * N-84: the slug is set once, from the upload's filename — renaming the title never touched it,
 * so a share link carried `whatsapp-video-2026-08-12-at-02-07-21` forever, even once the operator
 * called it *Sangeet*. Two ways a slug now changes, and only ever once each:
 *
 *   1. An operator edits it directly (`body.slug`) — the same affordance a catalogue's address
 *      already has, checked against its own siblings the same way (`slugAvailable`'s pattern,
 *      just scoped to `catalogue_id` rather than global, since that is what the DB itself
 *      enforces — `unique (catalogue_id, slug)`).
 *   2. The **first** rename after upload (`body.name`, `title.slugChangedAt` still null)
 *      re-derives it automatically, with `uniqueSlug` — the exact function upload itself uses, so
 *      a renamed-before-anyone-saw-it film gets the same address a fresh upload with that name
 *      would have. Every rename after the first leaves the slug alone: links are in phones by
 *      then, and a slug that moves on every save is not an address, it is a moving target.
 *
 * Either way the old slug becomes `previousSlug`, redirectable for 90 days from `slugChangedAt`
 * (`app/c/[slug]/watch/[titleSlug]/page.tsx`) — a forwarded link should not die the moment a typo
 * in a filename gets fixed.
 */
export async function resolveSlugChange(
  title: Title,
  body: { slug?: string; name?: Title['name'] },
): Promise<Pick<Title, 'slug' | 'previousSlug' | 'slugChangedAt'> | null> {
  let nextSlug: string
  let checkUniqueness: boolean

  if (body.slug !== undefined) {
    nextSlug = body.slug
    checkUniqueness = true
  } else if (body.name !== undefined && title.slugChangedAt === null) {
    const siblings = await getRepository().listTitles(title.catalogueId)
    nextSlug = uniqueSlug(
      resolveLocalised(body.name, 'en'),
      siblings.filter((t) => t.id !== title.id).map((t) => t.slug),
    )
    checkUniqueness = false // `uniqueSlug` already guarantees it against these same siblings.
  } else {
    return null
  }

  if (nextSlug === title.slug) return null

  if (checkUniqueness) {
    const siblings = await getRepository().listTitles(title.catalogueId)
    if (siblings.some((t) => t.id !== title.id && t.slug === nextSlug)) {
      throw new ApiError('VALIDATION_FAILED', 'That address is taken', {
        fields: { slug: 'Another film in this wedding already uses that address' },
      })
    }
  }

  return { slug: nextSlug, previousSlug: title.slug, slugChangedAt: new Date().toISOString() }
}

/** A rename keeps the old address alive this long (N-84) — long enough for a forwarded link to
 *  still be sitting in someone's phone, short enough that a filename typo does not linger forever. */
export const SLUG_REDIRECT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000

/** The published title, if any, whose *previous* slug was `oldSlug` and whose rename is still
 *  within the redirect window — checked only on a miss, so an existing slug costs nothing extra. */
export async function findRenamedTitle(catalogueId: string, oldSlug: string): Promise<Title | null> {
  const titles = await getRepository().listTitles(catalogueId, { publishedOnly: true })
  return (
    titles.find(
      (t) =>
        t.previousSlug === oldSlug &&
        t.slugChangedAt !== null &&
        Date.now() - new Date(t.slugChangedAt).getTime() < SLUG_REDIRECT_WINDOW_MS,
    ) ?? null
  )
}
