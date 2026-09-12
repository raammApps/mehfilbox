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

    /**
     * A catalogue of their own (doc 16 §6, N-73): the same wizard in its couple shape — the
     * occasion first, no house styles, no "the couple's sign-in" — and a draft that costs nothing
     * until a credit is added, which the customizer says in the couple's words.
     */
    await page.getByRole('link', { name: 'Start a catalogue of your own' }).click()
    await expect(page.getByRole('heading', { name: 'A catalogue of your own' })).toBeVisible()
    await page.getByRole('radio', { name: 'Birthday' }).check({ force: true })
    await page.getByLabel('Name', { exact: true }).fill('Aarav turns one')
    await page.getByLabel('Date', { exact: true }).fill('2027-03-02')
    await page.getByLabel('Web address').fill(`e2e-aarav-${Date.now().toString(36)}`)
    await expect(page.getByText('Available')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'The couple’s sign-in' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Create and start uploading' }).click()
    await expect(page.getByText(/exists as a draft/)).toBeVisible()

    await page.getByRole('button', { name: 'Title the films' }).click()
    await page.getByRole('button', { name: 'Finish and customise' }).click()
    await page.getByRole('button', { name: /^Publish/ }).click()
    await expect(page.getByTestId('credit-required')).toContainText('your studio can add for you')

    // And it is theirs, in their account.
    await page.goto('/my')
    await expect(page.getByRole('list', { name: 'Your catalogues' })).toContainText('Aarav turns one')
    await expect(page.getByRole('list', { name: 'Your catalogues' })).toContainText('Birthday')
  })
})
