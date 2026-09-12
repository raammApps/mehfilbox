'use client'

import { PosterRow } from '@/components/streaming/PosterRow'
import type { RowItem } from '@/components/streaming/PosterCard'
import { useCatalogue } from '@/components/streaming/CatalogueProvider'
import { formatDurationBadge } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import type { GuestProps } from '../contract'
import type { ContinueWatchingConfig } from './schema'

/**
 * Films this guest started and did not finish (doc 14 §3).
 *
 * Progress comes from `useCatalogue()`, which the provider already assembles for the whole page —
 * so this needed no change to `GuestContext` and no new fetch. A module that fetched its own data
 * would also be a module the customizer's preview could not render honestly.
 *
 * **Empty is the normal case, and empty means gone.** Most films here are under five minutes and
 * get finished; doc 14 §3's rule is that a module with nothing to show is not there at all,
 * rather than a heading above a blank strip.
 */
export default function Guest({ config, ctx }: GuestProps<ContinueWatchingConfig>) {
  const { openTitle, progressByTitleId, palette } = useCatalogue()

  const resumable = ctx.titles
    .map((title) => ({ title, progress: progressByTitleId[title.id] }))
    .filter(({ progress }) => {
      if (!progress) return false
      // `completed` is set past 95% by the progress endpoint. Honouring the flag rather than
      // recomputing a threshold here keeps one definition of "finished" in the product.
      if (progress.completed) return false
      return progress.positionS >= config.minSeconds
    })
    // Most recently watched first: the thing they were interrupted in is the thing they want.
    .sort((a, b) => b.progress!.updatedAt.localeCompare(a.progress!.updatedAt))
    .slice(0, config.maxItems)

  if (resumable.length === 0) return null

  const items: RowItem[] = resumable.map(({ title, progress }) => ({
    id: title.id,
    key: title.slug,
    label: resolveLocalised(title.name, ctx.locale),
    posterUrl: title.posterUrl,
    palette,
    previewUrl: `/api/poster/${title.id}?file=preview.webp`,
    durationBadge: formatDurationBadge(title.durationS),
    progress: progress!.positionS / Math.max(1, progress!.durationS),
    alt: resolveLocalised(title.name, ctx.locale),
  }))

  return (
    <PosterRow
      heading={ctx.heading}
      items={items}
      aspect="16:9"
      onOpen={(item) => openTitle(item.key)}
      t={ctx.t}
    />
  )
}
