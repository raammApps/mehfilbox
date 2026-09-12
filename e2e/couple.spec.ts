import { expect, test } from '@playwright/test'
import { createCatalogue, signIn } from './helpers'

/**
 * The couple's account, end to end (D-37): the studio issues a sign-in with a temporary
 * password, the couple signs in through their own door, replaces the password, and finds the
 * wedding in their account — first as "being prepared", then, after the handover, as theirs.
 */
test.describe('the couple’s account', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'driven from the studio console, a desktop tool')

  test('from a temporary password to a wedding of their own', async ({ page }) => {
    // Playwright dismisses confirm() by default; the handover asks for one.
    page.on('dialog', (dialog) => void dialog.accept())

    await signIn(page)
    const created = await createCatalogue(page, 'couple')
    const email = `couple-${Date.now().toString(36)}@example.test`

    // The studio, with the couple in the room.
    await page.goto(`/admin/c/${created.id}`)
    await page.getByLabel('Their email').fill(email)
    await page.getByLabel('Their name').fill('Aanya & Vikram')
    await page.getByLabel(/show me a temporary one/i).check()
    await page.getByRole('button', { name: 'Create their sign-in' }).click()
    const temporary = (await page.getByTestId('temporary-password').textContent())!.trim()
    expect(temporary).toMatch(/^[a-z]+-[a-z]+-\d{4}$/)

    // The couple, through their own door.
    await page.getByRole('button', { name: /^Account/ }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)

    await page.goto('/login?door=couple')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill(temporary)
    await page.getByRole('button', { name: 'Sign in' }).click()

    // A temporary password is replaced before anything else.
    await expect(page.getByRole('heading', { name: 'Choose your own password' })).toBeVisible()
    await page.getByLabel('New password').fill('a-password-of-their-own')
    await page.getByLabel('Type it again').fill('a-password-of-their-own')
    await page.getByRole('button', { name: 'Save new password' }).click()

    // Home: the wedding, being prepared.
    await expect(page.getByRole('heading', { name: 'Your weddings' })).toBeVisible()
    const card = page.getByRole('list', { name: 'Your catalogues' }).getByRole('listitem').first()
    await expect(card).toContainText('Being prepared by')
    await card.getByRole('link', { name: 'Manage' }).click()
    await expect(page.getByText(/is still preparing this/)).toBeVisible()
    // A linked couple decides the code; the letter waits for the handover.
    await expect(page.getByRole('heading', { name: 'Guest code' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Your message' })).toHaveCount(0)

    // The studio hands over — no link, no wait.
    await page.getByRole('button', { name: /^Account/ }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await signIn(page)
    await page.goto(`/admin/c/${created.id}`)
    await expect(page.getByText(`Their account is ${email}`)).toBeVisible()
    await page.getByRole('button', { name: 'Hand over now' }).click()

    // Delivered, from the studio's side: the handover lands on the list, where the wedding has
    // moved from the board to the Delivered section.
    await expect(page).toHaveURL(/\/admin$/)
    const delivered = page.getByRole('region', { name: 'Delivered' })
    await expect(delivered).toContainText('E2E & Fixture')
    await expect(delivered).toContainText('Access closed')

    // Theirs, from the couple's side.
    await page.getByRole('button', { name: /^Account/ }).click()
    await page.getByRole('menuitem', { name: 'Sign out' }).click()
    await page.goto('/login?door=couple')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('a-password-of-their-own')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Your weddings' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Your catalogues' })).toContainText('Filmed by')
  })
})
