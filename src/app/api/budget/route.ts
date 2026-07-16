import { NextRequest, NextResponse } from 'next/server'
import { getBudget, upsertBudget } from '@/lib/db'

// ---------------------------------------------------------------------------
// GET /api/budget?year= — the year's operating-expense budget (USD), or null.
// POST /api/budget { year, expenseBudget } — set it.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const now = new Date()
    const year = sp.get('year') ? parseInt(sp.get('year')!, 10) : now.getFullYear()
    const expenseBudget = await getBudget(year)
    return NextResponse.json({ year, expenseBudget })
  } catch (error) {
    console.error('Failed to fetch budget:', error)
    return NextResponse.json({ error: 'Failed to fetch budget' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { year, expenseBudget } = (await request.json()) as { year: number; expenseBudget: number }
    if (!year) {
      return NextResponse.json({ error: 'year is required' }, { status: 400 })
    }
    await upsertBudget(year, Number(expenseBudget) || 0)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save budget:', error)
    return NextResponse.json({ error: 'Failed to save budget' }, { status: 500 })
  }
}
