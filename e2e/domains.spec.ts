import { expect, test } from '@playwright/test'
import { createCatalogue, signIn } from './helpers'

/**
 * A couple's own domain (doc 16 §1), from the console's side.
 *
 * The harness runs the fake domain driver: a `.test` host is taken as correctly configured and
 * attached at once, so the whole path — the records shown, the check, live — can be walked
 * without a resolver or a host API. What a real registrar does is the unit tests' business.
 */
test.describe('their own address', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'the admin console is a desktop tool')

  test('shows the records, checks them, and prints the domain as the address once live', async ({ page }) => {
    await signIn(page)
    const catalogue = await createCatalogue(page, 'domain')
    await page.goto(`/admin/c/${catalogue.id}/settings`)

    const panel = page.getByTestId('domain-panel')
    await panel.getByLabel('Domain').fill('AanyaAndVikram.test')
    await panel.getByRole('button', { name: 'Add this domain' }).click()

    // Generated from what was typed: a root domain gets the A record and the www CNAME.
    await expect(panel.getByTestId('domain-status')).toHaveAttribute('data-status', 'pending')
    await expect(panel.getByRole('cell', { name: 'A', exact: true })).toBeVisible()
    await expect(panel.getByText('76.76.21.21')).toBeVisible()
    await expect(panel.getByText(/MX records/)).toBeVisible()

    await panel.getByRole('button', { name: 'Check DNS' }).click()
    await expect(panel.getByTestId('domain-status')).toHaveAttribute('data-status', 'active')
    await expect(panel.getByTestId('domain-live')).toContainText('https://aanyaandvikram.test')

    // The address the console prints everywhere is the domain now.
    await page.goto(`/admin/c/${catalogue.id}`)
    await expect(page.getByRole('link', { name: /aanyaandvikram\.test/ }).first()).toBeVisible()

    // And back off, so the throwaway wedding leaves nothing behind.
    await page.goto(`/admin/c/${catalogue.id}/settings`)
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByTestId('domain-panel').getByRole('button', { name: 'Remove' }).click()
    await expect(page.getByTestId('domain-panel').getByLabel('Domain')).toBeVisible()
  })
})
