import { query } from '@/lib/db'
import {
  getMonthlyPnL,
  getAnnualActuals,
  getTransactions,
  getForecasts,
} from '@/lib/db'

// ---------------------------------------------------------------------------
// Finance context for the in-app Claude assistant.
//
// Assembles a compact, factual snapshot of the household's finances —
// net-worth balance sheet, this-month P&L, the year-to-date trend, recent
// transactions and any forecasts — as markdown that we hand to Claude as
// grounding. Everything is already converted to USD in the database; we note
// local-currency balances too so Claude can answer in GBP when asked.
// ---------------------------------------------------------------------------

function usd(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}$${abs}`
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export async function buildFinanceContext(): Promise<string> {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const [balances, pnl, annual, txns, forecasts] = await Promise.all([
    // Latest balance per active account.
    query(`
      SELECT a.name, a.institution, a.currency, a.holder, a.asset_class,
             a.is_corporate, bs.balance_local, bs.balance_usd, bs.snapshot_date
      FROM accounts a
      LEFT JOIN LATERAL (
        SELECT balance_local, balance_usd, snapshot_date
        FROM balance_snapshots b
        WHERE b.account_id = a.id
        ORDER BY snapshot_date DESC
        LIMIT 1
      ) bs ON true
      WHERE a.is_active = true
      ORDER BY bs.balance_usd DESC NULLS LAST
    `),
    getMonthlyPnL(year, month),
    getAnnualActuals(year),
    getTransactions({ limit: 12 }),
    getForecasts(year),
  ])

  const lines: string[] = []

  // --- Net worth / balance sheet ---
  lines.push('## Net worth (latest balance per account)')
  let total = 0
  let personal = 0
  let corporate = 0
  for (const r of balances.rows) {
    const bUsd = r.balance_usd != null ? parseFloat(r.balance_usd) : null
    if (bUsd != null) {
      total += bUsd
      if (r.is_corporate) corporate += bUsd
      else personal += bUsd
    }
    const local =
      r.balance_local != null
        ? ` (${Number(r.balance_local).toLocaleString('en-US')} ${r.currency})`
        : ''
    lines.push(
      `- ${r.name} [${r.asset_class}, ${r.holder}${r.is_corporate ? ', corporate' : ''}]: ` +
        `${bUsd != null ? usd(bUsd) : 'no balance recorded'}${local}`,
    )
  }
  lines.push('')
  lines.push(
    `Total net worth: ${usd(total)} — personal ${usd(personal)}, corporate ${usd(corporate)}.`,
  )
  lines.push('')

  // --- This month P&L ---
  let income = 0
  let spending = 0
  const catSpend: Record<string, number> = {}
  for (const row of pnl.rows) {
    const amt = Math.abs(parseFloat(row.total_usd))
    if (row.type === 'income') income += amt
    else if (row.type === 'expense') {
      spending += amt
      const name = row.category_name ?? 'Uncategorised'
      catSpend[name] = (catSpend[name] ?? 0) + amt
    }
  }
  const net = income - spending
  const savings = income > 0 ? (net / income) * 100 : 0
  lines.push(`## This month (${MONTHS[month - 1]} ${year})`)
  lines.push(
    `Income ${usd(income)}, spending ${usd(spending)}, net ${usd(net)}, savings rate ${savings.toFixed(1)}%.`,
  )
  const topCats = Object.entries(catSpend)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  if (topCats.length) {
    lines.push('Top spending categories this month:')
    for (const [name, amt] of topCats) lines.push(`- ${name}: ${usd(amt)}`)
  }
  lines.push('')

  // --- Year-to-date trend ---
  const trend = new Map<number, { income: number; expense: number }>()
  for (let m = 1; m <= 12; m++) trend.set(m, { income: 0, expense: 0 })
  for (const row of annual.rows) {
    const bucket = trend.get(Number(row.month))!
    const amt = Math.abs(parseFloat(row.total_usd))
    if (row.type === 'income') bucket.income += amt
    else if (row.type === 'expense') bucket.expense += amt
  }
  lines.push(`## ${year} by month (actuals, USD)`)
  let ytdIncome = 0
  let ytdSpend = 0
  for (const [m, v] of trend) {
    if (v.income === 0 && v.expense === 0) continue
    ytdIncome += v.income
    ytdSpend += v.expense
    lines.push(`- ${MONTHS[m - 1]}: income ${usd(v.income)}, spending ${usd(v.expense)}`)
  }
  lines.push(
    `YTD ${year}: income ${usd(ytdIncome)}, spending ${usd(ytdSpend)}, net ${usd(ytdIncome - ytdSpend)}.`,
  )
  lines.push('')

  // --- Forecasts ---
  if (forecasts.rows.length) {
    lines.push(`## ${year} forecasts (remaining/planned months)`)
    for (const f of forecasts.rows) {
      lines.push(
        `- ${MONTHS[Number(f.month) - 1]}: forecast income ${usd(Number(f.forecast_income_usd))}, ` +
          `forecast spending ${usd(Number(f.forecast_expense_usd))}` +
          (f.notes ? ` — ${f.notes}` : ''),
      )
    }
    lines.push('')
  }

  // --- Recent transactions (flavour only) ---
  lines.push('## 12 most recent transactions (a small sample — use the search_transactions / spending_breakdown tools for any totals, merchants or historical periods)')
  for (const t of txns.rows) {
    const amt = t.amount_usd != null ? usd(parseFloat(t.amount_usd)) : `${t.amount_local} ${t.currency}`
    const date = new Date(t.date).toISOString().slice(0, 10)
    lines.push(
      `- ${date} | ${t.description} | ${amt} | ${t.category_name ?? 'Uncategorised'} | ${t.account_name ?? '—'} | ${t.type}`,
    )
  }

  return lines.join('\n')
}
