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
        // The harness runs the fake captcha driver, which challenges every registration (D-34).
        captchaToken: 'ok',
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

  /**
   * The point of N-29c: a studio serves a Hindi family and an English family in the same month,
   * so the studio's language is the *default a wedding starts from*, never a rule it is stuck
   * with. Two weddings under one Hindi studio, one of them overridden.
   */
  test('one studio can give two couples different languages', async ({ page, context }) => {
    const stamp = Date.now().toString(36)
    const email = `mixed-${stamp}@example.test`

    const registered = await page.request.post('/api/partners', {
      data: {
        businessName: `Mixed Studio ${stamp}`,
        contactName: 'A Person',
        email,
        password: 'a-long-enough-password',
        locale: 'hi',
        // The harness runs the fake captcha driver, which challenges every registration (D-34).
        captchaToken: 'ok',
      },
    })
    expect(registered.ok(), await registered.text()).toBe(true)

    await page.goto('/admin/login')
    await page.getByLabel('Email').fill(email)
    await page.getByLabel('Password').fill('a-long-enough-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()

    const make = async (slug: string, locale?: 'en' | 'hi') => {
      const response = await page.request.post('/api/admin/catalogues', {
        data: {
          coupleName: { en: 'A & B' },
          appName: { en: 'A & B Originals' },
          weddingDate: '2026-12-01',
          slug,
          template: 'films-only',
          ...(locale ? { locale } : {}),
        },
      })
      expect(response.ok(), await response.text()).toBe(true)
      const { catalogue } = (await response.json()) as { catalogue: { id: string; locale: string } }
      return catalogue
    }

    // One inherits the studio's Hindi; the other is created in English despite it.
    const inheritedSlug = `inherits-${stamp}`
    const overriddenSlug = `overrides-${stamp}`
    const inherited = await make(inheritedSlug)
    const overridden = await make(overriddenSlug, 'en')

    /**
     * A fresh studio has one credit (D-38): the inherited wedding publishes on it and is checked
     * the way a guest meets it; the overridden one is refused — the trial doing its job — and is
     * checked on the row, which is where the language was decided.
     */
    const first = await page.request.post(`/api/admin/catalogues/${inherited.id}/publish`)
    expect(first.ok(), await first.text()).toBe(true)
    const second = await page.request.post(`/api/admin/catalogues/${overridden.id}/publish`)
    expect(second.status()).toBe(402)
    expect(overridden.locale).toBe('en')
    expect(inherited.locale).toBe('hi')

    const open = async (slug: string) => {
      const fresh = await context.browser()!.newContext()
      const guest = await fresh.newPage()
      await guest.addInitScript((s) => {
        window.localStorage.setItem(`mehfilbox.profile.${s}`, 'skipped')
      }, slug)
      await guest.goto(`/?__catalogue=${slug}`)
      const lang = await guest.locator('html').getAttribute('lang')
      await fresh.close()
      return lang
    }

    expect(await open(inheritedSlug)).toBe('hi')
    void overriddenSlug
  })
})
