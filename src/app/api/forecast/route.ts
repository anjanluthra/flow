import { NextRequest, NextResponse } from 'next/server'
import { getAnnualActuals, getForecasts, upsertForecast } from '@/lib/db'

type Holder = 'anjan' | 'kate' | 'joint'

// ---------------------------------------------------------------------------
// GET /api/forecast?year=&holder=
//   Per-month actual income/expense (from transactions) plus any saved
//   forecasts. The annual view blends these: elapsed months use actuals,
//   remaining months use forecasts.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const now = new Date()
    const year = sp.get('year') ? parseInt(sp.get('year')!, 10) : now.getFullYear()
    const holderParam = sp.get('holder')
    const holder: Holder | undefined =
      holderParam === 'anjan' || holderParam === 'kate' || holderParam === 'joint'
        ? holderParam
        : undefined

    const actualsResult = await getAnnualActuals(year, holder)
    const actuals = new Map<number, { income: number; expense: number; investment: number }>()
    for (let m = 1; m <= 12; m++) actuals.set(m, { income: 0, expense: 0, investment: 0 })
    for (const row of actualsResult.rows) {
      const m = Number(row.month)
      const amount = Math.abs(parseFloat(row.total_usd))
      const bucket = actuals.get(m)!
      if (row.type === 'income') bucket.income += amount
      else if (row.type === 'expense') bucket.expense += amount
      else if (row.type === 'investment') bucket.investment += amount
    }

    const forecastResult = await getForecasts(year)
    const forecasts = new Map<number, { income: number; expense: number; investment: number }>()
    for (const row of forecastResult.rows) {
      forecasts.set(Number(row.month), {
        income: parseFloat(row.forecast_income_usd),
        expense: parseFloat(row.forecast_expense_usd),
        investment: parseFloat(row.forecast_investment_usd ?? '0'),
      })
    }

    const months = Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const a = actuals.get(m)!
      const f = forecasts.get(m)
      const hasActuals = a.income > 0 || a.expense > 0 || a.investment > 0
      return {
        month: m,
        actualIncome: Math.round(a.income),
        actualExpense: Math.round(a.expense),
        actualInvestment: Math.round(a.investment),
        hasActuals,
        forecastIncome: f ? Math.round(f.income) : null,
        forecastExpense: f ? Math.round(f.expense) : null,
        forecastInvestment: f ? Math.round(f.investment) : null,
      }
    })

    return NextResponse.json({ year, months })
  } catch (error) {
    console.error('Failed to fetch forecast:', error)
    return NextResponse.json({ error: 'Failed to fetch forecast' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/forecast — upsert one month's forecast
// Body: { year, month, forecastIncome, forecastExpense, notes? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { year, month, forecastIncome, forecastExpense, forecastInvestment, notes } = body as {
      year: number
      month: number
      forecastIncome: number
      forecastExpense: number
      forecastInvestment?: number
      notes?: string
    }

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json(
        { error: 'year and month (1-12) are required' },
        { status: 400 },
      )
    }

    await upsertForecast(
      year,
      month,
      forecastIncome ?? 0,
      forecastExpense ?? 0,
      forecastInvestment ?? 0,
      notes,
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save forecast:', error)
    return NextResponse.json({ error: 'Failed to save forecast' }, { status: 500 })
  }
}
