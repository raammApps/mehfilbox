import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import rehypeSlug from 'rehype-slug'
import remarkGfm from 'remark-gfm'
import type { AnchorHTMLAttributes, ClassAttributes, HTMLAttributes } from 'react'

/**
 * Renders one of the `docs/help/*.md` files as a page (N-88). The markdown file is the source of
 * truth — this component turns it into React elements, never a hardcoded transcription, so
 * editing the `.md` and deploying is the entire publishing step.
 *
 * No `dangerouslySetInnerHTML` anywhere: `react-markdown` parses to an AST and renders real React
 * elements, which is what keeps this off the `no-dangerouslySetInnerHTML` eslint rule's radar
 * without asking for an exception.
 */
export function HelpPage({ markdown, otherDoor }: { markdown: string; otherDoor: { href: string; label: string } }) {
  return (
    <div className="min-h-svh bg-surface-0">
      <header className="gutter-x mx-auto flex max-w-[820px] items-center justify-between py-6">
        <Link href="/" className="type-title underline-offset-4 hover:underline">
          Mehfilbox
        </Link>
        <div className="flex items-center gap-4">
          <Link href={otherDoor.href} className="type-meta underline-offset-4 hover:underline">
            {otherDoor.label}
          </Link>
          <Link href="/login" className="type-meta text-text-mid underline-offset-4 hover:underline">
            Sign in
          </Link>
        </div>
      </header>
      <main className="gutter-x mx-auto max-w-[820px] pb-24">
        <article
          className="flex flex-col gap-4 text-text-mid
            [&_a]:text-text-hi [&_a]:underline [&_a]:underline-offset-4
            [&_blockquote]:rounded-[var(--radius-card)] [&_blockquote]:border [&_blockquote]:border-surface-3 [&_blockquote]:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-text-mid
            [&_code]:rounded [&_code]:bg-surface-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-[0.9em]
            [&_h1]:type-display-lg [&_h1]:mb-2 [&_h1]:mt-8
            [&_h2]:type-title [&_h2]:mt-10 [&_h2]:scroll-mt-6 [&_h2]:text-text-hi
            [&_h3]:mt-6 [&_h3]:font-semibold [&_h3]:text-text-hi
            [&_hr]:my-8 [&_hr]:border-surface-2
            [&_li]:ms-1
            [&_ol]:list-decimal [&_ol]:ps-5
            [&_p]:leading-relaxed
            [&_strong]:text-text-hi
            [&_table]:w-full [&_table]:text-start
            [&_td]:border-t [&_td]:border-surface-2 [&_td]:px-3 [&_td]:py-2 [&_td]:align-top
            [&_th]:border-b [&_th]:border-surface-3 [&_th]:px-3 [&_th]:py-2 [&_th]:text-start [&_th]:font-semibold [&_th]:text-text-hi
            [&_ul]:list-disc [&_ul]:ps-5"
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSlug]}
            components={{
              table: TableWithScroll,
              a: HelpLink,
            }}
          >
            {markdown}
          </ReactMarkdown>
        </article>
      </main>
    </div>
  )
}

/** A wide table (several columns of prose) must scroll inside its own box, never the page. */
function TableWithScroll(props: ClassAttributes<HTMLTableElement> & HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table {...props} />
    </div>
  )
}

/** `next/link` for same-app paths (`/help/...`), a plain anchor for everything else. */
function HelpLink(props: ClassAttributes<HTMLAnchorElement> & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { href, children, ...rest } = props
  if (href?.startsWith('/')) {
    return (
      <Link href={href} {...rest}>
        {children}
      </Link>
    )
  }
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
}
