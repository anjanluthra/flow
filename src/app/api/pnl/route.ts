import { NextRequest, NextResponse } from 'next/server'
import { getPnLByRange } from '@/lib/db'

// ---------------------------------------------------------------------------
// GET /api/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD
//   A profit-and-loss statement for an arbitrary date range: income and
//   expense line items (rows) broken down by month (columns), with per-month
//   and grand totals. Transfers are excluded.
// ---------------------------------------------------------------------------

interface Line {
  category: string
  color: string
  monthly: Record<string, number>
  total: number
}

function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  const start = new Date(from + 'T00:00:00Z')
  const end = new Date(to + 'T00:00:00Z')
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1))
  while (cur <= end) {
    months.push(`${cur.getUTCFullYear()}-${String(cur.getUTCMonth() + 1).padStart(2, '0')}`)
    cur.setUTCMonth(cur.getUTCMonth() + 1)
  }
  return months
}

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const from = sp.get('from')
    const to = sp.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
    }

    const months = monthsBetween(from, to)
    const result = await getPnLByRange(from, to)

    const income = new Map<string, Line>()
    const expense = new Map<string, Line>()

    for (const row of result.rows) {
      const bucket = row.type === 'income' ? income : row.type === 'expense' ? expense : null
      if (!bucket) continue
      const name = row.category_name ?? 'Uncategorised'
      const amount = Math.abs(parseFloat(row.total_usd))
      if (!bucket.has(name)) {
        bucket.set(name, {
          category: name,
          color: row.category_color ?? '#94A3B8',
          monthly: {},
          total: 0,
        })
      }
      const line = bucket.get(name)!
      line.monthly[row.ym] = (line.monthly[row.ym] ?? 0) + amount
      line.total += amount
    }

    const sortLines = (m: Map<string, Line>) =>
      Array.from(m.values()).sort((a, b) => b.total - a.total)
    const incomeLines = sortLines(income)
    const expenseLines = sortLines(expense)

    const sumByMonth = (lines: Line[]) => {
      const out: Record<string, number> = {}
      for (const ym of months) out[ym] = 0
      for (const l of lines) for (const ym of months) out[ym] += l.monthly[ym] ?? 0
      return out
    }
    const incomeByMonth = sumByMonth(incomeLines)
    const expenseByMonth = sumByMonth(expenseLines)
    const incomeTotal = incomeLines.reduce((s, l) => s + l.total, 0)
    const expenseTotal = expenseLines.reduce((s, l) => s + l.total, 0)

    const netByMonth: Record<string, number> = {}
    for (const ym of months) netByMonth[ym] = incomeByMonth[ym] - expenseByMonth[ym]
    const net = incomeTotal - expenseTotal
    const savingsRate = incomeTotal > 0 ? (net / incomeTotal) * 100 : 0

    return NextResponse.json({
      from,
      to,
      months,
      income: incomeLines,
      expense: expenseLines,
      totals: {
        incomeByMonth,
        expenseByMonth,
        netByMonth,
        incomeTotal,
        expenseTotal,
        net,
        savingsRate,
      },
    })
  } catch (error) {
    console.error('Failed to build P&L:', error)
    return NextResponse.json({ error: 'Failed to build P&L' }, { status: 500 })
  }
}
