import { NextRequest, NextResponse } from 'next/server'
import { getCategories, ensureInvestmentType, setCategoryNonCore } from '@/lib/db'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// GET /api/categories — all categories (real DB rows with UUIDs).
// Pass ?counts=1 to include how many transactions use each category.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const withCounts = new URL(request.url).searchParams.get('counts') === '1'

    const result = await getCategories()

    let countByCat: Record<string, number> = {}
    if (withCounts) {
      try {
        const c = await query(
          `SELECT category_id, COUNT(*)::int AS n FROM transactions
           WHERE category_id IS NOT NULL GROUP BY category_id`,
        )
        countByCat = Object.fromEntries(c.rows.map((r) => [r.category_id, Number(r.n)]))
      } catch {
        /* ignore */
      }
    }

    const categories = result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type as 'income' | 'expense' | 'transfer' | 'investment',
      color: row.color_hex,
      iconName: row.icon_name,
      sortOrder: row.sort_order,
      nonCore: !!row.non_core,
      ...(withCounts ? { count: countByCat[row.id] ?? 0 } : {}),
    }))
    return NextResponse.json({ categories })
  } catch (error) {
    console.error('Failed to fetch categories:', error)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/categories — create (or ensure) a category by name.
// Body: { name, type?, colorHex?, iconName? }. Idempotent on name.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string
      type?: 'income' | 'expense' | 'transfer' | 'investment'
      colorHex?: string
      iconName?: string
    }
    const name = body.name?.trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })
    const type = body.type ?? 'expense'
    const color = body.colorHex ?? '#64748B'
    const icon = body.iconName ?? 'circle'

    // Make sure the 'investment' enum value exists before we try to use it.
    if (type === 'investment') await ensureInvestmentType()

    await query(
      `INSERT INTO categories (name, type, icon_name, color_hex, sort_order)
       VALUES ($1, $2::category_type, $3, $4, 500)
       ON CONFLICT (name) DO NOTHING`,
      [name, type, icon, color],
    )
    const row = await query(`SELECT id, name, type, color_hex, icon_name FROM categories WHERE name = $1`, [name])
    return NextResponse.json({ category: row.rows[0] ?? null })
  } catch (error) {
    console.error('Failed to create category:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to create category: ${detail}` }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/categories — update a category. Body: { id, name?, nonCore? }
//   name    — rename the category
//   nonCore — tag/untag it as a non-core (non-operating) expense
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const { id, name, nonCore } = (await request.json()) as {
      id?: string
      name?: string
      nonCore?: boolean
    }
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    if (name === undefined && nonCore === undefined) {
      return NextResponse.json({ error: 'name or nonCore is required' }, { status: 400 })
    }
    if (typeof nonCore === 'boolean') {
      await setCategoryNonCore(id, nonCore)
    }
    if (name !== undefined) {
      if (!name.trim()) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
      await query(`UPDATE categories SET name = $2 WHERE id = $1`, [id, name.trim()])
    }
    return NextResponse.json({ success: true, id, ...(name !== undefined ? { name: name.trim() } : {}), ...(nonCore !== undefined ? { nonCore } : {}) })
  } catch (error) {
    console.error('Failed to update category:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to update category: ${detail}` }, { status: 500 })
  }
}
