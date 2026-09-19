import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PricingTable } from '@/components/admin/PricingTable'
import { SEED_PLANS } from '@/lib/db/seed-data'

/**
 * N-118 — the console's price list. The route and the driver are proven elsewhere; what is proven
 * here is the part between a person and them: what a typed price becomes on the wire, when a
 * button may be pressed at all, and what is said when the server says no.
 */

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

const fetchMock = vi.fn()

beforeEach(() => {
  refresh.mockReset()
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const renderTable = () => render(<PricingTable plans={structuredClone(SEED_PLANS)} />)

/** The card a plan lives in, found by its price box — every row has one. */
const row = (name: string) =>
  screen.getByRole('textbox', { name: `${name} price in rupees, ex-GST` }).closest('li') as HTMLElement

const priceBox = (name: string) =>
  screen.getByRole('textbox', { name: `${name} price in rupees, ex-GST` })

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, method: init.method, body: JSON.parse(String(init.body)) as Record<string, unknown> }
}

describe('reading the list', () => {
  it('groups by section, shows what each thing costs now, and says "Not for sale" for a tier with no price', () => {
    renderTable()

    expect(screen.getByRole('heading', { name: 'Wedding plans and storage tiers' })).toBeInTheDocument()
    expect(within(row('Deliver')).getByText('₹1,999 ex-GST')).toBeInTheDocument()
    expect(within(row('Extra storage')).getByText('per GB per month')).toBeInTheDocument()
    expect(within(row('Light')).getByText('Not for sale')).toBeInTheDocument()
  })
})

describe('when a price may be saved', () => {
  it('stays disabled until the price is a valid one that differs from today’s', async () => {
    const user = userEvent.setup()
    renderTable()
    const set = () => within(row('Deliver')).getByRole('button', { name: 'Set price' })

    expect(set()).toBeDisabled()

    await user.clear(priceBox('Deliver'))
    await user.type(priceBox('Deliver'), '19.999')
    expect(screen.getByText('Rupees, like 1999 or 1999.50')).toBeInTheDocument()
    expect(set()).toBeDisabled()

    await user.clear(priceBox('Deliver'))
    await user.type(priceBox('Deliver'), '1499')
    expect(set()).toBeEnabled()

    // Back to exactly what it was: nothing to save.
    await user.clear(priceBox('Deliver'))
    await user.type(priceBox('Deliver'), '1999')
    expect(set()).toBeDisabled()
  })
})

describe('what a save sends', () => {
  it('posts the price in whole paise, with the reason, to that plan’s route', async () => {
    const user = userEvent.setup()
    renderTable()

    await user.type(screen.getByRole('textbox', { name: 'Reason for the next change' }), 'festival offer')
    await user.clear(priceBox('Deliver'))
    await user.type(priceBox('Deliver'), '1499')
    await user.click(within(row('Deliver')).getByRole('button', { name: 'Set price' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(lastCall()).toEqual({
      url: '/api/admin/platform/pricing/deliver',
      method: 'POST',
      body: { pricePaise: 149900, reason: 'festival offer' },
    })
  })

  it('keeps the paise of a price that has some', async () => {
    const user = userEvent.setup()
    renderTable()

    await user.clear(priceBox('Keep'))
    await user.type(priceBox('Keep'), '5999.50')
    await user.click(within(row('Keep')).getByRole('button', { name: 'Set price' }))

    await waitFor(() => expect(lastCall().body).toMatchObject({ pricePaise: 599950 }))
  })

  it('takes a product off sale with null — offered only where there is a price to take off', async () => {
    const user = userEvent.setup()
    renderTable()

    expect(within(row('Light')).queryByRole('button', { name: 'Take off sale' })).not.toBeInTheDocument()

    await user.click(within(row('Deliver')).getByRole('button', { name: 'Take off sale' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    // No reason typed, so none is sent — an empty string would land on the audit row as a reason.
    expect(lastCall().body).toEqual({ pricePaise: null })
  })

  it('sends the suggested-retail range as a pair, and never lets it run backwards', async () => {
    const user = userEvent.setup()
    renderTable()
    const lowest = screen.getByRole('textbox', { name: 'Deliver suggested retail, lowest' })
    const highest = screen.getByRole('textbox', { name: 'Deliver suggested retail, highest' })
    const setRange = () => within(row('Deliver')).getByRole('button', { name: 'Set range' })

    await user.clear(highest)
    await user.type(highest, '9000')
    expect(setRange()).toBeEnabled()
    await user.click(setRange())
    await waitFor(() => expect(lastCall().body).toEqual({ retail: { minPaise: 500000, maxPaise: 900000 } }))

    await user.clear(lowest)
    await user.type(lowest, '9500')
    expect(setRange()).toBeDisabled()
  })

  it('clears the range with null', async () => {
    const user = userEvent.setup()
    renderTable()

    await user.click(within(row('Keep')).getByRole('button', { name: 'Clear' }))

    await waitFor(() => expect(lastCall().body).toEqual({ retail: null }))
  })

  it('offers a retail range on the three duration plans only, and a bundle on the Studio plan only', () => {
    renderTable()

    for (const name of ['Deliver', 'Keep', 'Cinema']) {
      expect(within(row(name)).getByText('Studios typically charge')).toBeInTheDocument()
    }
    expect(within(row('Keep renewal')).queryByText('Studios typically charge')).not.toBeInTheDocument()
    expect(within(row('Deliver')).queryByText('Comes with')).not.toBeInTheDocument()
    expect(within(row('Studio plan')).getByText('Comes with')).toBeInTheDocument()
  })

  it('sends the credit bundle without the credits set to zero', async () => {
    const user = userEvent.setup()
    renderTable()
    const studio = row('Studio plan')
    const cinema = within(studio).getByRole('spinbutton', { name: 'cinema credits included with the Studio plan' })

    await user.clear(cinema)
    await user.type(cinema, '2')
    await user.click(within(studio).getByRole('button', { name: 'Set credits' }))

    // Seeded as deliver 2, keep 0, cinema 1 — keep is zero, so it is left out, not sent as 0.
    await waitFor(() => expect(lastCall().body).toEqual({ grants: { deliver: 2, cinema: 2 } }))
  })
})

describe('after a save', () => {
  it('clears the reason so it cannot ride along with the next, unrelated change, and refreshes the page', async () => {
    const user = userEvent.setup()
    renderTable()
    const reason = screen.getByRole('textbox', { name: 'Reason for the next change' })

    await user.type(reason, 'festival offer')
    await user.clear(priceBox('Deliver'))
    await user.type(priceBox('Deliver'), '1499')
    await user.click(within(row('Deliver')).getByRole('button', { name: 'Set price' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(reason).toHaveValue('')
  })

  it('says what the server said when it refuses, keeps the reason, and does not refresh', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'Change one thing at a time' } }),
    })
    const user = userEvent.setup()
    renderTable()

    await user.type(screen.getByRole('textbox', { name: 'Reason for the next change' }), 'try again')
    await user.click(within(row('Deliver')).getByRole('button', { name: 'Take off sale' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Change one thing at a time')
    expect(screen.getByRole('textbox', { name: 'Reason for the next change' })).toHaveValue('try again')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('keeps the row locked until the refreshed page has arrived, not merely until the write returns', async () => {
    // On a real network the database has the price a second or more before the screen shows it; a
    // row that unlocks in between shows the OLD price beside a live button, which reads as "it did
    // not save" and invites a second click. (Found walking this on staging, not on localhost.)
    let arrive: () => void = () => {}
    refresh.mockReturnValue(new Promise<void>((resolve) => (arrive = resolve)))
    const user = userEvent.setup()
    renderTable()

    await user.clear(priceBox('Deliver'))
    await user.type(priceBox('Deliver'), '1499')
    await user.click(within(row('Deliver')).getByRole('button', { name: 'Set price' }))

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    expect(within(row('Deliver')).getByRole('button', { name: 'Saving…' })).toBeDisabled()

    arrive()
    await waitFor(() =>
      expect(within(row('Deliver')).queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument(),
    )
  })

  it('locks the row and says "Saving…" while the request is in flight', async () => {
    let finish: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const user = userEvent.setup()
    renderTable()

    await user.clear(priceBox('Deliver'))
    await user.type(priceBox('Deliver'), '1499')
    await user.click(within(row('Deliver')).getByRole('button', { name: 'Set price' }))

    const saving = await within(row('Deliver')).findByRole('button', { name: 'Saving…' })
    expect(saving).toBeDisabled()
    // Another row is untouched: a save on one card must not freeze the whole page.
    expect(within(row('Keep')).getByRole('button', { name: 'Set price' })).toBeDisabled() // unchanged, not busy

    finish({ ok: true, status: 200, json: async () => ({}) })
    await waitFor(() => expect(within(row('Deliver')).queryByRole('button', { name: 'Saving…' })).not.toBeInTheDocument())
  })
})
