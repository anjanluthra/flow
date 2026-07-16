import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { ensureUserInviteColumns, query } from '@/lib/db'

// ---------------------------------------------------------------------------
// POST /api/auth/set-password — PUBLIC. Consume a one-time invite token and set
// the user's password. No session required (the token IS the proof). Middleware
// allows /api/auth/*. Body: { token, password }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    await ensureUserInviteColumns()
    const { token, password } = (await request.json()) as { token?: string; password?: string }
    if (!token) {
      return NextResponse.json({ error: 'Missing invite token' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const found = await query(
      `SELECT id FROM users
       WHERE invite_token_hash = $1 AND invite_expires_at > now() AND is_active = true`,
      [tokenHash],
    )
    const user = found.rows[0]
    if (!user) {
      return NextResponse.json({ error: 'This invite link is invalid or has expired.' }, { status: 400 })
    }

    const hash = await bcrypt.hash(password, 10)
    await query(
      `UPDATE users
       SET password_hash = $1, invite_token_hash = NULL, invite_expires_at = NULL
       WHERE id = $2`,
      [hash, user.id],
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set password:', error)
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 })
  }
}
