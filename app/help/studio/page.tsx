import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Metadata } from 'next'
import { HelpPage } from '@/components/help/HelpPage'

/**
 * `docs/help/studio.md` is the page. `next.config.ts`'s `outputFileTracingIncludes` is what
 * makes the file survive into the Vercel bundle — without it this reads fine in `next dev` and
 * 404s (or throws) in production, because the serverless build only ships files it can trace a
 * dependency to (N-88).
 */
export const metadata: Metadata = { title: 'Studio guide — Mehfilbox' }

export default function StudioHelpPage() {
  const markdown = readFileSync(path.join(process.cwd(), 'docs/help/studio.md'), 'utf8')
  return <HelpPage markdown={markdown} otherDoor={{ href: '/help/client', label: 'Client guide' }} />
}
