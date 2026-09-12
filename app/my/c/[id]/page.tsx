import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { PublicLink } from '@/components/admin/PublicLink'
import { CoupleChrome } from '@/components/my/CoupleChrome'
import { GuestCodePanel, LetterPanel, SectionsPanel, SupportWindowPanel } from '@/components/my/panels'
import { basePathOf, publicUrlOf } from '@/lib/address'
import { getRepository } from '@/lib/db'
import { resolveLocalised } from '@/lib/i18n'
import { getCoupleSession, relationOf } from '@/lib/my/session'
import { getModule } from '@/modules/registry'

export const dynamic = 'force-dynamic'

/**
 * One catalogue, from the couple's side (D-37).
 *
 * Linked (the studio is still preparing it): open, share, download, and the guest code — the
 * things a couple can sensibly decide before delivery. Owned: those, plus the letter, the
 * sections, and the studio's access window. The full editor is one link away for a catalogue
 * they own; it is the same customizer, and a second worse one would help nobody.
 */
export default async function MyCataloguePage({ params }: { params: Promise<{ id: string }> }) {
  const couple = await getCoupleSession()
  if (!couple) redirect('/login?door=couple')

  const { id } = await params
  const repository = getRepository()
  const catalogue = await repository.getCatalogueForCouple(id, couple.org.id)
  if (!catalogue) notFound()

  const relation = relationOf(catalogue, couple.org.id)
  const maker = catalogue.originOrgId ? await repository.getOrg(catalogue.originOrgId) : null
  const madeByYou = catalogue.originOrgId === couple.org.id
  const live = catalogue.status === 'published'
  const url = publicUrlOf(catalogue)

  // The first section the module contract lets a couple rewrite as prose — never a type by name.
  const letter = catalogue.modules.find((m) => getModule(m.type)?.prose)
  const letterText = (() => {
    if (!letter) return null
    const definition = getModule(letter.type)!
    const parsed = definition.schema.safeParse(letter.config)
    return parsed.success ? definition.prose!.read(parsed.data, couple.org.locale) : null
  })()
  const sections = catalogue.modules
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((m) => ({
      id: m.id,
      label: resolveLocalised(m.title, couple.org.locale) || getModule(m.type)?.meta.label || m.type,
      enabled: m.enabled,
    }))

  return (
    <CoupleChrome name={couple.session.operator.name} email={couple.session.operator.email} orgName={couple.org.name}>
      <Link href="/my" className="mb-3 inline-flex items-center gap-1 text-[13px] text-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]">
        <span aria-hidden>←</span> Your weddings
      </Link>

      <header className="mb-6">
        <h1 className="text-[24px] font-bold tracking-[-0.01em]">{catalogue.coupleName.en}</h1>
        <p className="mt-0.5 text-[14px] text-[var(--color-l-text-mid)]">
          {relation === 'linked'
            ? `${maker?.name ?? 'Your studio'} is still preparing this. You will be told when it is handed over.`
            : madeByYou
              ? 'Yours, made by you.'
              : `Yours. Filmed by ${maker?.name ?? 'your studio'}.`}
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border border-[var(--color-l-line)] bg-white p-4">
          <h2 className="text-[15px] font-semibold">The link</h2>
          <p className="mb-3 mt-0.5 text-[13px] text-[var(--color-l-text-mid)]">
            {live
              ? 'Send it to anyone. No account needed on their side.'
              : 'Not published yet — the link opens a "not yet available" page until it is.'}
          </p>
          <PublicLink url={url} status={catalogue.status} />
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${catalogue.coupleName.en} — the wedding, streaming here: ${url}`)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3.5 py-1.5 text-[13px] font-semibold"
            >
              Share on WhatsApp
            </a>
            {catalogue.publishedAt ? (
              <a
                href={`${basePathOf(catalogue) || ''}/download`}
                className="rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3.5 py-1.5 text-[13px] font-semibold"
              >
                Download everything
              </a>
            ) : null}
            {relation === 'owned' ? (
              <Link
                href={`/admin/c/${catalogue.id}/customizer`}
                className="rounded-[var(--radius-pill)] border border-[var(--color-l-line)] px-3.5 py-1.5 text-[13px] font-semibold"
              >
                Open the full editor
              </Link>
            ) : null}
          </div>
        </section>

        <GuestCodePanel catalogueId={catalogue.id} hasCode={catalogue.privacy === 'passcode'} />

        {relation === 'owned' && letterText ? (
          <LetterPanel catalogueId={catalogue.id} body={letterText.body} signature={letterText.signature} />
        ) : null}

        {relation === 'owned' && sections.length > 0 ? (
          <SectionsPanel catalogueId={catalogue.id} sections={sections} />
        ) : null}

        {relation === 'owned' && maker && !madeByYou ? (
          <SupportWindowPanel catalogueId={catalogue.id} studioName={maker.name} until={catalogue.supportAccessUntil} />
        ) : null}
      </div>
    </CoupleChrome>
  )
}
