import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { NextResponse } from 'next/server'
import { getRepository } from '@/lib/db'
import { env } from '@/lib/env'
import { ApiError } from '@/lib/http/errors'
import type { AuthenticatedUser, AuthProvider } from './auth-provider'

/**
 * Supabase Auth: it owns the credential, we own the authorisation.
 *
 * Uses the **publishable** key, not the secret one. This client acts as the person signing in,
 * so it must be subject to RLS like any other visitor; the service-role key would make every
 * login omnipotent and turn a stolen session into a database.
 *
 * What this buys over the local driver is the reason doc 15 puts it before partner
 * registration: a verified email address, a password this application never sees or stores, and
 * a reset flow that does not involve an operator emailing us.
 */
export class SupabaseAuthProvider implements AuthProvider {
  readonly name = 'supabase'

  /**
   * A client bound to this request's cookies.
   *
   * `setAll` is a no-op when no response is available: Next forbids writing cookies while
   * rendering, and Supabase's refresh will try. Swallowing it there is the documented shape —
   * the refreshed pair is written on the next route handler that passes a response.
   */
  private client(response?: NextResponse) {
    const store = cookies()
    return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      cookies: {
        getAll: async () => (await store).getAll(),
        setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => {
          if (!response) return
          for (const { name, value, options } of list) {
            response.cookies.set({ name, value, ...(options ?? {}) })
          }
        },
      },
    })
  }

  async currentUser(): Promise<AuthenticatedUser | null> {
    // `getUser` revalidates against the auth server rather than trusting the cookie's contents,
    // which is the difference between a session and a claim.
    const { data, error } = await this.client().auth.getUser()
    if (error || !data.user?.email) return null
    return { id: data.user.id, email: data.user.email }
  }

  async signIn(
    email: string,
    password: string,
    response: NextResponse,
  ): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client(response).auth.signInWithPassword({ email, password })
    if (error || !data.user?.email) return null
    return { id: data.user.id, email: data.user.email }
  }

  /**
   * Supabase owns the credential and, if the project requires it, sends the confirmation email.
   *
   * A repeat address comes back looking like a success — Supabase deliberately does not confirm
   * whether an account exists — so the absence of an identity is the only reliable signal, and
   * the caller reports one outcome either way.
   */
  async signUp(email: string, password: string): Promise<AuthenticatedUser | null> {
    const { data, error } = await this.client().auth.signUp({ email, password })

    /**
     * A refusal and an outage are different answers, and null cannot say which.
     *
     * Sign-up sends a confirmation email, and Supabase's built-in SMTP allows only a few per
     * hour — it exists for development and says so. Reporting that as "try a different address"
     * sends a real business away believing their own email is the problem, which is the worst
     * possible reading. Throw, so the caller can say "not right now" instead.
     */
    if (error && (error.status === 429 || /rate limit/i.test(error.message))) {
      throw new ApiError(
        'RATE_LIMITED',
        'Sign-ups are temporarily unavailable. Please try again shortly.',
      )
    }
    if (error || !data.user?.email) return null
    // An existing address returns a user with no identities rather than an error.
    if (Array.isArray(data.user.identities) && data.user.identities.length === 0) return null
    return { id: data.user.id, email: data.user.email }
  }

  /**
   * The service-role client, for the two operations a person cannot do to their own account:
   * creating one for them and replacing their password from a link. Built per call and never
   * bound to request cookies — it acts as us, not as anyone signed in.
   */
  private admin() {
    return createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    }).auth.admin
  }

  async createUser(email: string, password: string): Promise<AuthenticatedUser | null> {
    // Confirmed on creation: the studio in the room, or the platform, vouches for the address,
    // and a confirmation email nobody asked for is the first thing a couple would ignore.
    const { data, error } = await this.admin().createUser({ email, password, email_confirm: true })
    if (error) {
      // An address that already exists is reported as null, exactly as `signUp` does, so the
      // caller cannot become an enumeration oracle by accident.
      if (/already|exists|registered/i.test(error.message)) return null
      throw new ApiError('INTERNAL', error.message)
    }
    if (!data.user?.email) return null
    return { id: data.user.id, email: data.user.email }
  }

  async setPassword(userId: string, password: string): Promise<void> {
    const { error } = await this.admin().updateUserById(userId, { password })
    if (error) throw new ApiError('INTERNAL', error.message)
    // The flag lives on our row; the credential lives on theirs.
    await getRepository().setOperatorPassword(userId, { mustChangePassword: false })
  }

  async signOut(response: NextResponse): Promise<void> {
    await this.client(response).auth.signOut()
  }
}
