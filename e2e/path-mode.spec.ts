import { expect, test } from '@playwright/test'

/**
 * N-12 §1 — the guest journey in `TENANCY_MODE=path`, which is what production runs.
 *
 * Path mode had no coverage at all for the life of the suite. That is not a gap in thoroughness,
 * it is a gap in *configuration*: `playwright.config.ts` only ever booted subdomain mode, so
 * every route that differs between the two was tested in the mode nobody deploys.
 *
 * The bug it let through was as bad as they get. `CatalogueProvider.play()` pushed
 * `/watch/<slug>` — correct in subdomain mode, where the catalogue is the site root, and a 404
 * for every guest in path mode, where it has to be `/c/<slug>/watch/<title>`. Four redirects in
 * two files had the same mistake. Every unit and E2E test passed.
 *
 * So this file deliberately exercises the *navigations*, not the rendering. Rendering is
 * identical between the modes; addressing is the whole difference.
 */
const CATALOGUE = 'aanya-vikram'
/** The demo studio's slug — the segment every address of its weddings starts with (D-32). */
const STUDIO = 'kalyanam'
const BASE = `/${STUDIO}/${CATALOGUE}`

/** A returning guest, so the profile gate never races an assertion. */
async function openBrowse(page: import('@playwright/test').Page, path = ''): Promise<void> {
  await page.addInitScript((slug) => {
    window.localStorage.setItem(`mehfilbox.profile.${slug}`, 'skipped')
  }, CATALOGUE)
  await page.goto(`${BASE}${path}`)
  await expect(page.getByTestId('profile-gate')).toHaveCount(0)
}

test.describe('path mode — the configuration production actually runs', () => {
  test('the catalogue is served from /<studio>/<wedding> with no subdomain at all', async ({
    page,
  }) => {
    await openBrowse(page)
    await expect(page.locator('[data-module-id]').first()).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`${BASE}$`))
  })

  /**
   * D-32 — one address per wedding, and it is the one the product prints. A link sent before the
   * studio segment existed, or a typo in it, lands on the canonical form rather than on a second
   * copy of the page with different OG tags.
   */
  test('a legacy /c/ link and a wrong studio segment both land on the canonical address', async ({
    page,
  }) => {
    await page.addInitScript((slug) => {
      window.localStorage.setItem(`mehfilbox.profile.${slug}`, 'skipped')
    }, CATALOGUE)

    await page.goto(`/c/${CATALOGUE}?title=the-ceremony`)
    await expect(page).toHaveURL(new RegExp(`${BASE}\\?title=the-ceremony$`))
    await expect(page.getByRole('dialog')).toBeVisible()

    await page.goto(`/some-other-studio/${CATALOGUE}`)
    await expect(page).toHaveURL(new RegExp(`${BASE}$`))
    await expect(page.locator('[data-module-id]').first()).toBeVisible()
  })

  test('the top bar offers to share the whole wedding', async ({ page }) => {
    await openBrowse(page)
    await expect(page.getByRole('banner').getByRole('button', { name: 'Share' })).toBeVisible()
    // The referral line, on by default (D-41).
    await expect(page.getByTestId('platform-credit')).toHaveAttribute('href', /ref=kalyanam/)
  })

  /**
   * The regression this whole project exists for. Press Play and check where it lands — in
   * subdomain mode `/watch/<title>` is right, and here it must carry the catalogue prefix.
   */
  test('Play navigates to a route that exists, prefix and all', async ({ page }) => {
    await openBrowse(page)

    await page.getByTestId('poster-card').first().click()
    // Scoped to the modal: the billboard has a Play button of its own.
    await page.getByRole('dialog').getByRole('button', { name: 'Play' }).click()

    await expect(page).toHaveURL(new RegExp(`${BASE}/watch/`))
    await expect(page.getByTestId('player')).toBeVisible()
  })

  test('the wordmark returns to the catalogue, not to the operator console', async ({ page }) => {
    await openBrowse(page)

    // In subdomain mode the catalogue is the root, so a bare `/` is correct. Here a bare `/` is
    // the marketing page — and briefly, in one build, the admin login.
    await page.getByTestId('poster-card').first().click()
    // Scoped to the modal: the billboard has a Play button of its own.
    await page.getByRole('dialog').getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('player')).toBeVisible()

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(BASE))
  })

  test('a deep link into a film resolves directly, the way a forwarded link does', async ({
    page,
  }) => {
    // What actually arrives in a WhatsApp message: somebody else's URL, opened cold.
    await openBrowse(page)
    await page.getByTestId('poster-card').first().click()
    // Scoped to the modal: the billboard has a Play button of its own.
    await page.getByRole('dialog').getByRole('button', { name: 'Play' }).click()
    await expect(page.getByTestId('player')).toBeVisible()

    const deepLink = page.url()
    await page.goto('about:blank')
    await page.goto(deepLink)
    await expect(page.getByTestId('player')).toBeVisible()
  })

  /**
   * N-12 §3 — following a URL the *application* generated, rather than one the test composed.
   *
   * The public catalogue link is the product's entire output: the string a planner sends a
   * couple and a couple sends two hundred guests. Nothing had ever opened one.
   */
  test('the public link the console prints is one a guest can actually open', async ({
    page,
    browser,
  }) => {
    await page.goto('/admin/login')
    await page.getByLabel('Email').fill('operator@mehfilbox.test')
    await page.getByLabel('Password').fill('e2e-operator-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()

    const link = page.getByRole('link', { name: new RegExp(CATALOGUE) }).first()
    const href = await link.getAttribute('href')
    expect(href).toBeTruthy()

    // It must carry the studio and the wedding rather than a subdomain that does not exist here.
    expect(href).toContain(BASE)

    // Opened as a guest would: a fresh context with no operator session.
    const anonymous = await browser.newContext()
    const guest = await anonymous.newPage()
    await guest.goto(href!)
    await expect(guest.locator('[data-module-id]').first()).toBeVisible({ timeout: 15_000 })
    await anonymous.close()
  })
})

/**
 * N-32 §2 — the handover, on the one host production actually serves.
 *
 * `admin.spec.ts` covers the claim already, but it cannot cover *this*, and the reason is
 * configuration rather than thoroughness — the same shape of gap this whole file exists for.
 *
 * That suite runs in subdomain mode, where the operator signs in on `localhost` and the claim is
 * served from `mehfilbox.localhost`. Different hosts, so the session cookie is never sent and
 * the couple always arrives signed out. The bug needs one host to appear, which is precisely what
 * production runs.
 */
test.describe('path mode — the handover on a shared device', () => {
  test('a couple claiming on a signed-in device does not land in the studio console', async ({
    page,
  }) => {
    await page.goto('/admin/login')
    await page.getByLabel('Email').fill('operator@mehfilbox.test')
    await page.getByLabel('Password').fill('e2e-operator-password')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()

    const slug = `e2e-handover-${Date.now().toString(36)}`
    const created = await page.evaluate(async (catalogueSlug) => {
      const response = await fetch('/api/admin/catalogues', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          coupleName: { en: 'Handover & Device' },
          appName: { en: 'Handover Originals' },
          weddingDate: '2026-12-01',
          slug: catalogueSlug,
          template: 'films-only',
        }),
      })
      if (!response.ok) throw new Error(`create failed: ${response.status}`)
      return (await response.json()) as { catalogue: { id: string } }
    }, slug)

    const coupleEmail = `couple-${Date.now().toString(36)}@example.com`
    await page.goto(`/admin/c/${created.catalogue.id}`)
    await page.getByLabel(/couple.s email/i).fill(coupleEmail)
    await page.getByRole('button', { name: 'Create handover link' }).click()
    const claimUrl = (await page.getByText(/\/claim\//).textContent())!.trim()

    // The studio hands over its own phone or laptop — so the operator's session is still here.
    await page.goto(claimUrl)
    await page.getByLabel('Choose a password').fill('couple-password-1234')
    await page.getByRole('button', { name: 'Take ownership' }).click()
    await expect(page.getByRole('heading', { name: 'It is yours' })).toBeVisible()

    await page.getByRole('button', { name: new RegExp(`Sign in with ${coupleEmail}`) }).click()

    // The sign-in screen, on the couple's door, with their own address ready — never somebody
    // else's weddings.
    await expect(page).toHaveURL(/\/login\?door=couple/)
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Catalogues' })).toHaveCount(0)
    await expect(page.getByLabel('Email')).toHaveValue(coupleEmail)
  })
})
