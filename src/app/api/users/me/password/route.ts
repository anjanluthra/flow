import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { ensureUserInviteColumns, query } from '@/lib/db'

// ---------------------------------------------------------------------------
// POST /api/users/me/password — the signed-in user sets/changes THEIR OWN
// password in the DB. This is how a founding account moves off the env-var
// bootstrap: set a DB password here, and from then on you sign in against it.
// Body: { password }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user
  const email = sessionUser?.email
  if (!sessionUser || !email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (sessionUser as { role?: string }).role === 'admin' ? 'admin' : 'user'

  try {
    const { password } = (await request.json()) as { password?: string }
    if (!password || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    await ensureUserInviteColumns()
    const hash = await bcrypt.hash(password, 10)
    await query(
      `INSERT INTO users (email, full_name, role, is_active, password_hash)
       VALUES (lower($1), $2, $3, true, $4)
       ON CONFLICT (email) DO UPDATE SET
         password_hash     = EXCLUDED.password_hash,
         is_active         = true,
         invite_token_hash = NULL,
         invite_expires_at = NULL`,
      [email, sessionUser.name ?? null, role, hash],
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set own password:', error)
    return NextResponse.json({ error: 'Failed to set password' }, { status: 500 })
  }
}
