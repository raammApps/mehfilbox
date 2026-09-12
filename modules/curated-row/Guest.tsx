'use client'

import { PosterRow } from '@/components/streaming/PosterRow'
import type { RowItem } from '@/components/streaming/PosterCard'
import { useCatalogue } from '@/components/streaming/CatalogueProvider'
import { formatDurationBadge } from '@/lib/format'
import { resolveLocalised } from '@/lib/i18n'
import { eyebrowFor } from '@/lib/poster'
import type { GuestProps } from '../contract'
import type { CuratedRowConfig } from './schema'
import { selectRowTitles } from './select'

export default function Guest({ config, ctx }: GuestProps<CuratedRowConfig>) {
  const { openTitle, progressByTitleId, firstRowId, palette } = useCatalogue()

  const items: RowItem[] = selectRowTitles(config, ctx.titles, ctx.consumedTitleIds).map(
    (title) => {
      const progress = config.showProgress ? progressByTitleId[title.id] : undefined

      return {
        id: title.id,
        key: title.slug,
        label: resolveLocalised(title.name, ctx.locale),
        eyebrow: eyebrowFor(resolveLocalised(title.name, ctx.locale), title.category) ?? undefined,
        posterUrl: title.posterUrl,
        palette,
        // Bunny writes an animated preview beside the poster, so the existing signed route
        // serves it — no second credential, no token juggling per card.
        previewUrl: `/api/poster/${title.id}?file=preview.webp`,
        durationBadge: formatDurationBadge(title.durationS),
        ...(progress ? { progress: progress.positionS / Math.max(1, progress.durationS) } : {}),
        alt: resolveLocalised(title.name, ctx.locale),
      }
    },
  )

  return (
    <PosterRow
      heading={ctx.heading}
      items={items}
      aspect={config.aspect}
      onOpen={(item) => openTitle(item.key)}
      t={ctx.t}
      eagerFirstCards={ctx.instanceId === firstRowId}
    />
  )
}
