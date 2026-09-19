import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CreditPanel } from '@/components/admin/CreditPanel'

/**
 * N-118 — the panel a studio meets when Publish is refused for want of a credit. It used to quote
 * "₹1,999, or five for ₹7,999" from the source; it now says whatever the price list says, and must
 * read as a sentence in every state the list can leave it in — priced, priced with no five-pack,
 * and not for sale at all.
 */

const text = () => screen.getByTestId('credit-required').textContent ?? ''

describe('what a credit costs, as the panel says it', () => {
  it('quotes the price and the five-pack from the list, for a studio', () => {
    render(<CreditPanel catalogueId="c" prices={{ credit: '₹1,499', pack: '₹6,999' }} />)

    expect(text()).toContain('spends one Deliver credit — ₹1,499, or five for ₹6,999 — and you have none left')
  })

  it('drops the five-pack clause when there is no five-pack price', () => {
    render(<CreditPanel catalogueId="c" prices={{ credit: '₹1,499', pack: null }} />)

    expect(text()).toContain('spends one Deliver credit — ₹1,499 — and you have none left')
    expect(text()).not.toContain('five for')
  })

  it('reads as a sentence, with no figure at all, when a credit is not for sale', () => {
    render(<CreditPanel catalogueId="c" prices={{ credit: null, pack: null }} />)

    expect(text()).toContain('spends one Deliver credit, and you have none left')
    expect(text()).not.toMatch(/₹\s?\d/)
  })

  it('quotes nothing when it was given no prices, rather than something stale', () => {
    render(<CreditPanel catalogueId="c" />)

    expect(text()).toContain('spends one Deliver credit, and you have none left')
    expect(text()).not.toMatch(/₹\s?\d/)
  })

  it('says the same thing to a couple who started their own, in their own words', () => {
    render(<CreditPanel catalogueId="c" audience="couple" prices={{ credit: '₹1,499', pack: '₹6,999' }} />)

    expect(text()).toContain('publishes on a Deliver credit — ₹1,499 — which your studio can add for you')
    // The five-pack is a studio's offer; a couple is not shown it.
    expect(text()).not.toContain('five for')
  })

  it('reads as a sentence for a couple when a credit is not for sale', () => {
    render(<CreditPanel catalogueId="c" audience="couple" prices={{ credit: null, pack: null }} />)

    expect(text()).toContain('publishes on a Deliver credit, which your studio can add for you')
  })
})
