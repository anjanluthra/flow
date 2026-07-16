import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const ASSET_CLASS_MAP: Record<string, string> = {
  cash: 'Cash',
  equities: 'Equities',
  private_equity: 'Private Equity',
  private_debt: 'Private Debt',
  crypto: 'Crypto',
  car: 'Car',
  debt: 'Debt',
}

// Investable asset classes — everything on the balance sheet that counts as a
// portfolio holding (i.e. not plain cash, cars or debt).
const INVESTABLE = ['equities', 'private_equity', 'private_debt', 'crypto']

// ---------------------------------------------------------------------------
// GET /api/investments — the portfolio, derived from the Net Worth balance
// sheet. Each investable account's latest balance snapshot is a position, so
// what you enter on the Net Worth page is the single source of truth.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await query(
      `SELECT a.id, a.name, a.institution, a.currency, a.asset_class,
              bs.balance_local, bs.balance_usd, bs.annual_cashflow,
              bs.yield_percent, bs.snapshot_date
       FROM accounts a
       LEFT JOIN LATERAL (
         SELECT balance_local, balance_usd, annual_cashflow, yield_percent, snapshot_date
         FROM balance_snapshots b
         WHERE b.account_id = a.id
         ORDER BY snapshot_date DESC
         LIMIT 1
       ) bs ON true
       WHERE a.is_active = true
         AND a.asset_class = ANY($1)
       ORDER BY bs.balance_usd DESC NULLS LAST`,
      [INVESTABLE],
    )

    const investments = result.rows.map((row) => {
      const currentValueUsd = row.balance_usd != null ? parseFloat(row.balance_usd) : 0
      const annualCashflowUsd = row.annual_cashflow != null ? parseFloat(row.annual_cashflow) : 0
      const yieldPct =
        row.yield_percent != null
          ? parseFloat(row.yield_percent)
          : currentValueUsd > 0
            ? (annualCashflowUsd / currentValueUsd) * 100
            : null
      return {
        id: row.id,
        name: row.name,
        accountName: row.institution ?? null,
        assetClass: ASSET_CLASS_MAP[row.asset_class] || row.asset_class,
        currency: row.currency,
        balanceLocal: row.balance_local != null ? parseFloat(row.balance_local) : null,
        currentValueUsd,
        annualCashflowUsd,
        yieldPct,
        snapshotDate: row.snapshot_date,
      }
    })

    return NextResponse.json({ investments })
  } catch (error) {
    console.error('Failed to fetch investments:', error)
    return NextResponse.json({ error: 'Failed to fetch investments' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/investments — add a position
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      name,
      assetClass = 'equities',
      currency = 'USD',
      units = null,
      costBasisLocal = 0,
      costBasisUsd = 0,
      currentValueUsd = 0,
      annualCashflowUsd = 0,
      purchaseDate = null,
      notes = null,
    } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO investments
         (name, asset_class, currency, units, cost_basis_local, cost_basis_usd,
          current_value_usd, annual_cashflow_usd, purchase_date, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [name, assetClass, currency, units, costBasisLocal, costBasisUsd,
        currentValueUsd, annualCashflowUsd, purchaseDate, notes],
    )

    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error) {
    console.error('Failed to create investment:', error)
    return NextResponse.json({ error: 'Failed to create investment' }, { status: 500 })
  }
}
