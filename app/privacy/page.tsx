import type { Metadata } from 'next'
import { LegalPage } from '@/components/marketing/LegalPage'

/**
 * The guest footer has linked `/privacy` since Phase 0 and the route did not exist, so every
 * wedding page carried a link to a 404. This is that page.
 *
 * Written from what the code actually stores rather than from a template: a guest profile is a
 * label and an avatar seed, with no email and no account, which is worth stating plainly because
 * it is unusual and it is true.
 */
export const metadata: Metadata = { title: 'Privacy — Mehfilbox' }

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy" updated="7 September 2026">
      <p>
        Mehfilbox hosts wedding films and photographs on behalf of the studio that produced them.
        The studio decides who may see a catalogue; we store it and serve it.
      </p>

      <h2 className="type-title">What a wedding guest gives us</h2>
      <p>
        <strong>No account and no email address.</strong> A guest opening a catalogue chooses a
        display name and an avatar. We keep that name, how far through a film they watched so it
        can resume, which photographs they liked, and anonymous playback quality measurements used
        to tell whether video is starting quickly enough. Nothing here identifies a person beyond
        the name they typed.
      </p>

      <h2 className="type-title">What a studio gives us</h2>
      <p>
        An email address and a password for signing in, the studio&rsquo;s name and branding, and
        the media uploaded for each wedding. Sign-in is handled by Supabase Auth; we never see the
        password itself.
      </p>

      <h2 className="type-title">Who else touches it</h2>
      <p>
        Video and photographs are stored and delivered by Bunny.net. Application data is stored in
        Supabase (Postgres), hosted in Singapore. The application runs on Vercel, served from
        Mumbai. Transactional email is sent through Resend. We do not sell data, and there is no
        advertising or third-party analytics on a wedding page.
      </p>

      <h2 className="type-title">How long it is kept</h2>
      <p>
        For as long as the catalogue&rsquo;s plan is active, and through archive if the studio
        keeps it. Nothing is deleted at expiry — a catalogue goes cold and is restored on payment.
        Deletion happens on an explicit, recorded request from the couple or the studio.
      </p>

      <h2 className="type-title">Asking for a copy, or for deletion</h2>
      <p>
        A couple should ask their studio first, since the studio controls the catalogue. If the
        studio is no longer reachable, write to us and we will act on it directly.
      </p>
    </LegalPage>
  )
}
