import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

const HOLDER_MAP: Record<string, string> = {
  anjan: 'Anjan',
  kate: 'Kate',
  joint: 'Joint',
}

// ---------------------------------------------------------------------------
// GET /api/accounts — active accounts (real DB rows with UUIDs)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await query(
      `SELECT id, name, institution, country, currency, holder,
              asset_class, liquidity_tier, is_corporate
       FROM accounts
       WHERE is_active = true
       ORDER BY is_corporate ASC, name ASC`,
    )

    const accounts = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      institution: row.institution,
      country: row.country,
      currency: row.currency,
      holder: row.holder as 'anjan' | 'kate' | 'joint',
      holderLabel: HOLDER_MAP[row.holder] || row.holder,
      assetClass: row.asset_class,
      liquidityTier: row.liquidity_tier,
      isCorporate: row.is_corporate,
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}
