import { getServerSession } from 'next-auth'
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
