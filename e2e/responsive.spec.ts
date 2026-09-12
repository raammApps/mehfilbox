import { expect, test, type Page } from '@playwright/test'
import { signIn } from './helpers'

/**
 * Every console surface works from 360px up (doc 16 §12, N-70).
 *
 * The guest surface has been mobile-first since Phase 0; the consoles were built at a desk and
 * audited here: each page is opened at 360×800, must not scroll sideways — a page that does has a
 * control off the edge — and must show its heading. Tables scroll inside their own region, which
 * this allows; the page itself may not.
 */
test.describe('the consoles at 360px', () => {
  test.skip(({ isMobile }) => !isMobile, 'the mobile project is the one that matters here')

  async function overflow(page: Page): Promise<number> {
    return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  }

  test('nothing scrolls sideways', async ({ page }) => {
    await signIn(page)
    const { catalogues } = (await (await page.request.get('/api/admin/catalogues')).json()) as {
      catalogues: { id: string }[]
    }
    const id = catalogues[0]!.id

    const pages: { path: string; heading: RegExp }[] = [
      { path: '/admin', heading: /Catalogues/ },
      { path: '/admin/new', heading: /New catalogue/ },
      { path: `/admin/c/${id}`, heading: /Aanya & Vikram/ },
      { path: `/admin/c/${id}/customizer`, heading: /Aanya & Vikram/ },
      { path: `/admin/c/${id}/settings`, heading: /Settings/ },
      { path: `/admin/c/${id}/titles`, heading: /Aanya & Vikram/ },
      { path: `/admin/c/${id}/photos`, heading: /Aanya & Vikram/ },
      { path: '/admin/studio', heading: /Your studio/ },
      { path: '/admin/studio/styles', heading: /House styles/ },
      { path: '/admin/studio/styles/new', heading: /New house style/ },
    ]

    for (const { path, heading } of pages) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
      // Client components mount after the first paint; give layout a beat before measuring.
      await page.waitForTimeout(250)
      expect(await overflow(page), `${path} scrolls sideways`).toBeLessThanOrEqual(1)
    }
  })

  test('the customizer puts the preview first on a phone', async ({ page }) => {
    await signIn(page)
    const { catalogues } = (await (await page.request.get('/api/admin/catalogues')).json()) as {
      catalogues: { id: string }[]
    }
    await page.goto(`/admin/c/${catalogues[0]!.id}/customizer`)
    await expect(page.getByTestId('preview-viewport')).toBeVisible()
    // The rail is labelled "Sections" too, and it is hidden on a phone; the customizer's own
    // panes are the two `section` elements inside `main`.
    const order = await page.evaluate(() => {
      const preview = document.querySelector('main section[aria-label="Preview"]')
      const sections = document.querySelector('main section[aria-label="Sections"]')
      return preview && sections ? preview.getBoundingClientRect().top - sections.getBoundingClientRect().top : Number.NaN
    })
    expect(order).toBeLessThan(0)
  })
})
