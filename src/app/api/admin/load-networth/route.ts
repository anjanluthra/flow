import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'
import history from '@/data/networth-history.json'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/admin/load-networth — seed historical net-worth markers with their
// full line-item breakdown. 2024 figures are GBP (converted to USD); 2025+ are
// already USD. Stored in net_worth_snapshots (data.lines holds the drill-down).
// Idempotent (upsert by date).
// ---------------------------------------------------------------------------

const RATE_GBP_USD = 1.3231

interface Line {
  group: string
  label: string
  amount: number
}
interface Snap {
  date: string
  ccy: 'GBP' | 'USD'
  total: number
  personal: number
  corporate: number
  lines: Line[]
}

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    let upserted = 0
    for (const s of history as Snap[]) {
      const k = s.ccy === 'GBP' ? RATE_GBP_USD : 1
      const usd = (n: number) => Math.round(n * k)
      const lines = s.lines.map((l) => ({ group: l.group, label: l.label, amountUsd: usd(l.amount) }))
      await query(
        `INSERT INTO net_worth_snapshots (snapshot_date, total_net_worth_usd, data)
         VALUES ($1, $2, $3)
         ON CONFLICT (snapshot_date) DO UPDATE SET
           total_net_worth_usd = EXCLUDED.total_net_worth_usd,
           data = EXCLUDED.data`,
        [
          s.date,
          usd(s.total),
          JSON.stringify({
            personalNetWorth: usd(s.personal),
            corporateCash: usd(s.corporate),
            currency: s.ccy,
            source: 'historical',
            lines,
          }),
        ],
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
