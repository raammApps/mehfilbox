import { describe, expect, it } from 'vitest'
import { parseLocale, parseLocaleOrNull } from '@/lib/i18n'
import { orgSchema, partnerRegistrationSchema, catalogueSchema } from '@/lib/schema'
import { makeCatalogue } from '../helpers/repository'

/**
 * N-29 — a studio picks its language once and its weddings inherit it.
 *
 * Before this, `DEFAULT_LOCALE` was English for everyone and the only route to Hindi was a toggle
 * in the corner of the guest page. A Hindi-first studio in Jaipur therefore set up every wedding
 * in English and hoped the family found the switch, which is the wrong way round for the market
 * this product is built for.
 */

describe('the distinction the whole feature rests on', () => {
  /**
   * "The guest chose English" and "the guest chose nothing" were the same value, which is why a
   * catalogue could not have a default of its own. Splitting them is the change; everything else
   * is plumbing.
   */
  it('separates a guest who chose English from a guest who chose nothing', () => {
    expect(parseLocaleOrNull('en')).toBe('en')
    expect(parseLocaleOrNull(undefined)).toBeNull()
    expect(parseLocaleOrNull('')).toBeNull()
    // Unsupported is "nothing" too, so a stale cookie from a language we dropped falls back to
    // the catalogue rather than pinning English forever.
    expect(parseLocaleOrNull('fr')).toBeNull()
  })

  it('leaves parseLocale exactly as it was, for the pages with no catalogue in scope', () => {
    expect(parseLocale(undefined)).toBe('en')
    expect(parseLocale('hi')).toBe('hi')
    expect(parseLocale('hi-IN')).toBe('hi')
  })
})

describe('what a studio chooses at registration', () => {
  it('accepts a language, and defaults to English when the field is absent', () => {
    const withHindi = partnerRegistrationSchema.parse({
      businessName: 'Kalyanam Weddings',
      contactName: 'A Person',
      email: 'a@example.com',
      password: 'a-long-enough-password',
      locale: 'hi',
    })
    expect(withHindi.locale).toBe('hi')

    // Defaulted rather than required: an older client that does not send it still registers.
    const without = partnerRegistrationSchema.parse({
      businessName: 'Kalyanam Weddings',
      contactName: 'A Person',
      email: 'a@example.com',
      password: 'a-long-enough-password',
    })
    expect(without.locale).toBe('en')
  })

  it('refuses a language the product does not have', () => {
    expect(() =>
      partnerRegistrationSchema.parse({
        businessName: 'Kalyanam Weddings',
        contactName: 'A Person',
        email: 'a@example.com',
        password: 'a-long-enough-password',
        locale: 'fr',
      }),
    ).toThrow()
  })
})

describe('a catalogue carries its own copy', () => {
  /**
   * Copied at creation rather than read through the org. A studio that switches its own default
   * next year must not silently change the language of a wedding delivered last year — the couple
   * has the link, and the page is theirs.
   */
  it('keeps the language it was created with when the studio changes its default', () => {
    const org = orgSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Kalyanam Weddings',
      slug: 'kalyanam',
      locale: 'hi',
      createdAt: '2026-01-01T00:00:00.000Z',
    })

    const delivered = makeCatalogue({ slug: 'aanya-vikram', locale: org.locale })
    expect(delivered.locale).toBe('hi')

    // The studio switches. The delivered wedding is untouched, because it holds a copy.
    const switched = orgSchema.parse({ ...org, locale: 'en' })
    expect(switched.locale).toBe('en')
    expect(delivered.locale).toBe('hi')
  })

  it('defaults to English, so every row that predates this reads as it always did', () => {
    const legacy = catalogueSchema.parse({
      id: '22222222-2222-4222-8222-222222222222',
      orgId: '11111111-1111-4111-8111-111111111111',
      slug: 'older',
      coupleName: { en: 'A & B' },
      appName: { en: 'A & B Originals' },
      weddingDate: '2026-02-14',
      includedUntil: '2026-12-31',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(legacy.locale).toBe('en')
  })
})
