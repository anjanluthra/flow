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
// GET /api/snapshots/[date] — full account balances for a specific date
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ date: string }> }
) {
  try {
    const { date } = await params

    const result = await query(
      `SELECT
        a.id            AS account_id,
        a.name,
        a.institution,
        a.country,
        a.currency,
        a.holder,
        a.asset_class,
        a.liquidity_tier,
        a.is_corporate,
        COALESCE(bs.balance_local, 0)   AS balance_local,
        COALESCE(bs.balance_usd, 0)     AS balance_usd,
        COALESCE(bs.yield_percent, 0)   AS yield_percent,
        COALESCE(bs.annual_cashflow, 0) AS annual_cashflow
      FROM accounts a
      LEFT JOIN balance_snapshots bs
        ON a.id = bs.account_id AND bs.snapshot_date = $1
      WHERE a.is_active = true
      ORDER BY a.is_corporate ASC, a.name ASC`,
      [date]
    )

    const accounts = result.rows.map((row) => ({
      accountId: row.account_id,
      name: row.name,
      institution: row.institution,
      country: row.country,
      currency: row.currency,
      holder: HOLDER_MAP[row.holder] || row.holder,
      assetClass: ASSET_CLASS_MAP[row.asset_class] || row.asset_class,
      liquidity: LIQUIDITY_MAP[row.liquidity_tier] || row.liquidity_tier,
      isCorporate: row.is_corporate,
      balanceLocal: parseFloat(row.balance_local),
      balanceUsd: parseFloat(row.balance_usd),
      yieldPercent: parseFloat(row.yield_percent),
      annualCashflow: parseFloat(row.annual_cashflow),
    }))

    return NextResponse.json({ date, accounts })
  } catch (error) {
    console.error('Failed to fetch snapshot:', error)
    return NextResponse.json(
      { error: 'Failed to fetch snapshot' },
      { status: 500 }
    )
  }
}
