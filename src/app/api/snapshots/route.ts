import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// Enum → display mappings
// ---------------------------------------------------------------------------

const HOLDER_MAP: Record<string, string> = {
  anjan: 'Anjan',
  kate: 'Kate',
  joint: 'Joint',
}

const ASSET_CLASS_MAP: Record<string, string> = {
  cash: 'Cash',
  equities: 'Equities',
  private_equity: 'Private Equity',
  private_debt: 'Private Debt',
  crypto: 'Crypto',
  car: 'Car',
  debt: 'Debt',
}

const LIQUIDITY_MAP: Record<string, string> = {
  t1_instant: 'T1',
  t2_days: 'T2',
  t2_5_locked: 'T2.5',
  t3_locked_years: 'T3',
}

// ---------------------------------------------------------------------------
// GET /api/snapshots — list available snapshot dates with summaries
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await query(`
      SELECT
        bs.snapshot_date,
        SUM(COALESCE(bs.balance_usd, 0)) AS total_net_worth,
        SUM(CASE WHEN a.is_corporate = false THEN COALESCE(bs.balance_usd, 0) ELSE 0 END) AS personal_net_worth,
        SUM(CASE WHEN a.is_corporate = true  THEN COALESCE(bs.balance_usd, 0) ELSE 0 END) AS corporate_cash
      FROM balance_snapshots bs
      JOIN accounts a ON bs.account_id = a.id
      WHERE a.is_active = true
      GROUP BY bs.snapshot_date
      ORDER BY bs.snapshot_date DESC
    `)

    const snapshots = result.rows.map((row) => ({
      date: row.snapshot_date,
      totalNetWorth: parseFloat(row.total_net_worth),
      personalNetWorth: parseFloat(row.personal_net_worth),
      corporateCash: parseFloat(row.corporate_cash),
    }))

    return NextResponse.json({ snapshots })
  } catch (error) {
    console.error('Failed to fetch snapshots:', error)
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/snapshots — save a balance snapshot for a given date
// Body: { date: string, balances: Array<{ accountId, balanceLocal, balanceUsd, yieldPercent, annualCashflow }> }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, balances } = body as {
      date: string
      balances: Array<{
        accountId: string
        balanceLocal: number
        balanceUsd: number
        yieldPercent: number
        annualCashflow: number
      }>
    }

    if (!date || !balances?.length) {
      return NextResponse.json({ error: 'date and balances are required' }, { status: 400 })
    }

    // Upsert each balance snapshot
    for (const b of balances) {
      await query(
        `INSERT INTO balance_snapshots (account_id, balance_local, balance_usd, snapshot_date, yield_percent, annual_cashflow)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (account_id, snapshot_date)
         DO UPDATE SET
           balance_local   = EXCLUDED.balance_local,
           balance_usd     = EXCLUDED.balance_usd,
           yield_percent   = EXCLUDED.yield_percent,
           annual_cashflow = EXCLUDED.annual_cashflow`,
        [b.accountId, b.balanceLocal, b.balanceUsd, date, b.yieldPercent, b.annualCashflow]
      )
    }

    // Also upsert the net_worth_snapshots summary row
    const totalNetWorth = balances.reduce((s, b) => s + b.balanceUsd, 0)

    // Fetch accounts to compute personal vs corporate breakdown
    const accountsResult = await query(
      `SELECT id, is_corporate FROM accounts WHERE is_active = true`
    )
    const corporateIds = new Set(
      accountsResult.rows.filter((r) => r.is_corporate).map((r) => r.id)
    )
    const personalTotal = balances
      .filter((b) => !corporateIds.has(b.accountId))
      .reduce((s, b) => s + b.balanceUsd, 0)
    const corporateTotal = balances
      .filter((b) => corporateIds.has(b.accountId))
      .reduce((s, b) => s + b.balanceUsd, 0)

    await query(
      `INSERT INTO net_worth_snapshots (snapshot_date, total_net_worth_usd, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (snapshot_date)
       DO UPDATE SET
         total_net_worth_usd = EXCLUDED.total_net_worth_usd,
         data = EXCLUDED.data`,
      [
        date,
        totalNetWorth,
        JSON.stringify({
          personalNetWorth: personalTotal,
          corporateCash: corporateTotal,
        }),
      ]
    )

    return NextResponse.json({ success: true, date, totalNetWorth })
  } catch (error) {
    console.error('Failed to save snapshot:', error)
    return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 })
  }
}
