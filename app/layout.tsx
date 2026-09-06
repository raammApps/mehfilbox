import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { fontVariables } from '@/lib/fonts'
import { parseLocale } from '@/lib/i18n'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mehfilbox',
  description: 'A wedding, presented as a private streaming service.',
  // No catalogue is ever indexable (doc 01 US-5). Reinforced by a global header in next.config.
  robots: { index: false, follow: false, nocache: true },
}

export const viewport: Viewport = {
  themeColor: '#0c0c0d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  // Never below 1 — pinch-zoom stays available (doc 10 §4).
  maximumScale: 5,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = parseLocale((await cookies()).get('mehfilbox_locale')?.value)

  return (
    <html lang={locale} className={fontVariables}>
      <body>{children}</body>
    </html>
  )
}
