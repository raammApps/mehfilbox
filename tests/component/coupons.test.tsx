import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CouponSwitch, CreateCouponForm } from '@/components/admin/CouponConsole'
import { RedeemCode } from '@/components/admin/RedeemCode'

/**
 * N-121 — the three places a person handles a coupon: a studio redeeming one, an admin making one,
 * and an admin switching one off. The routes are proven in `tests/unit`; what is proven here is what
 * goes on the wire (in particular that a rupee amount becomes paise and a blank limit becomes "none"),
 * when a button may be pressed at all, and what a person is told.
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

afterEach(() => vi.unstubAllGlobals())

const lastCall = () => {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, method: init.method, body: JSON.parse(String(init.body)) as Record<string, unknown> }
}

const names = { deliver: 'Deliver', keep: 'Keep', cinema: 'Cinema' }

describe('a studio redeeming a code', () => {
  it('cannot press Redeem with nothing typed', () => {
    render(<RedeemCode planNames={names} />)

    expect(screen.getByRole('button', { name: 'Redeem' })).toBeDisabled()
  })

  it('sends what was typed, and says what was added — in the plan’s own name', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ granted: { count: 2, planId: 'cinema' } }) })
    render(<RedeemCode planNames={names} />)

    await user.type(screen.getByLabelText('Have a code?'), 'welcome-2026')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Added 2 Cinema credits.')
    expect(lastCall()).toEqual({ url: '/api/admin/coupons/redeem', method: 'POST', body: { code: 'welcome-2026' } })
    expect(refresh).toHaveBeenCalled()
    // Cleared, so the same code is not sitting there to be redeemed twice.
    expect(screen.getByLabelText('Have a code?')).toHaveValue('')
  })

  it('says "credit" for one', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ granted: { count: 1, planId: 'keep' } }) })
    render(<RedeemCode planNames={names} />)

    await user.type(screen.getByLabelText('Have a code?'), 'ONE-KEEP')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Added 1 Keep credit.')
  })

  it('shows exactly what the server said when a code did not work, and does not refresh', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { code: 'COUPON_INVALID', message: 'That code did not work.' } }),
    })
    render(<RedeemCode planNames={names} />)

    await user.type(screen.getByLabelText('Have a code?'), 'NOSUCHCODE')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('That code did not work.')
    expect(refresh).not.toHaveBeenCalled()
    // Left where it was, so a typo can be fixed rather than retyped.
    expect(screen.getByLabelText('Have a code?')).toHaveValue('NOSUCHCODE')
  })

  it('tells a studio that has tried too many times to wait, in the server’s words', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: { code: 'RATE_LIMITED', message: 'Too many attempts — try again a little later' } }),
    })
    render(<RedeemCode planNames={names} />)

    await user.type(screen.getByLabelText('Have a code?'), 'ANYTHING')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
  })

  it('does not lose the studio when the network fails', async () => {
    const user = userEvent.setup()
    fetchMock.mockRejectedValue(new Error('offline'))
    render(<RedeemCode planNames={names} />)

    await user.type(screen.getByLabelText('Have a code?'), 'ANYTHING')
    await user.click(screen.getByRole('button', { name: 'Redeem' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })
})

describe('an admin making a coupon', () => {
  const products = [
    { id: 'deliver', name: 'Deliver' },
    { id: 'keep', name: 'Keep' },
  ]
  const form = () => render(<CreateCouponForm products={products} planNames={names} />)
  const fill = async (user: ReturnType<typeof userEvent.setup>, value: string, campaign = 'Spring 2026') => {
    await user.type(screen.getByLabelText('Value'), value)
    await user.type(screen.getByLabelText('Campaign'), campaign)
  }

  it('cannot be created until it has a value and a campaign', async () => {
    const user = userEvent.setup()
    form()
    const create = screen.getByRole('button', { name: 'Create coupon' })

    expect(create).toBeDisabled()
    await user.type(screen.getByLabelText('Value'), '20')
    expect(create).toBeDisabled()
    await user.type(screen.getByLabelText('Campaign'), 'Spring 2026')
    expect(create).toBeEnabled()
  })

  it('sends a percentage as a number, with both doors, no product limit and one use each', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ coupon: { code: 'K7Q2M9XW4A' } }) })
    form()

    await fill(user, '20')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Created K7Q2M9XW4A')
    expect(lastCall()).toEqual({
      url: '/api/admin/platform/coupons',
      method: 'POST',
      body: {
        kind: 'percent',
        value: 20,
        doors: ['studio', 'couple'],
        planIds: [],
        campaign: 'Spring 2026',
        validFrom: null,
        validUntil: null,
        maxRedemptions: null,
        maxPerPayer: 1,
      },
    })
    expect(refresh).toHaveBeenCalled()
  })

  it('turns rupees into paise, so ₹499.50 is 49950 and never 499', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ coupon: { code: 'X' } }) })
    form()

    await user.click(screen.getByLabelText('Amount off'))
    await fill(user, '499.50')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastCall().body).toMatchObject({ kind: 'fixed', value: 49950 })
  })

  it('sends a reward’s basket and no door or product, and says it is for studios only', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ coupon: { code: 'X' } }) })
    form()

    await user.click(screen.getByLabelText('Reward credits'))
    await user.selectOptions(screen.getByLabelText('Which credit'), 'cinema')
    await fill(user, '2', 'Welcome')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    const { body } = lastCall()
    expect(body).toMatchObject({ kind: 'reward', value: 2, rewardPlanId: 'cinema', campaign: 'Welcome' })
    expect(body).not.toHaveProperty('doors')
    expect(body).not.toHaveProperty('planIds')
    expect(screen.getByText(/for studios only/)).toBeInTheDocument()
    expect(screen.queryByText('Who can use it')).not.toBeInTheDocument()
  })

  it('sends the products and doors chosen, and the limits typed — a blank limit is none', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ coupon: { code: 'X' } }) })
    form()

    await fill(user, '15')
    await user.click(screen.getByLabelText('Studios')) // untick: couples only
    await user.click(screen.getByLabelText('Keep'))
    await user.type(screen.getByLabelText('Uses in total'), '50')
    await user.clear(screen.getByLabelText('Uses per payer'))
    await user.type(screen.getByLabelText('Code'), 'diwali-26')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastCall().body).toMatchObject({
      code: 'diwali-26',
      doors: ['couple'],
      planIds: ['keep'],
      maxRedemptions: 50,
      maxPerPayer: null,
    })
  })

  it('sends no code at all when it is left blank, which is how a random one is asked for', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ coupon: { code: 'X' } }) })
    form()

    await fill(user, '10')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastCall().body).not.toHaveProperty('code')
  })

  it.each([
    ['a percentage that is not a number', 'x', '1', 'whole number'],
    ['a limit that is not a number', '20', 'lots', 'whole numbers'],
  ])('refuses %s before it reaches the server', async (_what, value, perPayer, message) => {
    const user = userEvent.setup()
    form()

    await fill(user, value)
    await user.clear(screen.getByLabelText('Uses per payer'))
    await user.type(screen.getByLabelText('Uses per payer'), perPayer)
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the server’s sentences when it refuses, and does not say it was created', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'x', fields: { code: 'Another coupon already has this code' } } }),
    })
    form()

    await fill(user, '20')
    await user.click(screen.getByRole('button', { name: 'Create coupon' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Another coupon already has this code')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('switching a coupon off or on', () => {
  it('offers to disable an active coupon, and sends the opposite of what it is now', async () => {
    const user = userEvent.setup()
    render(<CouponSwitch couponId="c-1" code="SPRING-26" active />)

    await user.click(screen.getByRole('button', { name: 'Disable SPRING-26' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(lastCall()).toEqual({ url: '/api/admin/platform/coupons/c-1', method: 'POST', body: { active: false } })
  })

  it('offers to enable a disabled one', async () => {
    const user = userEvent.setup()
    render(<CouponSwitch couponId="c-1" code="SPRING-26" active={false} />)

    await user.click(screen.getByRole('button', { name: 'Enable SPRING-26' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(lastCall().body).toEqual({ active: true })
  })

  it('says so when it could not, and does not refresh', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) })
    render(<CouponSwitch couponId="c-1" code="SPRING-26" active />)

    await user.click(screen.getByRole('button', { name: 'Disable SPRING-26' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('404')
    expect(refresh).not.toHaveBeenCalled()
  })
})
