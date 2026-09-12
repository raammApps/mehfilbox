import type { Metadata } from 'next'
import Link from 'next/link'
import { env } from '@/lib/env'

/**
 * The root domain: the page that sells Mehfilbox to a studio (N-51).
 *
 * **It sells to studios, not to couples**, and that is a correction rather than a preference.
 * N-51 was written before D-26 settled studio-only and described a viddrop-shaped page pricing a
 * wedding at ₹1,999 to the couple. Under studio-only every rupee is invoiced to the studio at a
 * base they mark up, so a couple-facing price here would sit next to their studio's ₹8,000 and
 * undercut the partner this product depends on. The prices below are partner prices, labelled as
 * such, next to the retail they are meant to support.
 *
 * Two claims are deliberately weaker than the competition's. We do not say "no compression" —
 * streaming renditions are transcoded, and the honest and better claim is that originals stay
 * downloadable untouched. We do not say "yours forever" — it archives, which `PRICING.md` §2
 * defines precisely, and the FAQ says so in one sentence rather than burying it.
 *
 * Server component with no client JavaScript: a marketing page that ships a bundle to say
 * "streams in seconds" is arguing against itself.
 */

const DEMO = `/c/${env.DEMO_CATALOGUE_SLUG}`
const REGISTER = '/admin/register'

export const metadata: Metadata = {
  title: 'Mehfilbox — hand over the wedding, not a folder of files',
  description:
    'A private streaming page for every wedding you deliver, under your studio’s name. ₹4,999 a year, first three weddings included.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Mehfilbox — for wedding studios',
    description:
      'Your films and photographs, delivered as the couple’s own streaming page. Your name on it, not ours.',
    type: 'website',
  },
}

export default function RootPage() {
  return (
    <div className="min-h-svh bg-surface-0">
      <MarketingNav />
      <main>
        <Hero />
        <Against />
        <How />
        <Pricing />
        <Faq />
        <Closing />
      </main>
      <MarketingFooter />
    </div>
  )
}

function MarketingNav() {
  return (
    <header className="gutter-x mx-auto flex max-w-[1100px] items-center justify-between py-6">
      <span className="type-title">Mehfilbox</span>
      <nav className="flex items-center gap-6">
        <Link href="#pricing" className="type-meta text-text-mid underline-offset-4 hover:underline">
          Pricing
        </Link>
        <Link href="/admin" className="type-meta text-text-mid underline-offset-4 hover:underline">
          Studio sign in
        </Link>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="gutter-x mx-auto max-w-[1100px] pt-10 pb-20 sm:pt-20">
      <p className="type-label mb-4 text-accent-hi">For wedding studios</p>
      <h1 className="type-display-xl mb-6 max-w-[16ch]">
        Hand over the wedding, not a folder of files.
      </h1>
      <p className="type-body-lg mb-8 max-w-[52ch] text-text-mid">
        Mehfilbox turns your films and photographs into a private streaming page under your
        studio&rsquo;s name. The couple opens one link — no account, no request-access wall, no
        guessing which file is the final cut.
      </p>
      <p className="type-body-lg mb-10 max-w-[52ch]">
        <strong className="text-text-hi">₹4,999 a year</strong>
        <span className="text-text-mid">
          {' '}
          for the studio plan, and your first three weddings are included in it.
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href={REGISTER}
          className="inline-flex h-12 items-center rounded-[var(--radius-pill)] bg-accent px-6 font-semibold text-accent-ink"
        >
          Create your studio
        </Link>
        <Link
          href={DEMO}
          className="inline-flex h-12 items-center rounded-[var(--radius-pill)] border border-surface-3 px-6 font-semibold text-text-hi"
        >
          Open a demo wedding
        </Link>
      </div>
      <p className="type-meta mt-4 text-text-lo">
        The demo is a real catalogue with sample footage — the same page a couple would receive.
      </p>
    </section>
  )
}

/** The comparison a studio actually makes, which is against a Drive folder rather than a rival. */
function Against() {
  const rows: [string, string, string][] = [
    ['Opening it', 'Request access, sign in with Google', 'One link, no account'],
    ['What they see', 'A file list — FINAL_v3.mp4', 'A running order you set, with a cover'],
    ['On a phone on 4G', 'Downloads the whole file first', 'Starts playing in about a second'],
    ['The originals', 'Re-encoded by some services on upload', 'Downloadable untouched, always'],
    ['Two years later', 'A dead link nobody at the studio owns', 'Archived and restorable — nothing deleted'],
    ['Whose name is on it', 'Google’s', 'Yours'],
  ]
  return (
    <section className="border-t border-surface-2 bg-surface-1 py-20">
      <div className="gutter-x mx-auto max-w-[1100px]">
        <h2 className="type-display-lg mb-3">What the couple gets instead of a Drive link</h2>
        <p className="type-body-lg mb-10 max-w-[56ch] text-text-mid">
          Most studios deliver through Drive or WeTransfer. Neither was built to present a
          wedding, and the couple can tell.
        </p>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Shared folder compared with Mehfilbox">
          <table className="w-full min-w-[600px] border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-3">
                <th scope="col" className="type-label py-3 pr-6 text-text-lo">
                  <span className="sr-only">Aspect</span>
                </th>
                <th scope="col" className="type-label py-3 pr-6 text-text-lo">
                  A shared folder
                </th>
                {/* `accent-hi` clears 4.5:1 on surface-0 only — on this raised surface it does
                    not, and axe caught it on desktop while mobile passed because the column was
                    clipped out of the scroll region there. The accent is reserved for the
                    sections that sit on surface-0. */}
                <th scope="col" className="type-label py-3 font-semibold text-text-hi">
                  Mehfilbox
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([aspect, folder, ours]) => (
                <tr key={aspect} className="border-b border-surface-2 align-top">
                  <th scope="row" className="type-body-lg py-4 pr-6 font-semibold text-text-hi">
                    {aspect}
                  </th>
                  <td className="py-4 pr-6 text-text-mid">{folder}</td>
                  <td className="py-4 text-text-hi">{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function How() {
  const steps: [string, string][] = [
    [
      'Upload the films and the photographs',
      'Multi-gigabyte uploads resume if the connection drops, so a 40 GB wedding survives a hotel Wi-Fi.',
    ],
    [
      'Arrange the page and put your studio on it',
      'Drag sections into the order you want, set your logo and colour, and watch the real page change as you do it.',
    ],
    [
      'Send one link',
      'Add a passcode if the family wants one. The couple opens it on a phone and it plays.',
    ],
  ]
  return (
    <section className="py-20">
      <div className="gutter-x mx-auto max-w-[1100px]">
        <h2 className="type-display-lg mb-10">Three steps, in one sitting</h2>
        <ol className="grid gap-8 sm:grid-cols-3">
          {steps.map(([title, body], i) => (
            <li key={title}>
              <p className="type-label mb-3 text-accent-hi">Step {i + 1}</p>
              <h3 className="type-title mb-2">{title}</h3>
              <p className="text-text-mid">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-8 border-t border-surface-2 bg-surface-1 py-20">
      <div className="gutter-x mx-auto max-w-[1100px]">
        <h2 className="type-display-lg mb-3">What you pay, and what you charge</h2>
        <p className="type-body-lg mb-10 max-w-[58ch] text-text-mid">
          These are partner prices. You bill the couple whatever your market bears — we never
          appear on their invoice, and we never sell to them over your head.
        </p>

        <div className="mb-12 rounded-[var(--radius-card)] border border-accent-dim bg-surface-2 p-6 sm:p-8">
          <p className="type-label mb-2 text-text-mid">Required, once a year</p>
          <p className="type-display-lg mb-2">₹4,999</p>
          <p className="mb-4 max-w-[52ch] text-text-mid">
            The studio plan: your branding and saved presets, team seats, a custom domain served as
            yours, and the dashboard that tells you which weddings are about to lapse.
          </p>
          <p className="text-text-hi">
            Three Deliver credits are included in the first year — deliver three weddings and the
            platform has cost you nothing.
          </p>
        </div>

        <h3 className="type-title mb-4">Then, per wedding</h3>
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Per-wedding plans and prices">
          <table className="w-full min-w-[640px] border-collapse text-left">
            <thead>
              <tr className="border-b border-surface-3">
                <th scope="col" className="type-label py-3 pr-6 text-text-lo">Plan</th>
                <th scope="col" className="type-label py-3 pr-6 text-text-lo">The couple keeps it</th>
                <th scope="col" className="type-label py-3 pr-6 text-text-lo">You pay</th>
                <th scope="col" className="type-label py-3 text-text-lo">Studios typically charge</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-surface-2">
                <th scope="row" className="py-4 pr-6 font-semibold text-text-hi">Deliver</th>
                <td className="py-4 pr-6 text-text-mid">90 days · 100 GB</td>
                <td className="py-4 pr-6 text-text-hi">₹1,999 · five for ₹7,999</td>
                <td className="py-4 text-text-mid">₹5,000 – ₹8,000</td>
              </tr>
              <tr className="border-b border-surface-2">
                <th scope="row" className="py-4 pr-6 font-semibold text-text-hi">Keep</th>
                <td className="py-4 pr-6 text-text-mid">12 months, renewable · 100 GB</td>
                <td className="py-4 pr-6 text-text-hi">₹6,000 · three years ₹12,000</td>
                <td className="py-4 text-text-mid">₹15,000 – ₹20,000</td>
              </tr>
              <tr className="border-b border-surface-2">
                <th scope="row" className="py-4 pr-6 font-semibold text-text-hi">Cinema</th>
                <td className="py-4 pr-6 text-text-mid">12 months, renewable · 200 GB · 4K</td>
                <td className="py-4 pr-6 text-text-hi">₹12,000 · three years ₹24,000</td>
                <td className="py-4 text-text-mid">₹30,000 – ₹40,000</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="type-meta mt-4 text-text-lo">
          All prices exclude GST. Renewals and archive are billed to you as well, so the couple
          only ever deals with your studio.
        </p>
      </div>
    </section>
  )
}

function Faq() {
  const qa: [string, string][] = [
    [
      'What happens after 90 days?',
      'It archives. Nothing is deleted — streaming pauses, the files are kept, and a catalogue is restored when it is paid for again. A couple in grace can still download everything.',
    ],
    [
      'Do you compress our films?',
      'We build streaming renditions so a phone on 4G starts playing quickly. The originals you uploaded are kept untouched and stay downloadable, which is the claim that actually matters.',
    ],
    [
      'Whose brand does the couple see?',
      'Yours. Your logo, your colour, your domain if you want one. A small "Made with Mehfilbox" line sits in the footer unless you switch it off in your studio settings — one click, and we are gone from the page.',
    ],
    [
      'Do we lose the client to you?',
      'No. You are the only customer we invoice, including renewals, so the couple has one relationship and it is with your studio.',
    ],
    [
      'What if our studio closes?',
      'The couple can pay us directly at list price to keep their wedding. It only unlocks when a studio is genuinely gone, and it exists so a wedding never disappears because a business did.',
    ],
    [
      'Can we try it before paying?',
      'Create a studio and build a catalogue with your own footage. You pay when you deliver one to a couple.',
    ],
  ]
  return (
    <section className="py-20">
      <div className="gutter-x mx-auto max-w-[1100px]">
        <h2 className="type-display-lg mb-10">Questions studios ask first</h2>
        <dl className="grid gap-8 sm:grid-cols-2">
          {qa.map(([q, a]) => (
            <div key={q}>
              <dt className="type-title mb-2">{q}</dt>
              <dd className="text-text-mid">{a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

function Closing() {
  return (
    <section className="border-t border-surface-2 bg-surface-1 py-20">
      <div className="gutter-x mx-auto max-w-[1100px]">
        <h2 className="type-display-lg mb-4 max-w-[20ch]">
          The wedding should outlive the hard drive it was cut on.
        </h2>
        <p className="type-body-lg mb-8 max-w-[52ch] text-text-mid">
          Set up your studio, upload one wedding, and send the link to yourself first. It takes an
          afternoon.
        </p>
        <Link
          href={REGISTER}
          className="inline-flex h-12 items-center rounded-[var(--radius-pill)] bg-accent px-6 font-semibold text-accent-ink"
        >
          Create your studio
        </Link>
      </div>
    </section>
  )
}

function MarketingFooter() {
  return (
    <footer className="gutter-x mx-auto max-w-[1100px] border-t border-surface-2 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="type-meta text-text-lo">Mehfilbox</p>
        <nav className="flex flex-wrap gap-6">
          <Link href="/privacy" className="type-meta text-text-mid underline-offset-4 hover:underline">
            Privacy
          </Link>
          <Link href="/terms" className="type-meta text-text-mid underline-offset-4 hover:underline">
            Terms
          </Link>
          <Link href="/admin" className="type-meta text-text-mid underline-offset-4 hover:underline">
            Studio sign in
          </Link>
        </nav>
      </div>
    </footer>
  )
}
