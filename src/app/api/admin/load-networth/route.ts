import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/admin/load-networth — seed historical net-worth markers.
//
// These are approximate month-markers captured before Flow existed. 2024
// figures are GBP (converted to USD); 2025+ are already USD. Corporate =
// "Indexed cash balance". Stored in net_worth_snapshots so they appear on the
// progression chart. Idempotent (upsert by date).
// ---------------------------------------------------------------------------

const RATE_GBP_USD = 1.3231

// date, currency, total, personal, corporate
const HISTORY: Array<[string, 'GBP' | 'USD', number, number, number]> = [
  // 2024 — GBP (personal = personal cash + investments; corporate = business cash)
  ['2024-06-14', 'GBP', 252397, 225118, 27279],
  ['2024-06-29', 'GBP', 291003, 246603, 44400],
  ['2024-08-04', 'GBP', 296335, 240345, 55990],
  ['2024-09-03', 'GBP', 298732, 231593, 67139],
  ['2024-09-25', 'GBP', 274191, 198258, 75933],
  ['2024-10-19', 'GBP', 272067, 191444, 80623],
  ['2024-11-04', 'GBP', 423752, 335477, 88275],
  ['2024-11-21', 'GBP', 479339, 372589, 106750],
  ['2024-12-21', 'GBP', 495427, 380222, 115205],
  // 2025 / 2026 — USD (corporate = indexed cash balance; personal = total - corporate)
  ['2025-08-15', 'USD', 1113249, 1018541, 94708],
  ['2025-09-21', 'USD', 1182930, 1044752, 138178],
  ['2025-10-20', 'USD', 1228139, 1051371, 176768],
  ['2025-12-06', 'USD', 1188151, 1090267, 97884],
  ['2026-01-11', 'USD', 1198153, 1125561, 72592],
]

export async function POST() {
  try {
    let upserted = 0
    for (const [date, ccy, total, personal, corporate] of HISTORY) {
      const k = ccy === 'GBP' ? RATE_GBP_USD : 1
      const totalUsd = Math.round(total * k)
      const personalUsd = Math.round(personal * k)
      const corporateUsd = Math.round(corporate * k)
      await query(
        `INSERT INTO net_worth_snapshots (snapshot_date, total_net_worth_usd, data)
         VALUES ($1, $2, $3)
         ON CONFLICT (snapshot_date) DO UPDATE SET
           total_net_worth_usd = EXCLUDED.total_net_worth_usd,
           data = EXCLUDED.data`,
        [date, totalUsd, JSON.stringify({ personalNetWorth: personalUsd, corporateCash: corporateUsd })],
      )
      upserted++
    }
    return NextResponse.json({ success: true, upserted })
  } catch (error) {
    console.error('Failed to load net worth history:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to load net worth history: ${detail}` }, { status: 500 })
  }
}
