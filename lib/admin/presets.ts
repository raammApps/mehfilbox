import 'server-only'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '@/lib/http/errors'
import { brandingSchema, localeSchema, presetSchema, type Catalogue, type Preset } from '@/lib/schema'
import type { ThemeDefinition } from '@/themes/contract'
import { allThemes } from '@/themes/resolve'
import { TEMPLATES } from './templates'

/** What a studio types in for a style; the routes take this whole or partial. */
export const presetBodySchema = z.object({
  name: z.string().trim().min(1).max(60),
  isDefault: z.boolean().default(false),
  templateId: z
    .string()
    .refine((id) => TEMPLATES.some((template) => template.id === id), 'Unknown layout')
    .default('keepsake'),
  branding: brandingSchema.default({}),
  locale: localeSchema.default('en'),
  passcodeOn: z.boolean().default(false),
})

/** A theme id a studio names has to exist; a withdrawn one is still fine to keep using. */
export async function assertThemeExists(branding: { theme?: string | undefined }): Promise<void> {
  if (!branding.theme) return
  const known = (await allThemes()).some((theme) => theme.id === branding.theme)
  if (!known) {
    throw new ApiError('VALIDATION_FAILED', 'Unknown theme', {
      fields: { 'branding.theme': 'Unknown theme' },
    })
  }
}

/**
 * House styles (D-36, doc 16 §5) — the pieces the routes share.
 *
 * A style is captured from a catalogue's **published** look, not its draft: the couple was given
 * what is live, and "save this look" means that one. `template` is what the wedding started from;
 * the sections themselves are not part of a style, because a layout is the shape and the
 * customizer is where the shape is filled.
 */
export function presetFromCatalogue(
  catalogue: Catalogue,
  name: string,
  orgId: string,
  now = new Date(),
): Preset {
  return presetSchema.parse({
    id: randomUUID(),
    orgId,
    name,
    isDefault: false,
    templateId: catalogue.template ?? 'keepsake',
    branding: catalogue.branding,
    locale: catalogue.locale,
    passcodeOn: catalogue.privacy === 'passcode' && catalogue.passcodeHash !== null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })
}

/**
 * A house style seeded from a platform theme rather than another style (D-57, N-115): "make a
 * copy, edit, save as new," extended from copying a saved style to copying any theme a studio can
 * see, built-in or platform-authored. Free to a studio without limit — the client's own version of
 * this, capped at a "basic five," is N-113/N-115's other half and waits on the payment seam.
 *
 * Only `theme` and `accent` come from the theme itself. `displayFont` is left unset on purpose —
 * absent means "the theme's own face" (see `ThemePicker`), and setting it here would make the
 * copy diverge from the theme the moment a studio picks a different one from the picker later.
 * Everything else (`presentedBy`, `logoUrl`) has no equivalent on a theme, which is tokens only —
 * it seeds from the studio's own branding, same as a blank "New house style" already does.
 */
export function presetFromTheme(
  theme: Pick<ThemeDefinition, 'id' | 'tokens'>,
  name: string,
  orgId: string,
  studioBranding: Pick<Preset['branding'], 'presentedBy' | 'logoUrl' | 'platformCredit'>,
  now = new Date(),
): Preset {
  return presetSchema.parse({
    id: randomUUID(),
    orgId,
    name,
    isDefault: false,
    templateId: 'keepsake',
    branding: { ...studioBranding, theme: theme.id, accent: theme.tokens.accent },
    locale: 'en',
    passcodeOn: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  })
}

/** The fields whose change would rewrite what a delivered wedding was made from. */
export const LOOK_FIELDS = ['templateId', 'branding', 'locale', 'passcodeOn'] as const
