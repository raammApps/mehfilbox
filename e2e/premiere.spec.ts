import { expect, test } from '@playwright/test'
import { createCatalogue, openAsReturningGuest, signIn } from './helpers'

/**
 * The premiere (N-72): a published wedding before its moment shows a countdown, not the films,
 * and the same link opens straight into the wedding once the moment has passed.
 */
test.describe('the premiere countdown', () => {
  test('counts down until the premiere, then the films', async ({ page, context }) => {
    await signIn(page)
    const catalogue = await createCatalogue(page, 'premiere')

    // Tomorrow, seven in the evening in Kolkata — set the way the settings drawer sets it.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const premiereAt = `${tomorrow}T13:30:00.000Z`
    const set = await page.request.patch(`/api/admin/catalogues/${catalogue.id}`, {
      data: { timezone: 'Asia/Kolkata', premiereAt },
    })
    expect(set.ok(), await set.text()).toBe(true)
    const published = await page.request.post(`/api/admin/catalogues/${catalogue.id}/publish`)
    expect(published.ok(), await published.text()).toBe(true)

    const guest = await context.newPage()
    await openAsReturningGuest(guest, catalogue.slug)
    await expect(guest.getByRole('heading', { name: /The films go live on/ })).toBeVisible()
    await expect(guest.getByTestId('countdown')).toBeVisible()
    // Their evening, said in their zone.
    await expect(guest.getByRole('heading', { name: /7:00 pm/i })).toBeVisible()

    // The moment passes: the same link is the wedding.
    const cleared = await page.request.patch(`/api/admin/catalogues/${catalogue.id}`, {
      data: { premiereAt: null },
    })
    expect(cleared.ok()).toBe(true)
    await guest.reload()
    await expect(guest.getByTestId('countdown')).toHaveCount(0)
    await expect(guest.getByRole('heading', { name: /The films go live on/ })).toHaveCount(0)
    await guest.close()
  })
})
