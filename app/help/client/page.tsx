import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { HelpPage } from '@/components/help/HelpPage'

/** `docs/help/client.md` is the page — see `app/help/studio/page.tsx` for why this reads a file. */
export const metadata: Metadata = { title: 'Client guide — Mehfilbox' }

export default function ClientHelpPage() {
  const markdown = readFileSync(path.join(process.cwd(), 'docs/help/client.md'), 'utf8')
  return <HelpPage markdown={markdown} otherDoor={{ href: '/help/studio', label: 'Studio guide' }} />
}
