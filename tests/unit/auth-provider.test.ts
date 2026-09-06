import { describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { LocalAuthProvider } from '@/lib/admin/auth-local'

/**
 * The line the auth seam must not blur.
 *
 * A provider answers *who* somebody is. Whether they may see anything is decided afterwards
 * from the `operators` row, in `session.ts` — the one place `org_id` enters a query. Swapping
 * the authenticator must never widen what a person can reach, so a provider that returned an
 * org, or a session, would be the wrong shape.
 */

vi.mock('@/lib/db', () => ({
  getRepository: () => ({
    getOperatorByEmail: async (email: string) =>
      email === 'operator@mehfilbox.test'
        ? {
            id: 'op-1',
            orgId: 'org-1',
            email,
            name: 'Demo',
            role: 'admin',
            // scrypt hash of "right-password"
            passwordHash: hash,
            createdAt: new Date().toISOString(),
          }
        : null,
    getOperator: async (id: string) =>
      id === 'op-1'
        ? { id, orgId: 'org-1', email: 'operator@mehfilbox.test', name: 'Demo', role: 'admin', passwordHash: hash, createdAt: '' }
        : null,
  }),
}))

const { hashSecret } = await import('@/lib/crypto')
const hash = hashSecret('right-password')

describe('the auth provider contract', () => {
  it('returns only an identity, never an org', async () => {
    const provider = new LocalAuthProvider()
    const user = await provider.signIn('operator@mehfilbox.test', 'right-password', new NextResponse())

    expect(user).toEqual({ id: 'op-1', email: 'operator@mehfilbox.test' })
    // If an org ever appears here, authorisation has leaked into authentication.
    expect(user && 'orgId' in user).toBe(false)
  })

  it('refuses a wrong password', async () => {
    const provider = new LocalAuthProvider()
    expect(await provider.signIn('operator@mehfilbox.test', 'wrong', new NextResponse())).toBeNull()
  })

  it('refuses an unknown address the same way, so neither is an enumeration oracle', async () => {
    const provider = new LocalAuthProvider()
    expect(await provider.signIn('nobody@example.com', 'right-password', new NextResponse())).toBeNull()
  })

  it('sets a session cookie on the response it was handed', async () => {
    const response = new NextResponse()
    await new LocalAuthProvider().signIn('operator@mehfilbox.test', 'right-password', response)
    // The response carries it, rather than the provider writing cookies itself — which is what
    // lets a driver set the several that Supabase issues.
    expect(response.cookies.getAll().length).toBeGreaterThan(0)
  })

  it('clears it on sign out', async () => {
    const response = new NextResponse()
    await new LocalAuthProvider().signOut(response)
    expect(response.cookies.get('mehfilbox_session')?.value).toBe('')
  })
})
