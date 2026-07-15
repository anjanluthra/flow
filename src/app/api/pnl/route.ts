import { NextRequest, NextResponse } from 'next/server'
import { getPnLByRange } from '@/lib/db'
import { getUsdRates } from '@/lib/fx'

// ---------------------------------------------------------------------------
// GET /api/pnl?from=YYYY-MM-DD&to=YYYY-MM-DD
//   A profit-and-loss statement for an arbitrary date range: income and
//   expense line items (rows) broken down by month (columns), with per-month
//   and grand totals, in BOTH USD and GBP. GBP uses each transaction's native
//   amount when recorded in GBP so it matches source sheets exactly.
// ---------------------------------------------------------------------------

interface Amt {
  usd: number
  gbp: number
}

interface Line {
  category: string
  color: string
  monthly: Record<string, Amt>
  total: Amt
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

const zero = (): Amt => ({ usd: 0, gbp: 0 })

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const from = sp.get('from')
    const to = sp.get('to')
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
    }

    // GBP rate is only used to convert non-GBP transactions; GBP-native rows
    // use their recorded amount and are unaffected.
    let gbpRate = 1.3231
    try {
      const fx = await getUsdRates()
      if (fx.rates?.GBP_USD && fx.rates.GBP_USD > 0) gbpRate = fx.rates.GBP_USD
    } catch {
      // fall back to the default rate
    }

    const months = monthsBetween(from, to)
    const result = await getPnLByRange(from, to, gbpRate)

    const income = new Map<string, Line>()
    const expense = new Map<string, Line>()
    const investing = new Map<string, Line>()

    for (const row of result.rows) {
      const bucket =
        row.type === 'income'
          ? income
          : row.type === 'expense'
            ? expense
            : row.category_name === 'Investments'
              ? investing
              : null
      if (!bucket) continue
      const name = row.category_name ?? 'Uncategorised'
      const usd = Math.abs(parseFloat(row.total_usd))
      const gbp = Math.abs(parseFloat(row.total_gbp))
      if (!bucket.has(name)) {
        bucket.set(name, { category: name, color: row.category_color ?? '#94A3B8', monthly: {}, total: zero() })
      }
      const line = bucket.get(name)!
      const cell = (line.monthly[row.ym] ??= zero())
      cell.usd += usd
      cell.gbp += gbp
      line.total.usd += usd
      line.total.gbp += gbp
    }

    const sortLines = (m: Map<string, Line>) =>
      Array.from(m.values()).sort((a, b) => b.total.usd - a.total.usd)
    const incomeLines = sortLines(income)
    const expenseLines = sortLines(expense)
    const investingLines = sortLines(investing)

    const sumByMonth = (lines: Line[]) => {
      const out: Record<string, Amt> = {}
      for (const ym of months) out[ym] = zero()
      for (const l of lines)
        for (const ym of months) {
          out[ym].usd += l.monthly[ym]?.usd ?? 0
          out[ym].gbp += l.monthly[ym]?.gbp ?? 0
        }
      return out
    }
    const sumTotal = (lines: Line[]) =>
      lines.reduce((a, l) => ({ usd: a.usd + l.total.usd, gbp: a.gbp + l.total.gbp }), zero())

    const incomeByMonth = sumByMonth(incomeLines)
    const expenseByMonth = sumByMonth(expenseLines)
    const investingByMonth = sumByMonth(investingLines)
    const incomeTotal = sumTotal(incomeLines)
    const expenseTotal = sumTotal(expenseLines)
    const investingTotal = sumTotal(investingLines)

    // Operating net = income − expenses (the P&L bottom line).
    const netByMonth: Record<string, Amt> = {}
    for (const ym of months) {
      netByMonth[ym] = {
        usd: incomeByMonth[ym].usd - expenseByMonth[ym].usd,
        gbp: incomeByMonth[ym].gbp - expenseByMonth[ym].gbp,
      }
    }
    const net: Amt = {
      usd: incomeTotal.usd - expenseTotal.usd,
      gbp: incomeTotal.gbp - expenseTotal.gbp,
    }

    // Net cash flow = operating net − cash deployed into investments. This is
    // the true movement in cash once investing outflows are taken out.
    const netCashByMonth: Record<string, Amt> = {}
    for (const ym of months) {
      netCashByMonth[ym] = {
        usd: netByMonth[ym].usd - investingByMonth[ym].usd,
        gbp: netByMonth[ym].gbp - investingByMonth[ym].gbp,
      }
    }
    const netCash: Amt = {
      usd: net.usd - investingTotal.usd,
      gbp: net.gbp - investingTotal.gbp,
    }
    const savingsRate = incomeTotal.usd > 0 ? (net.usd / incomeTotal.usd) * 100 : 0

    return NextResponse.json({
      from,
      to,
      months,
      gbpRate,
      income: incomeLines,
      expense: expenseLines,
      investing: investingLines,
      totals: {
        incomeByMonth,
        expenseByMonth,
        investingByMonth,
        netByMonth,
        netCashByMonth,
        incomeTotal,
        expenseTotal,
        investingTotal,
        net,
        netCash,
        savingsRate,
      },
    })
  } catch (error) {
    console.error('Failed to build P&L:', error)
    return NextResponse.json({ error: 'Failed to build P&L' }, { status: 500 })
  }
}
