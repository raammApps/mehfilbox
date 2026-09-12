import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * The console's sign-in moved to the public site's `/login`, behind the Studio door (D-33).
 * Kept as a redirect because the address is in bookmarks, in the manual-test walkthrough and in
 * every studio's muscle memory; the prefilled address a handover passes along rides through.
 */
export default async function LoginRedirect({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>
}) {
  const { email } = await searchParams
  redirect(`/login?door=studio${typeof email === 'string' && email ? `&email=${encodeURIComponent(email)}` : ''}`)
}
