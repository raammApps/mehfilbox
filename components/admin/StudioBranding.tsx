'use client'

import { ThemePicker } from './ThemePicker'
import type { Catalogue } from '@/lib/schema'

/**
 * The studio's branding, through the same panel a wedding uses (N-26).
 *
 * A thin adapter rather than a second colour picker: the fields, the presets and — the part that
 * matters — the contrast gate are all one implementation. Two copies is how one of them quietly
 * stops checking contrast, which is the check a white-label product can least afford to lose.
 */
export function StudioBranding({ branding }: { branding: Catalogue['branding'] }) {
  return (
    <ThemePicker
      // No catalogue exists here; the picker only ever reads these three fields off it.
      catalogue={{ id: 'studio', branding, draftBranding: null }}
      target={{ kind: 'studio' }}
    />
  )
}
