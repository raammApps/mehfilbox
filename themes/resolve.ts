import 'server-only'
import { revalidateTag, unstable_cache } from 'next/cache'
import { getRepository } from '@/lib/db'
import type { Branding } from '@/lib/schema'
import type { ThemeDefinition } from './contract'
import { builtInThemes, fromCustom, themeFrom } from './registry'

/**
 * Themes as a guest page or the console sees them: the built-in seven plus whatever a platform
 * admin has authored (doc 16 §4). Cached under one tag, dropped when a theme is saved — a stored
 * theme changes rarely and is read on every guest request.
 */
const TAG = 'themes'

const listStored = unstable_cache(
  async () => getRepository().listCustomThemes(),
  ['custom-themes', 'g1'],
  { tags: [TAG], revalidate: 3600 },
)

/** Every theme that exists, enabled or not — what a catalogue already on a theme resolves against. */
export async function allThemes(): Promise<ThemeDefinition[]> {
  const stored = await listStored().catch(() => [])
  return [...builtInThemes(), ...stored.map(fromCustom)]
}

/** What a picker offers: enabled only. */
export async function availableThemes(): Promise<ThemeDefinition[]> {
  return (await allThemes()).filter((theme) => theme.enabled)
}

/** The theme a catalogue's branding names, custom-aware. */
export async function resolveTheme(branding: Pick<Branding, 'theme'>): Promise<ThemeDefinition> {
  return themeFrom(branding, await allThemes())
}

export function revalidateThemes(): void {
  revalidateTag(TAG)
}
