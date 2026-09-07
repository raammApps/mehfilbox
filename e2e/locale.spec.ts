import { expect, test } from '@playwright/test'

/**
 * N-29 — a studio's language reaches the couple without anybody touching the toggle.
 *
 * The unit tests cover the schema and the fallback rule. This covers the only thing that actually
 * matters: a Hindi studio registers, creates a wedding, and a guest who has never expressed a
 * preference opens it in Hindi. Everything in between — org → catalogue → cookie fallback → the
 * rendered page — has to hold for this to pass, and no smaller test spans it.
 */
test.describe('N-29 — the studio’s language reaches the guest', () => {
  test.skip(({ isMobile }) => Boolean(isMobile), 'registration is a desktop flow')

  test('a Hindi studio’s wedding opens in Hindi, with no cookie set', async ({
    page,
    context,
  }) => {
    const stamp = Date.now().toString(36)

    // Registering through the API rather than the form: the form is covered elsewhere, and what
    // is under test is the value's journey, not the markup that collects it.
    const registered = await page.request.post('/api/partners', {
      data: {
        businessName: `Jaipur Films ${stamp}`,
        contactName: 'A Person',
        email: `hindi-${stamp}@example.test`,
        password: 'a-long-enough-password',
        locale: 'hi',
      },
    })
    expect(registered.ok(), await registered.text()).toBe(true)

    await page.goto('/admin/login')
    await page.getByLabel('Email').fill(`hindi-${stamp}@example.test`)
    await page.getByLabel('Password').fill('a-long-enough-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()

    const slug = `hindi-wedding-${stamp}`
    const created = await page.request.post('/api/admin/catalogues', {
      data: {
        coupleName: { en: 'Aarav & Diya' },
        appName: { en: 'Aarav & Diya Originals' },
        weddingDate: '2026-12-01',
        slug,
        template: 'films-only',
      },
    })
    expect(created.ok(), await created.text()).toBe(true)
    const { catalogue } = (await created.json()) as { catalogue: { id: string } }

    await page.request.post(`/api/admin/catalogues/${catalogue.id}/publish`)

    /**
     * A brand-new browser context, so there is genuinely no `mehfilbox_locale` cookie — reusing
     * this one would leave whatever the console set and prove nothing about the fallback.
     */
    const fresh = await context.browser()!.newContext()
    const guest = await fresh.newPage()
    await guest.addInitScript((s) => {
      window.localStorage.setItem(`mehfilbox.profile.${s}`, 'skipped')
    }, slug)
    await guest.goto(`/?__catalogue=${slug}`)

    await expect(guest.locator('html')).toHaveAttribute('lang', 'hi')
    await fresh.close()
  })
})
