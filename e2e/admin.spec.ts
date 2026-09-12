import { expect, test } from '@playwright/test'
import { createCatalogue, signIn } from './helpers'

/**
 * The console's own surfaces: the list a partner works from, the create flow, and the handover.
 *
 * `operator.spec.ts` covers the customizer. This covers everything around it — the parts that
 * were rebuilt, and the parts that had no coverage at all, which is how the customizer once got
 * replaced wholesale with a green suite.
 */
test.describe('the admin console', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'the admin console is a desktop tool')

  test.beforeEach(async ({ page }) => {
    await signIn(page)
  })

  /**
   * All three noticed on the deployed console rather than in review: the create action appeared
   * twice, there was no way to sign out at all, and identity sat as grey text at the foot of the
   * rail instead of the corner every web application puts it in.
   */
  test('offers exactly one way to create a catalogue, on every page', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'New catalogue' })).toHaveCount(1)

    // And it is still there once the operator is deep inside a wedding, which is where they
    // actually finish one job and start the next.
    const created = await createCatalogue(page, 'onecta')
    await page.goto(`/admin/c/${created.id}/titles`)
    await expect(page.getByRole('link', { name: 'New catalogue' })).toHaveCount(1)
  })

  test('signs the operator out from the account menu', async ({ page }) => {
    await page.getByRole('button', { name: /^Account/ }).click()

    const menu = page.getByRole('menu')
    await expect(menu).toContainText('operator@mehfilbox.test')

    await menu.getByRole('menuitem', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/login/)

    // And the session is genuinely gone, not just navigated away from.
    await page.goto('/admin')
    await expect(page).toHaveURL(/\/login/)
  })

  test('closes the account menu on Escape rather than trapping it open', async ({ page }) => {
    await page.getByRole('button', { name: /^Account/ }).click()
    await expect(page.getByRole('menu')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
  })

  /**
   * N-16 — the platform surface is invisible to an ordinary operator.
   *
   * 404 rather than a refusal, on the same reasoning that makes another org's catalogue a 404:
   * an operator poking at the URL should not learn that the surface exists. This is the only
   * assertion about it that matters, so it is the one in the suite.
   */
  test('an operator cannot reach the platform surface', async ({ page }) => {
    const responses = [
      await page.goto('/admin/platform'),
      await page.goto('/admin/platform/orgs/11111111-1111-4111-8111-111111111111'),
    ]

    for (const response of responses) {
      expect(response?.status()).toBe(404)
    }
    await expect(page.getByText(/every org/i)).toHaveCount(0)
  })

  test('the list can be searched and filtered down to one wedding', async ({ page }) => {
    const created = await createCatalogue(page, 'search')
    await page.goto('/admin')

    // Scoped to the grid: the rail's own nav is a list too, and every test in this file
    // creates a catalogue with the same couple name, so the slug is the only unique handle.
    const cards = page.getByRole('list', { name: 'Catalogues' }).getByRole('listitem')
    await expect(cards.filter({ hasText: 'Aanya & Vikram' })).toBeVisible()
    await expect(cards.filter({ hasText: created.slug })).toBeVisible()

    await page.getByLabel('Search catalogues').fill(created.slug)
    await expect(cards).toHaveCount(1)
    await expect(cards.first()).toContainText('E2E & Fixture')

    // A filter that matches nothing must offer a way back out of itself.
    await page.getByLabel('Search catalogues').fill('no-such-wedding')
    await expect(cards).toHaveCount(0)
    await page.getByRole('button', { name: /clear the filters/i }).click()
    await expect(cards.filter({ hasText: 'Aanya & Vikram' })).toBeVisible()
  })

  /**
   * The checklist is the only place that distinguishes "a catalogue exists" from "a guest can
   * watch something", and those looked identical everywhere else in the console.
   */
  test('a fresh catalogue is honest about not being ready', async ({ page }) => {
    const created = await createCatalogue(page, 'checklist')
    await page.goto(`/admin/c/${created.id}`)

    const checklist = page.getByRole('complementary', { name: 'Setup' })
    await expect(checklist).toContainText('Films uploaded')
    await expect(checklist).toContainText('Published')
    // The detail line only appears while an item is outstanding, so its presence is the
    // assertion that the item is genuinely unticked — not a percentage that moves whenever the
    // creation route picks a default.
    await expect(checklist).toContainText('Drop the films in')
    await expect(checklist).toContainText('the link resolves but shows guests')

    await expect(page.getByText('No films yet')).toBeVisible()
  })

  test('the wizard shows the address it is about to create', async ({ page }) => {
    await page.getByRole('link', { name: 'New catalogue' }).first().click()

    await page.getByLabel('Couple').fill('Nikita & Rohan')
    // The slug is suggested from the names until the operator edits it themselves.
    await expect(page.getByLabel('Web address')).toHaveValue('nikita-and-rohan')
    await expect(page.getByText('Available')).toBeVisible()

    // The wizard never showed the resulting address, which is the one thing about a catalogue an
    // operator cannot casually change later.
    await expect(page.getByText(/nikita-and-rohan/).first()).toBeVisible()
  })

  /**
   * N-32. Found by clicking through production, not here — and the reason it was never found
   * here is that `createCatalogue` posts to the API directly. Every existing test skips the
   * wizard, so the one line missing from the wizard could not show up.
   *
   * The failure is worse than it sounds: the operator finishes their first catalogue, clicks the
   * only navigation link in the rail, and is told "No weddings here yet". The row is in the
   * database the whole time — the router is serving the `/admin` render it cached *before* the
   * catalogue existed. It reads exactly like the work was thrown away.
   */
  test('a catalogue made in the wizard is in the list without a reload', async ({ page }) => {
    // Visiting the list first is what plants the stale entry in the router cache. Without this
    // the test passes whether or not the bug is fixed, because there is nothing cached to serve.
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()

    const couple = `Wizard & Cache ${Date.now().toString(36)}`
    const slug = `e2e-wizard-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

    await page.getByRole('link', { name: 'New catalogue' }).first().click()
    await page.getByLabel('Couple').fill(couple)
    await page.getByLabel('Wedding date').fill('2026-12-01')
    await page.getByLabel('Web address').fill(slug)
    await expect(page.getByText('Available')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('button', { name: 'Create and start uploading' }).click()
    await expect(page.getByText(new RegExp(slug))).toBeVisible()

    // A client navigation, exactly as the rail does it — no reload, which is the whole point.
    await page.getByRole('link', { name: 'Catalogues' }).first().click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()

    await expect(page.getByText(couple)).toBeVisible()
  })

  /**
   * D-36 — a house style is the studio's answer to the wizard's second step, made once.
   *
   * The style is made through the API here; in practice most studios will make their first from
   * a delivered wedding's overview. What the wizard has to do is offer it, and what the route has
   * to do is copy it — layout, theme, code — onto the row and hand the code over exactly once.
   */
  test('a wedding made from a house style starts in it, code and all', async ({ page }) => {
    const style = await page.evaluate(async () => {
      const response = await fetch('/api/admin/presets', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'E2E Carnival',
          templateId: 'films-only',
          branding: { theme: 'carnival' },
          locale: 'en',
          passcodeOn: true,
        }),
      })
      if (!response.ok) throw new Error(`style failed: ${response.status}`)
      return (await response.json()) as { preset: { id: string } }
    })

    const slug = `e2e-style-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
    await page.getByRole('link', { name: 'New catalogue' }).first().click()
    await page.getByLabel('Couple').fill('Style & Wizard')
    await page.getByLabel('Wedding date').fill('2026-12-01')
    await page.getByLabel('Web address').fill(slug)
    await expect(page.getByText('Available')).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()

    await page.getByRole('radio', { name: /^E2E Carnival/ }).check({ force: true })
    // Picking a style hides the theme and layout cards: the style has answered them.
    await expect(page.getByRole('radio', { name: /^The Keepsake/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'Create and start uploading' }).click()

    // The code, shown once, with the couple present.
    await expect(page.getByRole('status').filter({ hasText: 'Guest code' })).toContainText(/\d{6}/)

    const created = await page.evaluate(async (wanted) => {
      const response = await fetch('/api/admin/catalogues')
      const { catalogues } = (await response.json()) as {
        catalogues: { slug: string; template: string; privacy: string; presetId: string | null; branding: { theme?: string } }[]
      }
      return catalogues.find((c) => c.slug === wanted) ?? null
    }, slug)
    expect(created).toMatchObject({
      template: 'films-only',
      privacy: 'passcode',
      presetId: style.preset.id,
      branding: { theme: 'carnival' },
    })

    // The wedding is a draft, so the style is not frozen and can go — leaving the wizard as the
    // other specs expect to find it.
    await page.evaluate(async (id) => {
      await fetch(`/api/admin/presets/${id}`, { method: 'DELETE' })
    }, style.preset.id)
  })

  test('a taken address is refused before anything is created', async ({ page }) => {
    await page.getByRole('link', { name: 'New catalogue' }).first().click()

    await page.getByLabel('Couple').fill('Someone Else')
    await page.getByLabel('Web address').fill('aanya-vikram')

    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()
  })

  /**
   * N-32. Refusing was never the complaint — refusing with no way out was.
   *
   * The address may belong to a studio this operator is not allowed to see, so "taken" is the
   * whole truth we can tell them about it. What we can always do is hand them a free one, which
   * is what turns a dead end into a click.
   */
  test('a taken address offers a free one, and taking it unblocks the wizard', async ({ page }) => {
    await page.getByRole('link', { name: 'New catalogue' }).first().click()

    await page.getByLabel('Couple').fill('Someone Else')
    await page.getByLabel('Wedding date').fill('2026-12-01')
    await page.getByLabel('Web address').fill('aanya-vikram')

    const offer = page.getByRole('button', { name: /^Use aanya-vikram-/ })
    await expect(offer).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await offer.click()

    await expect(page.getByLabel('Web address')).toHaveValue(/^aanya-vikram-[a-z0-9]{3}$/)
    await expect(page.getByText('Available')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled()
  })

  /**
   * The year is the part that makes one global namespace survive contact with Indian couple
   * names, so it is asserted where an operator actually meets it rather than only in the unit
   * test for `suggestSlug`.
   */
  test('the suggested address carries the wedding year', async ({ page }) => {
    await page.getByRole('link', { name: 'New catalogue' }).first().click()

    await page.getByLabel('Couple').fill('Meera & Kabir')
    await expect(page.getByLabel('Web address')).toHaveValue('meera-and-kabir')

    // The year appears when the date does, and follows it if the operator corrects it.
    await page.getByLabel('Wedding date').fill('2027-02-14')
    await expect(page.getByLabel('Web address')).toHaveValue('meera-and-kabir-2027')
  })

  /**
   * N-18. The transfer API and the claim page were verified on production months before a
   * partner had any way to reach them.
   */
  test('a partner can issue a handover link, and is refused a second one', async ({ page }) => {
    const created = await createCatalogue(page, 'handover')
    await page.goto(`/admin/c/${created.id}`)

    await page.getByLabel(/couple.s email/i).fill('couple@example.com')
    await page.getByRole('button', { name: 'Create handover link' }).click()

    // Shown once, because only its hash is stored — so the link must actually be on screen.
    const link = page.getByText(/\/claim\//)
    await expect(link).toBeVisible()
    await expect(page.getByText(/shown once/i)).toBeVisible()

    // And the outstanding handover is now named, so a partner who forgets does not re-issue
    // into a refusal they cannot explain.
    await expect(page.getByText('couple@example.com')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel it' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create handover link' })).toHaveCount(0)
  })

  test('the claim link a partner sends actually opens', async ({ page, browser }) => {
    const created = await createCatalogue(page, 'claimlink')
    await page.goto(`/admin/c/${created.id}`)

    await page.getByLabel(/couple.s email/i).fill('opens@example.com')
    await page.getByRole('button', { name: 'Create handover link' }).click()

    const claimUrl = await page.getByText(/\/claim\//).textContent()
    expect(claimUrl).toBeTruthy()

    // As the couple: a different browser context, with no operator session at all.
    const anonymous = await browser.newContext()
    const couple = await anonymous.newPage()
    await couple.goto(claimUrl!.trim())

    // They are shown what they are being given, and by whom, before being asked for anything —
    // this arrives forwarded over WhatsApp with no sender they can check.
    await expect(couple.getByRole('heading', { name: 'E2E & Fixture' })).toBeVisible()
    await expect(couple.getByLabel('Your account')).toHaveValue('opens@example.com')
    await expect(couple.getByRole('button', { name: 'Take ownership' })).toBeVisible()
    await anonymous.close()
  })

})
