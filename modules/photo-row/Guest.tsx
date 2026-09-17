'use client'

import { Lightbox } from '@/components/streaming/Lightbox'
import { usePhotoDeepLink } from '@/components/streaming/usePhotoDeepLink'
import { PosterRow } from '@/components/streaming/PosterRow'
import { resolveLocalised } from '@/lib/i18n'
import type { SignedPhoto } from '@/lib/photos'
import type { GuestProps } from '../contract'
import type { PhotoRowConfig } from './schema'

export default function Guest({ config, ctx }: GuestProps<PhotoRowConfig>) {
  // Already signed (N-83) — the contract types this `Photo[]` for every other module's sake.
  const photos = (ctx.photos as SignedPhoto[])
    .filter((photo) => (config.albumId ? photo.albumId === config.albumId : true))
    .slice(0, config.limit)

  // Shared with the other photo module so a shared link behaves identically whichever
  // section it came from (N-31).
  const [openIndex, setOpenIndex] = usePhotoDeepLink(photos)

  if (photos.length === 0) return null

  const items = photos.map((photo, index) => ({
    id: photo.id,
    key: String(index),
    label: resolveLocalised(photo.caption, ctx.locale),
    posterUrl: photo.url,
    posterSrcSet: photo.srcSet,
    alt: resolveLocalised(photo.caption, ctx.locale),
  }))

  return (
    <>
      <PosterRow
        heading={ctx.heading}
        items={items}
        aspect={config.layout}
        onOpen={(item) => setOpenIndex(Number(item.key))}
        t={ctx.t}
      />

      {openIndex !== null ? (
        <Lightbox
          catalogueSlug={ctx.catalogue.slug}
          photos={photos}
          index={openIndex}
          locale={ctx.locale}
          t={ctx.t}
          onIndexChange={setOpenIndex}
          onClose={() => setOpenIndex(null)}
        />
      ) : null}
    </>
  )
}
