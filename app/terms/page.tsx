import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/LegalPage'

/**
 * Terms as the product actually behaves, in the studio-only model D-26 settled: the studio is the
 * customer, and the escape hatch exists so a wedding does not disappear because a business did.
 */
export const metadata: Metadata = { title: 'Terms — Mehfilbox' }

export default function TermsPage() {
  return (
    <LegalPage title="Terms" updated="7 September 2026">
      <p>
        These terms cover studios using Mehfilbox to deliver weddings, and the couples who receive
        them.
      </p>

      <h2 className="type-title">Who the customer is</h2>
      <p>
        <strong>The studio.</strong> Every charge — the studio plan, a delivery, a renewal, archive
        — is invoiced to the studio, which is free to bill the couple whatever it chooses. We do
        not sell to a couple over a studio&rsquo;s head.
      </p>

      <h2 className="type-title">What you keep</h2>
      <p>
        The films and photographs remain the studio&rsquo;s and the couple&rsquo;s. We hold them to
        deliver the service and claim no right to use them for anything else, including promotion,
        without asking first.
      </p>

      <h2 className="type-title">When a plan ends</h2>
      <p>
        A catalogue lapses at the end of its term and enters a grace period, during which the
        couple can still download everything. After grace it is archived: streaming stops, files
        are retained, and paying restores it. <strong>Nothing is deleted at expiry.</strong>
      </p>

      <h2 className="type-title">If a studio is gone</h2>
      <p>
        If a studio closes, stops paying past grace, or does not respond for ninety days after a
        lapse, the couple may pay us directly at list price to keep their wedding. It is recorded
        when it unlocks, and it exists for exactly this case.
      </p>

      <h2 className="type-title">What we do not promise</h2>
      <p>
        We do not offer an uptime guarantee, and we are not a backup service — keep your own copy
        of the originals. Storage and delivery limits are those stated on the plan.
      </p>

      <h2 className="type-title">Changes</h2>
      <p>
        Prices and terms can change with notice before a renewal. A term already paid for is not
        repriced partway through.
      </p>
    </LegalPage>
  )
}
