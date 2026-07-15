import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/accounts/merge — combine duplicate accounts into one.
// Body: { sourceIds: string[], targetId: string }
// Moves every transaction, balance snapshot and archived document from the
// sources to the target, then deletes the source accounts. Used to clean up
// duplicates like "FAB iSavings" + "FAB iSavings Account".
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
    const sources = sourceIds.filter((id) => id && id !== targetId)
    if (sources.length === 0) {
      return NextResponse.json({ error: 'Pick at least one account to merge into the target' }, { status: 400 })
    }

    // Transactions → target.
    const moved = await query(
      `UPDATE transactions SET account_id = $1 WHERE account_id = ANY($2::uuid[])`,
      [targetId, sources],
    )

    // Balance snapshots → target, dropping any that would collide on date.
    try {
      await query(
        `DELETE FROM balance_snapshots s
         WHERE s.account_id = ANY($2::uuid[])
           AND EXISTS (
             SELECT 1 FROM balance_snapshots t
             WHERE t.account_id = $1 AND t.snapshot_date = s.snapshot_date
           )`,
        [targetId, sources],
      )
      await query(
        `UPDATE balance_snapshots SET account_id = $1 WHERE account_id = ANY($2::uuid[])`,
        [targetId, sources],
      )
    } catch {
      /* best-effort */
    }

    // Archived statements → target.
    try {
      await query(`UPDATE documents SET account_id = $1 WHERE account_id = ANY($2::uuid[])`, [targetId, sources])
    } catch {
      /* documents table may not exist */
    }

    // Remove the now-empty source accounts (cascades their learned hints).
    await query(`DELETE FROM accounts WHERE id = ANY($1::uuid[])`, [sources])

    return NextResponse.json({ success: true, targetId, merged: sources.length, transactionsMoved: moved.rowCount ?? 0 })
  } catch (error) {
    console.error('Failed to merge accounts:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to merge accounts: ${detail}` }, { status: 500 })
  }
}
