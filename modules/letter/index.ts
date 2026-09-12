import dynamic from 'next/dynamic'
import { resolveLocalised } from '@/lib/i18n'
import type { LocalisedString } from '@/lib/schema'
import { defineModule } from '../contract'
import Guest from './Guest'
import { configSchema, type LetterConfig } from './schema'

/**
 * The couple writes in the language their account reads. English is the fallback every localised
 * string must carry, so it is filled in when it was empty and left alone when it was not — a
 * Hindi rewrite must not overwrite the English a guest with the toggle sees.
 */
function localised(current: LocalisedString, text: string, locale: 'en' | 'hi'): LocalisedString {
  const next = { ...current, [locale]: text }
  if (!next.en) next.en = text
  return next
}

export default defineModule<LetterConfig>({
  meta: {
    type: 'letter',
    label: 'A message',
    description: 'A long-form personal note, set as type. No video, and often the best screen.',
    icon: 'PenLine',
    occasions: ['wedding', 'anniversary', 'proposal', 'birthday', 'engagement'],
    phase: 0,
    content: 'text',
    shape: 'prose',
  },

  schema: configSchema,

  Guest,
  /**
   * Lazy, because the editor is admin-only and the registry is imported by the guest page.
   *
   * Every module's `index.ts` is one import away from `ModuleRenderer`, so a statically imported
   * Editor put the admin's form fields and icon set into the bundle of every guest on a phone.
   * `pnpm check:bundle` caught it when the Phase 1 modules made it four editors worse.
   */
  Editor: dynamic(() => import('./Editor')),

  defaults: () => ({ body: { en: '' }, signature: { en: '' }, theme: 'plain' }),

  /** The letter is what a couple rewrites from their account (D-37). */
  prose: {
    read: (config, locale) => ({
      body: resolveLocalised(config.body, locale),
      signature: resolveLocalised(config.signature, locale),
    }),
    write: (config, { body, signature, locale }) => ({
      ...config,
      body: localised(config.body, body, locale),
      signature: localised(config.signature, signature, locale),
    }),
  },

  advise: (config) => {
    const words = config.body.en.trim().split(/\s+/).filter(Boolean).length
    if (words === 0) return ['This message is empty, so guests will not see it at all.']
    if (words < 25) return ['A very short message reads as a caption. Two or three paragraphs land better.']
    return []
  },
})
