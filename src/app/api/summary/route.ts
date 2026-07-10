import { NextRequest, NextResponse } from 'next/server'
import { getMonthlyPnL, getAnnualActuals } from '@/lib/db'

type Holder = 'anjan' | 'kate' | 'joint'

interface CategoryTotal {
  name: string
  color: string
  amount: number
}

interface PnLTotals {
  income: number
  spending: number
  net: number
  savingsRate: number
  byCategory: CategoryTotal[]
  byIncome: CategoryTotal[]
}

async function monthTotals(
  year: number,
  month: number,
  holder?: Holder,
): Promise<PnLTotals> {
  const result = await getMonthlyPnL(year, month, holder)

  let income = 0
  let spending = 0
  const byCategory: CategoryTotal[] = []
  const byIncome: CategoryTotal[] = []

  for (const row of result.rows) {
    const amount = Math.abs(parseFloat(row.total_usd))
    const entry: CategoryTotal = {
      name: row.category_name ?? 'Uncategorised',
      color: row.category_color ?? '#94A3B8',
      amount,
    }
    if (row.type === 'income') {
      income += amount
      byIncome.push(entry)
    } else if (row.type === 'expense') {
      spending += amount
      byCategory.push(entry)
    }
  }

  byCategory.sort((a, b) => b.amount - a.amount)
  byIncome.sort((a, b) => b.amount - a.amount)

  const net = income - spending
  const savingsRate = income > 0 ? (net / income) * 100 : 0

  return { income, spending, net, savingsRate, byCategory, byIncome }
}

// ---------------------------------------------------------------------------
// GET /api/summary?year=&month=&holder=
//   Monthly P&L for the dashboard: totals, change vs previous month,
//   category/income breakdowns, and a per-month income-vs-expense trend.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const now = new Date()
    const year = sp.get('year') ? parseInt(sp.get('year')!, 10) : now.getFullYear()
    const month = sp.get('month')
      ? parseInt(sp.get('month')!, 10)
      : now.getMonth() + 1
    const holderParam = sp.get('holder')
    const holder =
      holderParam === 'anjan' || holderParam === 'kate' || holderParam === 'joint'
        ? holderParam
        : undefined

    const current = await monthTotals(year, month, holder)

    // Previous month (wrapping to December of the prior year).
    const prevYear = month === 1 ? year - 1 : year
    const prevMonth = month === 1 ? 12 : month - 1
    const previous = await monthTotals(prevYear, prevMonth, holder)

    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : undefined

    // Per-month income & expense for the whole year (for the trend chart).
    const annual = await getAnnualActuals(year, holder)
    const trendMap = new Map<number, { income: number; expense: number }>()
    for (let m = 1; m <= 12; m++) trendMap.set(m, { income: 0, expense: 0 })
    for (const row of annual.rows) {
      const m = Number(row.month)
      const amount = Math.abs(parseFloat(row.total_usd))
      const bucket = trendMap.get(m)!
      if (row.type === 'income') bucket.income += amount
      else if (row.type === 'expense') bucket.expense += amount
    }
    const trend = Array.from(trendMap.entries()).map(([m, v]) => ({
      month: m,
      income: Math.round(v.income),
      expense: Math.round(v.expense),
    }))

    return NextResponse.json({
      year,
      month,
      current,
      change: {
        income: pctChange(current.income, previous.income),
        spending: pctChange(current.spending, previous.spending),
      },
      trend,
    })
  } catch (error) {
    console.error('Failed to build summary:', error)
    return NextResponse.json({ error: 'Failed to build summary' }, { status: 500 })
  }
}
