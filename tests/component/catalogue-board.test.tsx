import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CatalogueBoard, type CatalogueRow } from '@/components/admin/CatalogueBoard'

/**
 * The list a partner runs their business from.
 *
 * Filtering is client-side, which means it is code rather than a query — and code with no test
 * is exactly how the customizer got replaced wholesale with a green suite. The point of every
 * assertion here is that what is on screen matches what was asked for, including the cases
 * where the answer is nothing.
 */

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

function row(over: Partial<CatalogueRow> & { id: string; name: string }): CatalogueRow {
  return {
    slug: over.name.toLowerCase().replace(/[^a-z]+/g, '-'),
    url: `https://example.com/c/${over.id}`,
    status: 'draft',
    subStatus: 'included',
    weddingDate: '2026-02-14',
    weddingDateLabel: '14 February 2026',
    // No renewal date by default, so a fixture is never accidentally about to lapse.
    includedUntil: null,
    counts: { titles: 4, ready: 4, published: 4, failed: 0, photos: 12 },
    ...over,
  }
}

const ROWS: CatalogueRow[] = [
  row({ id: 'a', name: 'Aanya and Vikram', status: 'published', weddingDate: '2026-02-14' }),
  row({ id: 'b', name: 'Riya and Kabir', status: 'draft', weddingDate: '2026-05-02' }),
  row({
    id: 'c',
    name: 'Meera and Arjun',
    status: 'published',
    weddingDate: '2025-11-30',
    // A live page with a film that failed — the case the "needs attention" filter is for.
    counts: { titles: 5, ready: 4, published: 4, failed: 1, photos: 0 },
  }),
]

function names(): string[] {
  return screen
    .getAllByRole('listitem')
    .map((item) => within(item).getAllByRole('link')[0]?.textContent ?? '')
}

describe('CatalogueBoard', () => {
  it('teaches rather than shrugs when there is nothing yet', () => {
    render(<CatalogueBoard rows={[]} />)
    expect(screen.getByRole('heading', { name: /no weddings here yet/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create the first one/i })).toBeInTheDocument()
  })

  it('counts live, drafts and what needs attention across the org', () => {
    render(<CatalogueBoard rows={ROWS} />)

    // Scoped to the summary list: "Live" and "Drafts" are also the names of filter buttons.
    const glance = screen.getByLabelText('At a glance')
    const summary = (label: string) =>
      within(glance).getByText(label).parentElement?.textContent?.replace(label, '') ?? ''

    expect(summary('Catalogues')).toBe('3')
    expect(summary('Live')).toBe('2')
    expect(summary('Drafts')).toBe('1')
    expect(summary('Need attention')).toBe('1')
  })

  it('searches on the couple and on the address', async () => {
    const user = userEvent.setup()
    render(<CatalogueBoard rows={ROWS} />)

    await user.type(screen.getByLabelText('Search catalogues'), 'riya')
    expect(names()).toEqual(['Riya and Kabir'])

    // The slug is what an operator has in front of them when a couple sends a link back.
    await user.clear(screen.getByLabelText('Search catalogues'))
    await user.type(screen.getByLabelText('Search catalogues'), 'meera-and-arjun')
    expect(names()).toEqual(['Meera and Arjun'])
  })

  it('filters to the ones actually going wrong', async () => {
    const user = userEvent.setup()
    render(<CatalogueBoard rows={ROWS} />)

    await user.click(screen.getByRole('button', { name: 'Needs attention' }))
    expect(names()).toEqual(['Meera and Arjun'])
    expect(screen.getByText('1 film failed')).toBeInTheDocument()
  })

  it('offers a way out of a filter that matches nothing', async () => {
    const user = userEvent.setup()
    render(<CatalogueBoard rows={ROWS} />)

    await user.type(screen.getByLabelText('Search catalogues'), 'nobody')
    expect(screen.queryAllByRole('listitem')).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: /clear the filters/i }))
    expect(names()).toHaveLength(3)
  })

  it('sorts by wedding date by default, and by couple on request', async () => {
    const user = userEvent.setup()
    render(<CatalogueBoard rows={ROWS} />)

    expect(names()).toEqual(['Riya and Kabir', 'Aanya and Vikram', 'Meera and Arjun'])

    await user.selectOptions(screen.getByLabelText('Sort'), 'name')
    expect(names()).toEqual(['Aanya and Vikram', 'Meera and Arjun', 'Riya and Kabir'])
  })

  /**
   * A partner scanning this list is deciding what to do next. If every card says the same thing,
   * the list is a directory rather than a worklist — which is what it was.
   */
  it('says something different about each catalogue', () => {
    render(<CatalogueBoard rows={ROWS} />)
    expect(screen.getByText('1 film failed')).toBeInTheDocument()
    expect(screen.getByText('Ready to publish')).toBeInTheDocument()
    expect(screen.getByText('Live and complete')).toBeInTheDocument()
  })
})
