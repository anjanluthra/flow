import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const HOLDER_MAP: Record<string, string> = {
  anjan: 'Anjan',
  kate: 'Kate',
  joint: 'Joint',
}

// Columns a client may edit, mapped to their DB column names.
const EDITABLE: Record<string, string> = {
  name: 'name',
  institution: 'institution',
  country: 'country',
  currency: 'currency',
  holder: 'holder',
  assetClass: 'asset_class',
  liquidityTier: 'liquidity_tier',
  isCorporate: 'is_corporate',
}

// ---------------------------------------------------------------------------
// GET /api/accounts — active accounts (real DB rows with UUIDs)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const withCounts = new URL(request.url).searchParams.get('counts') === '1'
    const result = await query(
      `SELECT id, name, institution, country, currency, holder,
              asset_class, liquidity_tier, is_corporate
       FROM accounts
       WHERE is_active = true
       ORDER BY is_corporate ASC, name ASC`,
    )

    let txCount: Record<string, number> = {}
    if (withCounts) {
      try {
        const c = await query(
          `SELECT account_id, COUNT(*)::int AS n FROM transactions WHERE account_id IS NOT NULL GROUP BY account_id`,
        )
        txCount = Object.fromEntries(c.rows.map((r) => [r.account_id, Number(r.n)]))
      } catch {
        /* ignore */
      }
    }

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
      ...(withCounts ? { txCount: txCount[row.id] ?? 0 } : {}),
    }))

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Failed to fetch accounts:', error)
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/accounts?id= — remove an account. Its transactions become
// Unassigned (FK ON DELETE SET NULL); balance snapshots are removed.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const id = new URL(request.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await query(`DELETE FROM accounts WHERE id = $1`, [id])
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('Failed to delete account:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to delete account: ${detail}` }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/accounts — edit an account's metadata (country, currency, holder,
// asset class, liquidity, corporate flag, name). Body: { id, ...fields }.
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = body.id
    if (!id || typeof id !== 'string') {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const sets: string[] = []
    const values: unknown[] = []
    let n = 1
    for (const [key, col] of Object.entries(EDITABLE)) {
      if (key in body && body[key] !== undefined) {
        sets.push(`${col} = $${n++}`)
        values.push(body[key])
      }
    }
    if (!sets.length) {
      return NextResponse.json({ error: 'no editable fields provided' }, { status: 400 })
    }
    values.push(id)

    await query(`UPDATE accounts SET ${sets.join(', ')} WHERE id = $${n}`, values)
    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('Failed to update account:', error)
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 })
  }
}
