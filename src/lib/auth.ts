import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'

// ---------------------------------------------------------------------------
// Server-side auth helpers
// ---------------------------------------------------------------------------

/**
 * Get the current session on the server side.
 * Returns null if the user is not authenticated.
 */
export async function getCurrentSession() {
  return getServerSession(authOptions)
}

/**
 * Require authentication. Throws if not authenticated.
 * Useful in API routes and server components.
 */
export async function requireAuth() {
  const session = await getCurrentSession()
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}

/**
 * Check if the current user has a specific role.
 */
export async function hasRole(role: string): Promise<boolean> {
  const session = await getCurrentSession()
  if (!session?.user) return false
  return (session.user as { role?: string }).role === role
}

/**
 * Admin-only guard for API route handlers. Returns a 401/403 NextResponse to
 * return early, or null when the caller is an admin and may proceed.
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getCurrentSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if ((session.user as { role?: string }).role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  return null
}
