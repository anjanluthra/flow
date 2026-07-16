import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth'
import { ensureUserInviteColumns, query } from '@/lib/db'

// ---------------------------------------------------------------------------
// POST /api/users/invite — admin creates (or re-invites) a user by email and
// gets back a one-time link they can send. The invitee sets their own password
// at /auth/set-password?token=…; we only ever store a hash of the token.
// Body: { email, fullName?, role? }
// ---------------------------------------------------------------------------

const INVITE_TTL_DAYS = 7

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    await ensureUserInviteColumns()
    const { email, fullName, role = 'user' } = (await request.json()) as {
      email?: string
      fullName?: string
      role?: string
    }
    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }

    const token = crypto.randomBytes(32).toString('base64url')
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

    // Create the user (no password yet) or refresh the invite on an existing
    // pending row. We never blank an existing password here — only the invitee
    // completing the link sets/overwrites it.
    await query(
      `INSERT INTO users (email, full_name, role, is_active, invite_token_hash, invite_expires_at)
       VALUES (lower($1), $2, $3, true, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
         full_name         = COALESCE(EXCLUDED.full_name, users.full_name),
         role              = EXCLUDED.role,
         is_active         = true,
         invite_token_hash = EXCLUDED.invite_token_hash,
         invite_expires_at = EXCLUDED.invite_expires_at`,
      [email, fullName || null, role === 'admin' ? 'admin' : 'user', tokenHash, expiresAt.toISOString()],
    )

    // Build the absolute link from the incoming request (works behind Vercel's
    // proxy via x-forwarded-proto/host).
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    const host = request.headers.get('host') || request.nextUrl.host
    const inviteUrl = `${proto}://${host}/auth/set-password?token=${token}`

    return NextResponse.json({ success: true, inviteUrl, expiresAt: expiresAt.toISOString() })
  } catch (error) {
    console.error('Failed to create invite:', error)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}
