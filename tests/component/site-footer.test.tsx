import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SiteFooter } from '@/components/chrome/SiteFooter'
import { createTranslator } from '@/lib/i18n'
import { showsPlatformCredit } from '@/lib/schema'

/**
 * The one line the product may put in front of a guest with its own name on it (D-41).
 *
 * On unless a studio turned it off — and "off" has to mean *gone*, not greyed, because the whole
 * point of the setting is a client who must not see a supplier.
 */
describe('the footer credit', () => {
  const t = createTranslator('en')

  it('says "Made with Mehfilbox" and links home by default', () => {
    render(<SiteFooter presentedBy="Kalyanam" t={t} platformHref="https://mehfilbox.com/?ref=kalyanam" />)
    const credit = screen.getByTestId('platform-credit')
    expect(credit).toHaveTextContent('Made with Mehfilbox')
    expect(credit).toHaveAttribute('href', 'https://mehfilbox.com/?ref=kalyanam')
  })

  it('is absent entirely when the studio switched it off', () => {
    render(
      <SiteFooter
        presentedBy="Kalyanam"
        t={t}
        platformCredit={false}
        platformHref="https://mehfilbox.com/?ref=kalyanam"
      />,
    )
    expect(screen.queryByTestId('platform-credit')).toBeNull()
    expect(screen.queryByText(/Mehfilbox/)).toBeNull()
  })

  it('is absent when there is nowhere for it to point', () => {
    render(<SiteFooter presentedBy={null} t={t} />)
    expect(screen.queryByTestId('platform-credit')).toBeNull()
  })

  it('reads a row written before the field existed as on', () => {
    expect(showsPlatformCredit({})).toBe(true)
    expect(showsPlatformCredit({ platformCredit: false })).toBe(false)
    expect(showsPlatformCredit({ platformCredit: true })).toBe(true)
  })

  it('has a Hindi line, because the footer is the last thing a Hindi guest reads', () => {
    render(
      <SiteFooter presentedBy={null} t={createTranslator('hi')} platformHref="https://mehfilbox.com/" />,
    )
    expect(screen.getByTestId('platform-credit')).toHaveTextContent('Mehfilbox')
    expect(screen.getByTestId('platform-credit')).not.toHaveTextContent('Made with')
  })
})
