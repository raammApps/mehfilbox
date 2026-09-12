import 'server-only'
import type { NextResponse } from 'next/server'

/**
 * Who is signed in, and how they proved it.
 *
 * The narrow interface over authentication, mirroring `lib/video/provider.ts` and
 * `lib/photos/provider.ts` for the same reason: the suite, CI and an offline demo have to run
 * without a Supabase project, and an auth layer that demands one is an auth layer no test
 * exercises. E2E boots on `DATA_DRIVER=file` with no network.
 *
 * **This interface answers only "which user is this".** Which org they belong to, and therefore
 * what they may see, is resolved from the `operators` row afterwards, in `session.ts` — the one
 * place `org_id` enters a query (doc 07). Keeping authorisation out of here means swapping the
 * authenticator can never widen what somebody can reach.
 */

export type AuthenticatedUser = {
  /** Matches `operators.id`, which references `auth.users.id`. */
  id: string
  email: string
}

export interface AuthProvider {
  readonly name: string

  /** The signed-in user, or null. Reads whatever cookie the driver owns. */
  currentUser(): Promise<AuthenticatedUser | null>

  /**
   * Verify credentials and attach whatever the driver needs to keep the session.
   *
   * Takes the response so a driver can set its own cookies on it — Supabase issues a pair it
   * refreshes, and a driver that could only return a token could not express that.
   */
  signIn(email: string, password: string, response: NextResponse): Promise<AuthenticatedUser | null>

  /** Clear the session. */
  signOut(response: NextResponse): Promise<void>

  /**
   * Create the credential for a new account and return the id an `operators` row must use.
   *
   * Only the credential. It grants nothing on its own: until an `operators` row exists, the
   * holder authenticates and is still refused, which is the property partner registration is
   * built on — the account is made first, access second, and the second step is ours.
   *
   * Returns null when the address is already registered, so the caller reports one outcome and
   * never becomes an account-enumeration oracle.
   */
  signUp(email: string, password: string): Promise<AuthenticatedUser | null>

  /**
   * Create a credential on somebody's behalf — a studio issuing a couple's sign-in, the platform
   * creating a studio's first operator (D-33). Unlike `signUp` it sends nothing and needs no
   * confirmation: the person who asked for the account is standing next to the person it is for,
   * or is us. Returns null when the address is already registered.
   */
  createUser(email: string, password: string): Promise<AuthenticatedUser | null>

  /**
   * Replace a password, for a credential link that has been redeemed or a signed-in person who
   * typed their old one (D-33). The caller has already decided the change is allowed; this only
   * carries it out wherever the credential lives.
   */
  setPassword(userId: string, password: string): Promise<void>
}
