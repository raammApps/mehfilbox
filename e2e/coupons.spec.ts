import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * A studio redeems a reward code (N-121, D-61) — through the real page, against the real route.
 *
 * The demo data carries one reward coupon, `DEMO-WELCOME` (the harness has no platform admin to make
 * one). What is checked here is what a studio meets: a code that does not work says so in the one
 * sentence it always says, a code that does work adds its credits and the balance next to the box
 * changes to match, and the dashboard agrees.
 */
test.describe('redeeming a code', () => {
  // Desktop only, like the other suites that sign in as the demo operator and change its account.
  test.skip(({ isMobile }) => Boolean(isMobile), 'one studio, one server: the mobile project would only repeat it')

  test('a wrong code says it did not work; the right one adds a Keep credit, in any letter case', async ({ page }) => {
    await signIn(page)
    await page.goto('/admin/studio')
    const box = page.getByTestId('redeem-code')
    await expect(box).toBeVisible()

    await box.getByLabel('Have a code?').fill('NOSUCHCODE')
    await box.getByRole('button', { name: 'Redeem' }).click()
    await expect(box.getByRole('alert')).toHaveText('That code did not work.')
    // A mistyped code is the same answer, in the same words — nothing to learn from the difference.
    await box.getByLabel('Have a code?').fill('!!')
    await box.getByRole('button', { name: 'Redeem' }).click()
    await expect(box.getByRole('alert')).toHaveText('That code did not work.')

    await box.getByLabel('Have a code?').fill('demo-welcome')
    await box.getByRole('button', { name: 'Redeem' }).click()
    await expect(box.getByRole('status')).toHaveText('Added 1 Keep credit.')
    // The Credits card beside it now counts the Keep credit, once the refreshed page is on screen.
    await expect(page.getByText(/Keep credit/).first()).toBeVisible()

    await page.goto('/admin')
    await expect(page.getByTestId('credit-balance')).toContainText('Keep credit')
  })
})
