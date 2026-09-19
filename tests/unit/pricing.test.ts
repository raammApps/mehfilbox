import { beforeEach, describe, expect, it } from 'vitest'
import { setRepository } from '@/lib/db'
import { MemoryRepository, emptySnapshot } from '@/lib/db/memory-repository'
import { SEED_PLANS } from '@/lib/db/seed-data'
import { formatRupees, rupeesToPaise } from '@/lib/format'
import { describeGrants } from '@/lib/plans'
import { getPrice, getPriceListForDisplay, priceLabel, retailLabel } from '@/lib/pricing'

/**
 * N-118, D-61 — no price lives in code. The list is a table, an admin edits it, and the very next
 * read sees the edit. What is proven here is that last sentence: an edit changes the answer with
 * nothing else changing, which is what "adjustable on the fly" means.
 */

let repo: MemoryRepository

beforeEach(() => {
  const snapshot = emptySnapshot()
  snapshot.plans = structuredClone(SEED_PLANS)
  repo = new MemoryRepository(snapshot)
  setRepository(repo)
})

describe('formatting a price', () => {
  it('writes rupees the way an Indian price is written, with paise only when there are some', () => {
    expect(formatRupees(199900)).toBe('₹1,999')
    expect(formatRupees(99900)).toBe('₹999')
    expect(formatRupees(2500)).toBe('₹25')
    expect(formatRupees(199950)).toBe('₹1,999.50')
    expect(formatRupees(10_000_000)).toBe('₹1,00,000')
    expect(formatRupees(0)).toBe('₹0')
  })

  it('reads what an admin types as whole paise, on the digits rather than through a float', () => {
    expect(rupeesToPaise('1999')).toBe(199900)
    expect(rupeesToPaise('1,999')).toBe(199900)
    expect(rupeesToPaise('₹ 1,999.5')).toBe(199950)
    expect(rupeesToPaise('1999.50')).toBe(199950)
    expect(rupeesToPaise('0.99')).toBe(99)
    // `1.15 * 100` is 114.99999999999999 — the reason this is not `Number(x) * 100`.
    expect(rupeesToPaise('1.15')).toBe(115)
  })

  it('refuses a typo rather than rounding it into a live price', () => {
    for (const typo of ['', '   ', '-5', '1e3', '12k', '19.999', 'abc', '1.', '1,99,9x']) {
      expect(rupeesToPaise(typo), JSON.stringify(typo)).toBeNull()
    }
  })
})

describe('the price list in the driver', () => {
  it('lists in console order, whatever order the rows were stored in', async () => {
    const shuffled = emptySnapshot()
    shuffled.plans = structuredClone(SEED_PLANS).reverse()
    const list = await new MemoryRepository(shuffled).listPlans()

    expect(list.map((plan) => plan.position)).toEqual([...list.map((plan) => plan.position)].sort((a, b) => a - b))
    expect(list[0]?.id).toBe('studio')
  })

  it('changes a price and answers with the row as it now is', async () => {
    const updated = await repo.setPlanPrice('deliver', 249900)

    expect(updated?.pricePaise).toBe(249900)
    expect((await repo.getPlan('deliver'))?.pricePaise).toBe(249900)
  })

  it('takes a product off sale with null, which is not zero', async () => {
    const updated = await repo.setPlanPrice('deliver', null)

    expect(updated?.pricePaise).toBeNull()
    expect(updated?.pricePaise).not.toBe(0)
  })

  it('cannot invent a product: an id that is not on the list stays off it', async () => {
    const before = (await repo.listPlans()).length

    expect(await repo.setPlanPrice('made-up', 100)).toBeNull()
    expect(await repo.setPlanRetail('made-up', { minPaise: 1, maxPaise: 2 })).toBeNull()
    expect(await repo.setPlanGrants('made-up', { deliver: 1 })).toBeNull()
    expect((await repo.listPlans()).length).toBe(before)
  })

  it('replaces a credit bundle rather than merging into it', async () => {
    const updated = await repo.setPlanGrants('studio', { keep: 3 })

    expect(updated?.grants).toEqual({ keep: 3 })
  })

  it('sets and clears the advisory retail range as a pair', async () => {
    const set = await repo.setPlanRetail('keep', { minPaise: 1_000_000, maxPaise: 2_500_000 })
    expect([set?.retailMinPaise, set?.retailMaxPaise]).toEqual([1_000_000, 2_500_000])

    const cleared = await repo.setPlanRetail('keep', null)
    expect([cleared?.retailMinPaise, cleared?.retailMaxPaise]).toEqual([null, null])
  })

  it('hands out copies, so a caller cannot edit the price list by editing what it was given', async () => {
    const plan = await repo.getPlan('deliver')
    plan!.pricePaise = 1

    expect((await repo.getPlan('deliver'))?.pricePaise).not.toBe(1)
  })
})

describe('getPrice, the one way code learns a price', () => {
  it('reads the list, so an edit changes the next answer with nothing else changing', async () => {
    const before = await getPrice('keep')
    await repo.setPlanPrice('keep', (before ?? 0) + 100_000)

    expect(await getPrice('keep')).toBe((before ?? 0) + 100_000)
  })

  it('answers null for a product that is off sale and for one that does not exist', async () => {
    await repo.setPlanPrice('keep', null)

    expect(await getPrice('keep')).toBeNull()
    expect(await getPrice('made-up')).toBeNull()
  })

  it('is strict: when the list cannot be read it throws rather than guessing a price', async () => {
    repo.getPlan = async () => {
      throw new Error('database unreachable')
    }

    await expect(getPrice('deliver')).rejects.toThrow('database unreachable')
  })
})

describe('the display reader never takes a public page down', () => {
  it('returns the list keyed by id', async () => {
    const list = await getPriceListForDisplay()

    expect(list.studio?.name).toBe('Studio plan')
    expect(Object.keys(list)).toHaveLength(SEED_PLANS.length)
  })

  it('returns an empty list instead of throwing, so the page renders without prices', async () => {
    repo.listPlans = async () => {
      throw new Error('relation "plans" has no column "unit"')
    }

    // The migration not being applied yet must not become a 500 on the page every ad lands on.
    await expect(getPriceListForDisplay()).resolves.toEqual({})
  })

  it('labels a price, and says nothing at all for one that is off sale', async () => {
    await repo.setPlanPrice('keep', null)
    const list = await getPriceListForDisplay()

    expect(priceLabel(list, 'deliver')).toBe(formatRupees(199900))
    expect(priceLabel(list, 'keep')).toBeNull()
    expect(priceLabel(list, 'made-up')).toBeNull()
    expect(priceLabel({}, 'deliver')).toBeNull()
  })

  it('labels the suggested-retail range only when both ends exist', async () => {
    await repo.setPlanRetail('keep', null)
    const list = await getPriceListForDisplay()

    expect(retailLabel(list, 'deliver')).toBe(`${formatRupees(500000)} – ${formatRupees(800000)}`)
    expect(retailLabel(list, 'keep')).toBeNull()
  })
})

describe('describing a credit bundle in words', () => {
  it('names each credit by what the list calls it, in the order a studio reads them', async () => {
    const list = await getPriceListForDisplay()

    expect(describeGrants(list.studio!.grants, list)).toBe('2 Deliver credits and 1 Cinema credit')
  })

  it('says "credit" for one and "credits" for more, and joins three with commas', async () => {
    const list = await getPriceListForDisplay()

    expect(describeGrants({ keep: 1 }, list)).toBe('1 Keep credit')
    expect(describeGrants({ deliver: 2, keep: 1, cinema: 1 }, list)).toBe(
      '2 Deliver credits, 1 Keep credit and 1 Cinema credit',
    )
  })

  it('says nothing for an empty bundle or one of zeros', async () => {
    const list = await getPriceListForDisplay()

    expect(describeGrants({}, list)).toBeNull()
    expect(describeGrants({ deliver: 0 }, list)).toBeNull()
  })

  it('takes each name from the plan’s own row, so no sentence spells one itself', async () => {
    const list = await getPriceListForDisplay()
    list.cinema = { ...list.cinema!, name: 'Cinema Plus' }

    expect(describeGrants({ cinema: 1 }, list)).toBe('1 Cinema Plus credit')
  })
})
