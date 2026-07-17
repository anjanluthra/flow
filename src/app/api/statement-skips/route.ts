import { NextRequest, NextResponse } from 'next/server'
import { listStatementSkips, setStatementSkip } from '@/lib/db'

// ---------------------------------------------------------------------------
// GET  /api/statement-skips?year=YYYY — months marked "no statement expected".
// POST /api/statement-skips — { accountId, year, month, skip } to set/clear one.
// Lets the coverage grid tell a real gap from a legitimately empty month.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const year = Number(request.nextUrl.searchParams.get('year')) || new Date().getFullYear()
    const res = await listStatementSkips(year)
    return NextResponse.json({ skips: res.rows.map((r) => ({ accountId: r.account_id, month: r.month })) })
  } catch (error) {
    console.error('Failed to list statement skips:', error)
    return NextResponse.json({ error: 'Failed to list statement skips' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accountId, year, month, skip } = (await request.json()) as {
      accountId?: string
      year?: number
      month?: number
      skip?: boolean
    }
    if (!accountId || !year || !month) {
      return NextResponse.json({ error: 'accountId, year and month are required' }, { status: 400 })
    }
    await setStatementSkip(accountId, year, month, skip !== false)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set statement skip:', error)
    return NextResponse.json({ error: 'Failed to set statement skip' }, { status: 500 })
  }
}
