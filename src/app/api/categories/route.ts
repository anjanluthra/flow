import { NextResponse } from 'next/server'
import { getCategories } from '@/lib/db'

// ---------------------------------------------------------------------------
// GET /api/categories — all categories (real DB rows with UUIDs)
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await getCategories()
    const categories = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as 'income' | 'expense' | 'transfer',
      color: row.color_hex,
      iconName: row.icon_name,
      sortOrder: row.sort_order,
    }))
    return NextResponse.json({ categories })
  } catch (error) {
    console.error('Failed to fetch categories:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}
