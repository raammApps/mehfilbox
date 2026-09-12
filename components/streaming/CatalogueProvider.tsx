'use client'

import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PosterPaletteName } from '@/lib/poster'
import type { Locale, PlaybackProgress } from '@/lib/schema'

/**
 * The one piece of client state the guest surface shares.
 *
 * Holds the open-title URL contract, the active profile, and the resume map. Modules read it
 * through `useCatalogue()` so a module never has to know how the modal or the router work —
 * which is what lets the customizer's preview pane mount the same tree with a no-op router.
 */

export type CatalogueContextValue = {
  locale: Locale
  catalogueSlug: string
  /**
   * Prefix for every in-app guest link: `''` in subdomain mode, `/c/<slug>` in path mode.
   * Components must not build guest paths from the slug themselves — see `cataloguePath`.
   */
  basePath: string
  profileId: string | null
  setProfileId: (id: string | null) => void
  /** Slug of the title whose modal is open, or null. */
  openTitleSlug: string | null
  openTitle: (slug: string) => void
  closeTitle: () => void
  /** Navigate to the full-screen player. */
  play: (slug: string, atSeconds?: number) => void
  progressByTitleId: Record<string, PlaybackProgress>
  /** Instance id of the first row on the page; it eager-loads its first two cards. */
  firstRowId: string | null
  /** True inside the customizer preview: navigation and history are inert. */
  preview: boolean
  /** The theme's palette for generated art (D-35). Modules read it here, not off the theme. */
  palette: PosterPaletteName
}

const CatalogueContext = createContext<CatalogueContextValue | null>(null)

export function useCatalogue(): CatalogueContextValue {
  const value = useContext(CatalogueContext)
  if (!value) throw new Error('useCatalogue must be used inside <CatalogueProvider>')
  return value
}

export const PROFILE_STORAGE_PREFIX = 'mehfilbox.profile.'

type Props = {
  children: ReactNode
  locale: Locale
  catalogueSlug: string
  basePath?: string
  initialTitleSlug: string | null
  initialProgress: PlaybackProgress[]
  firstRowId: string | null
  preview?: boolean
  palette?: PosterPaletteName
}

export function CatalogueProvider({
  children,
  locale,
  catalogueSlug,
  basePath = '',
  initialTitleSlug,
  initialProgress,
  firstRowId,
  preview = false,
  palette = 'warm',
}: Props) {
  const router = useRouter()
  const [openTitleSlug, setOpenTitleSlug] = useState<string | null>(initialTitleSlug)
  const [profileId, setProfileIdState] = useState<string | null>(null)
  const [progress, setProgress] = useState<PlaybackProgress[]>(initialProgress)

  // localStorage is read after mount, never during render (doc 08 shared rules).
  useEffect(() => {
    if (preview) return
    setProfileIdState(window.localStorage.getItem(PROFILE_STORAGE_PREFIX + catalogueSlug))
  }, [catalogueSlug, preview])

  const setProfileId = useCallback(
    (id: string | null) => {
      setProfileIdState(id)
      if (preview) return
      const key = PROFILE_STORAGE_PREFIX + catalogueSlug
      if (id) window.localStorage.setItem(key, id)
      else window.localStorage.setItem(key, 'skipped')
    },
    [catalogueSlug, preview],
  )

  /** Fetch this profile's resume positions once it is known. */
  useEffect(() => {
    if (preview || !profileId || profileId === 'skipped') return
    let cancelled = false
    fetch(`/api/progress?profileId=${encodeURIComponent(profileId)}`)
      .then((response) => (response.ok ? response.json() : { progress: [] }))
      .then((body: { progress: PlaybackProgress[] }) => {
        if (!cancelled) setProgress(body.progress ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [profileId, preview])

  const openTitle = useCallback(
    (slug: string) => {
      setOpenTitleSlug((current) => {
        if (preview) return slug
        const url = `?title=${encodeURIComponent(slug)}`
        // pushState on first open so Android back closes the modal; replaceState when moving
        // between siblings so back exits rather than walking every card visited (doc 08 §7).
        if (current === null) window.history.pushState({ modal: true }, '', url)
        else window.history.replaceState({ modal: true }, '', url)
        return slug
      })
    },
    [preview],
  )

  const closeTitle = useCallback(() => {
    setOpenTitleSlug((current) => {
      if (current !== null && !preview && window.history.state?.modal) window.history.back()
      return null
    })
  }, [preview])

  /** popstate is the authority: hardware back must close the modal, not leave the site. */
  useEffect(() => {
    if (preview) return
    const onPopState = () => {
      const slug = new URLSearchParams(window.location.search).get('title')
      setOpenTitleSlug(slug)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [preview])

  const play = useCallback(
    (slug: string, atSeconds?: number) => {
      if (preview) return
      const suffix = atSeconds && atSeconds > 0 ? `?t=${Math.floor(atSeconds)}` : ''
      // `basePath` is empty in subdomain mode and `/c/<slug>` in path mode. Hardcoding
      // `/watch/...` here sent every path-mode guest to the marketing page instead of the film.
      router.push(`${basePath}/watch/${encodeURIComponent(slug)}${suffix}`)
    },
    [router, preview, basePath],
  )

  const value = useMemo<CatalogueContextValue>(
    () => ({
      locale,
      catalogueSlug,
      basePath,
      profileId,
      setProfileId,
      openTitleSlug,
      openTitle,
      closeTitle,
      play,
      progressByTitleId: Object.fromEntries(progress.map((p) => [p.titleId, p])),
      firstRowId,
      preview,
      palette,
    }),
    [
      locale,
      catalogueSlug,
      basePath,
      profileId,
      setProfileId,
      openTitleSlug,
      openTitle,
      closeTitle,
      play,
      progress,
      firstRowId,
      preview,
      palette,
    ],
  )

  return <CatalogueContext.Provider value={value}>{children}</CatalogueContext.Provider>
}
