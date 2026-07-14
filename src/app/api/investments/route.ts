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

// ---------------------------------------------------------------------------
// GET /api/investments — active positions with metrics inputs
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await query(
      `SELECT i.*, a.name AS account_name
       FROM investments i
       LEFT JOIN accounts a ON i.account_id = a.id
       WHERE i.is_active = true
       ORDER BY i.current_value_usd DESC`,
    )

    const investments = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      accountName: row.account_name,
      assetClass: ASSET_CLASS_MAP[row.asset_class] || row.asset_class,
      currency: row.currency,
      units: row.units !== null ? parseFloat(row.units) : null,
      costBasisLocal: parseFloat(row.cost_basis_local),
      costBasisUsd: parseFloat(row.cost_basis_usd),
      currentValueUsd: parseFloat(row.current_value_usd),
      annualCashflowUsd: parseFloat(row.annual_cashflow_usd),
      purchaseDate: row.purchase_date,
      notes: row.notes,
    }))

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
