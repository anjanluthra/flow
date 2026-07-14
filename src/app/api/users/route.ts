import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { query } from '@/lib/db'

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  return null
}

// ---------------------------------------------------------------------------
// GET /api/users — list users (admin only)
// ---------------------------------------------------------------------------

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const result = await query(
      `SELECT id, email, full_name, role, is_active,
              (password_hash IS NOT NULL) AS has_password,
              created_at
       FROM users ORDER BY created_at ASC`,
    )
    const users = result.rows.map((row) => ({
      id: row.id,
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      isActive: row.is_active,
      hasPassword: row.has_password,
      createdAt: row.created_at,
    }))
    return NextResponse.json({ users })
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/users — add a user (admin only)
// Body: { email, fullName, role, password }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    const body = await request.json()
    const { email, fullName, role = 'user', password } = body as {
      email: string
      fullName?: string
      role?: string
      password: string
    }

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
    }
    if (!password || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 },
      )
    }

    const hash = await bcrypt.hash(password, 10)
    const result = await query(
      `INSERT INTO users (email, full_name, role, password_hash)
       VALUES (lower($1), $2, $3, $4)
       ON CONFLICT (email) DO NOTHING
       RETURNING id`,
      [email, fullName || null, role === 'admin' ? 'admin' : 'user', hash],
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 })
    }

    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error) {
    console.error('Failed to create user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
