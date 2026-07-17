import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import bcrypt from 'bcryptjs'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { ensureUserInviteColumns, query } from '@/lib/db'

async function requireAdmin(): Promise<NextResponse | null> {
  const session = await getServerSession(authOptions)
  const role = (session?.user as { role?: string } | undefined)?.role
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  return null
}

// ---------------------------------------------------------------------------
// PATCH /api/users/[id] — update role / active state / reset password
// Body: { role?, isActive?, password? }
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin()
  if (denied) return denied

  try {
    await ensureUserInviteColumns()
    const { id } = await params
    const body = await request.json()

    const sets: string[] = []
    const values: unknown[] = []
    let i = 1

    if ('role' in body) {
      sets.push(`role = $${i++}`)
      values.push(body.role === 'admin' ? 'admin' : 'user')
    }
    if ('isActive' in body) {
      sets.push(`is_active = $${i++}`)
      values.push(Boolean(body.isActive))
    }
    if ('password' in body && body.password) {
      if (String(body.password).length < 8) {
        return NextResponse.json(
          { error: 'Password must be at least 8 characters' },
          { status: 400 },
        )
      }
      sets.push(`password_hash = $${i++}`)
      values.push(await bcrypt.hash(String(body.password), 10))
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    sets.push(`updated_at = now()`)
    values.push(id)
    await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${i}`, values)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update user:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}
