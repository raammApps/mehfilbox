'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin/platform', label: 'Dashboard', exact: true },
  { href: '/admin/platform/studios', label: 'Studios' },
  { href: '/admin/platform/couples', label: 'Couples' },
  { href: '/admin/platform/catalogues', label: 'Catalogues' },
  { href: '/admin/platform/themes', label: 'Themes' },
  { href: '/admin/platform/domains', label: 'Domains' },
  { href: '/admin/platform/health', label: 'Health' },
  { href: '/admin/platform/audit', label: 'Audit' },
]

/** The platform console's pages (doc 16 §8), in the order they are read. */
export function PlatformNav() {
  const pathname = usePathname() ?? ''
  return (
    <nav aria-label="Platform" className="mb-6 flex flex-wrap gap-1 border-b border-[var(--color-l-line)]">
      {LINKS.map((link) => {
        const current = link.exact ? pathname === link.href : pathname.startsWith(link.href)
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-[14px] ${
              current
                ? 'border-[var(--color-accent)] font-semibold text-[var(--color-l-text-hi)]'
                : 'border-transparent text-[var(--color-l-text-mid)] hover:text-[var(--color-l-text-hi)]'
            }`}
          >
            {link.label}
          </Link>
        )
      })}
      <Link href="/admin" className="ms-auto px-3 py-2 text-[13px] underline underline-offset-4">
        My own console
      </Link>
    </nav>
  )
}
