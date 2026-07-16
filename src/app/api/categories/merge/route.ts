import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/categories/merge — consolidate several categories into one.
// Body: { sourceIds: string[], targetId: string }
// Reassigns every transaction and learned merchant mapping from the sources to
// the target, then deletes the (now empty) source categories. This is how the
// household collapses e.g. Hotels + Flights into a single Travel category —
// retroactively for past years and going forward.
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { sourceIds, targetId } = (await request.json()) as {
      sourceIds?: string[]
      targetId?: string
    }
    if (!targetId || !Array.isArray(sourceIds) || sourceIds.length === 0) {
      return NextResponse.json({ error: 'targetId and sourceIds are required' }, { status: 400 })
    }
    // Never delete the target even if it was also passed as a source.
    const sources = sourceIds.filter((id) => id && id !== targetId)
    if (sources.length === 0) {
      return NextResponse.json({ error: 'Pick at least one category to merge into the target' }, { status: 400 })
    }

    const moved = await query(
      `UPDATE transactions SET category_id = $1 WHERE category_id = ANY($2::uuid[])`,
      [targetId, sources],
    )

    // Repoint learned merchant mappings; merchant_pattern is globally unique so
    // this can't collide. If a pattern already points at the target, drop the
    // duplicate source mapping first.
    try {
      await query(
        `DELETE FROM merchant_mappings src
         WHERE src.category_id = ANY($2::uuid[])
           AND EXISTS (
             SELECT 1 FROM merchant_mappings tgt
             WHERE tgt.merchant_pattern = src.merchant_pattern AND tgt.category_id = $1
           )`,
        [targetId, sources],
      )
      await query(
        `UPDATE merchant_mappings SET category_id = $1 WHERE category_id = ANY($2::uuid[])`,
        [targetId, sources],
      )
    } catch {
      /* merchant_mappings may not exist */
    }

    await query(`DELETE FROM categories WHERE id = ANY($1::uuid[])`, [sources])

    return NextResponse.json({ success: true, targetId, merged: sources.length, transactionsMoved: moved.rowCount ?? 0 })
  } catch (error) {
    console.error('Failed to merge categories:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to merge categories: ${detail}` }, { status: 500 })
  }
}
