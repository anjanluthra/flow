import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// PATCH /api/investments/[id] — update position values
// ---------------------------------------------------------------------------

const COLUMN_MAP: Record<string, string> = {
  name: 'name',
  assetClass: 'asset_class',
  currency: 'currency',
  units: 'units',
  costBasisLocal: 'cost_basis_local',
  costBasisUsd: 'cost_basis_usd',
  currentValueUsd: 'current_value_usd',
  annualCashflowUsd: 'annual_cashflow_usd',
  purchaseDate: 'purchase_date',
  notes: 'notes',
  isActive: 'is_active',
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await request.json()

    const sets: string[] = []
    const values: unknown[] = []
    let i = 1

    for (const [key, col] of Object.entries(COLUMN_MAP)) {
      if (key in body) {
        sets.push(`${col} = $${i++}`)
        values.push(body[key])
      }
    }

    if (sets.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    sets.push(`updated_at = now()`)
    values.push(id)
    await query(`UPDATE investments SET ${sets.join(', ')} WHERE id = $${i}`, values)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update investment:', error)
    return NextResponse.json({ error: 'Failed to update investment' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/investments/[id] — soft-delete (keeps history)
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await query(`UPDATE investments SET is_active = false WHERE id = $1`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete investment:', error)
    return NextResponse.json({ error: 'Failed to delete investment' }, { status: 500 })
  }
}
