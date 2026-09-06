import { expect, type Page } from '@playwright/test'

/**
 * Shared E2E helpers.
 *
 * The important one is `createCatalogue`. The demo catalogue is a fixture the guest suites read
 * and the operator suite publishes; any test that *writes content* has to work somewhere else,
 * or it competes with the others for the 15-title cap and leaves the demo in a state the next
 * run did not expect. Server state is shared across the whole Playwright run — one process, one
 * in-memory store — so isolation has to be arranged, not assumed.
 */

export const DEMO_CATALOGUE = 'aanya-vikram'

export async function signIn(page: Page): Promise<void> {
  await page.goto('/admin/login')
  await page.getByLabel('Email').fill('operator@mehfilbox.test')
  await page.getByLabel('Password').fill('e2e-operator-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Catalogues' })).toBeVisible()
}

export type CreatedCatalogue = { id: string; slug: string }

/** A throwaway catalogue for a test that writes content. Requires an operator session. */
export async function createCatalogue(page: Page, label: string): Promise<CreatedCatalogue> {
  const slug = `e2e-${label}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  const created = await page.evaluate(async (catalogueSlug) => {
    const response = await fetch('/api/admin/catalogues', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        coupleName: { en: 'E2E & Fixture' },
        appName: { en: 'E2E Originals' },
        weddingDate: '2026-12-01',
        slug: catalogueSlug,
        template: 'films-only',
      }),
    })
    if (!response.ok) throw new Error(`create failed: ${response.status} ${await response.text()}`)
    return (await response.json()) as { catalogue: { id: string; slug: string } }
  }, slug)

  return { id: created.catalogue.id, slug: created.catalogue.slug }
}

export async function openFilms(page: Page, catalogueId: string): Promise<void> {
  await page.goto(`/admin/c/${catalogueId}/titles`)
  await expect(page.getByText('Drop films here')).toBeVisible()
}

/**
 * The admin row for a title.
 *
 * The name lives in an `<input value>`, not a text node, so `filter({ hasText })` finds
 * nothing — the row has to be found by the control it contains.
 */
export function titleRow(page: Page, name: string) {
  return page.locator('li').filter({ has: page.locator(`input[value="${name}"]`) })
}

/** A returning guest: the profile choice is already made, so the gate never races an assertion. */
export async function openAsReturningGuest(
  page: Page,
  slug: string = DEMO_CATALOGUE,
  query = '',
): Promise<void> {
  await page.addInitScript((catalogueSlug) => {
    window.localStorage.setItem(`mehfilbox.profile.${catalogueSlug}`, 'skipped')
  }, slug)
  await page.goto(`/?__catalogue=${slug}${query}`)
  await expect(page.getByTestId('profile-gate')).toHaveCount(0)
}
