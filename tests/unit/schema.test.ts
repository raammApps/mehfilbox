import { describe, expect, it } from 'vitest'
import { appNameSchema, catalogueSchema, slugSchema, titleSchema, titleSlugSchema } from '@/lib/schema'
import { demoSnapshot } from '@/lib/db/seed-data'

/** doc 10 §1 test 13, plus the invariants the rest of the app assumes hold. */

describe('appNameSchema', () => {
  it.each(['SharmaFlix', 'sharmaflix', 'Sharma FLIX', 'Aanya & Vikram flix '])(
    'rejects %s',
    (name) => {
      const result = appNameSchema.safeParse({ en: name })
      expect(result.success).toBe(false)
    },
  )

  it.each(['SharmaStream', 'Sharma Originals', 'The Sharma Files', 'Aanya & Vikram Originals'])(
    'accepts %s',
    (name) => {
      expect(appNameSchema.safeParse({ en: name }).success).toBe(true)
    },
  )

  it('suggests a replacement rather than just saying no', () => {
    const result = appNameSchema.safeParse({ en: 'SharmaFlix' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]!.message).toMatch(/Originals|Stream|Files/)
    }
  })

  it('checks every locale, not only English', () => {
    expect(appNameSchema.safeParse({ en: 'Sharma Originals', hi: 'शर्मा Flix' }).success).toBe(false)
  })
})

describe('slugSchema', () => {
  it.each(['aanya-vikram', 'sharma2026', 'a-b-c'])('accepts %s', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(true)
  })

  it.each([
    ['ab', 'too short'],
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['double--hyphen', 'double hyphen'],
    ['Under_score', 'underscore'],
    ['admin', 'reserved'],
    ['api', 'reserved'],
    ['www', 'reserved'],
  ])('rejects %s (%s)', (slug) => {
    expect(slugSchema.safeParse(slug).success).toBe(false)
  })

  it('lowercases and trims before validating', () => {
    expect(slugSchema.parse('  Aanya-Vikram  ')).toBe('aanya-vikram')
  })
})

describe('titleSlugSchema (N-84)', () => {
  /**
   * A film's own address is scoped to its wedding, never a subdomain — a wedding legitimately
   * titled "Admin" or "API" (a joke reel, a tech-team in-joke) must not be refused an address for
   * a reason that only ever applied to `slugSchema`'s subdomain namespace.
   */
  it.each(['admin', 'api', 'www', 'a'])('accepts %s, unlike slugSchema', (slug) => {
    expect(titleSlugSchema.safeParse(slug).success).toBe(true)
    expect(slugSchema.safeParse(slug).success).toBe(false)
  })

  it.each([
    ['-leading', 'leading hyphen'],
    ['trailing-', 'trailing hyphen'],
    ['double--hyphen', 'double hyphen'],
    ['Under_score', 'underscore'],
    ['', 'empty'],
  ])('rejects %s (%s)', (slug) => {
    expect(titleSlugSchema.safeParse(slug).success).toBe(false)
  })

  it('lowercases and trims before validating', () => {
    expect(titleSlugSchema.parse('  Sangeet-Night  ')).toBe('sangeet-night')
  })
})

describe('the demo fixture', () => {
  const snapshot = demoSnapshot()

  it('parses cleanly against the catalogue schema', () => {
    for (const catalogue of snapshot.catalogues) {
      expect(catalogueSchema.safeParse(catalogue).success, catalogue.slug).toBe(true)
    }
  })

  it('parses cleanly against the title schema', () => {
    for (const title of snapshot.titles) {
      expect(titleSchema.safeParse(title).success, title.slug).toBe(true)
    }
  })

  it('is nine titles, not twenty (doc 09 P0-29)', () => {
    expect(snapshot.titles).toHaveLength(9)
  })

  it('stays inside the photo cap', () => {
    expect(snapshot.photos.length).toBeLessThanOrEqual(60)
  })

  it('is three to five sections — a curated shape, not a page of everything', () => {
    const sections = snapshot.catalogues[0]!.modules
    expect(sections.length).toBeGreaterThanOrEqual(3)
    expect(sections.length).toBeLessThanOrEqual(5)
  })

  it('has at least one non-video section', () => {
    const types = snapshot.catalogues[0]!.modules.map((m) => m.type)
    expect(types.some((type) => type === 'letter' || type === 'photo_grid')).toBe(true)
  })

  it('leaves one Hindi synopsis missing, so the fallback path is exercised in the demo', () => {
    expect(snapshot.titles.some((title) => title.synopsis && !title.synopsis.hi)).toBe(true)
  })

  it('gives every title a Hindi name', () => {
    expect(snapshot.titles.every((title) => Boolean(title.name.hi))).toBe(true)
  })

  it('has unique slugs', () => {
    const slugs = snapshot.titles.map((title) => title.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })
})
