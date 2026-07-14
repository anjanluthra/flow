import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/admin/redate-balances — correct the "as of" date on the current
// balance sheet (the detailed per-account table). It moves the most-recent
// balance_snapshots date to the target date so it becomes the newest point
// everywhere (Home headline, top of Net Worth, and the graph).
//
// Historic net-worth graph markers (net_worth_snapshots) are NOT touched — the
// historical data the user supplied stays as the line's history.
//
// Body: { to?: 'YYYY-MM-DD' }  (defaults to 2026-06-01)
// ---------------------------------------------------------------------------

const DEFAULT_TO = '2026-06-01'

export async function POST(request: NextRequest) {
  try {
    let to = DEFAULT_TO
    try {
      const body = (await request.json()) as { to?: string }
      if (body?.to) to = body.to
    } catch {
      /* empty body — use default */
    }

    const maxRes = await query(`SELECT MAX(snapshot_date) AS d FROM balance_snapshots`)
    const raw = maxRes.rows[0]?.d
    if (!raw) {
      return NextResponse.json({ error: 'No balance-sheet snapshot found to re-date.' }, { status: 400 })
    }
    const from =
      typeof raw === 'string' ? raw.slice(0, 10) : new Date(raw as string).toISOString().slice(0, 10)

    if (from === to) {
      return NextResponse.json({ success: true, from, to, moved: 0, note: 'Already on the target date.' })
    }

    // Clear anything already sitting on the target date, then shift the rows.
    await query(`DELETE FROM balance_snapshots WHERE snapshot_date = $1`, [to])
    const upd = await query(
      `UPDATE balance_snapshots SET snapshot_date = $1 WHERE snapshot_date = $2`,
      [to, from],
    )

    return NextResponse.json({ success: true, from, to, moved: upd.rowCount ?? 0 })
  } catch (error) {
    console.error('Failed to re-date balances:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to re-date balances: ${detail}` }, { status: 500 })
  }
}
