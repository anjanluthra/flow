import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// Enum → display mappings
// ---------------------------------------------------------------------------

const HOLDER_MAP: Record<string, string> = {
  anjan: 'Anjan',
  kate: 'Kate',
  joint: 'Joint',
}

const ASSET_CLASS_MAP: Record<string, string> = {
  cash: 'Cash',
  equities: 'Equities',
  private_equity: 'Private Equity',
  private_debt: 'Private Debt',
  crypto: 'Crypto',
  car: 'Car',
  debt: 'Debt',
}

const LIQUIDITY_MAP: Record<string, string> = {
  t1_instant: 'T1',
  t2_days: 'T2',
  t2_5_locked: 'T2.5',
  t3_locked_years: 'T3',
}

// ---------------------------------------------------------------------------
// GET /api/snapshots — list available snapshot dates with summaries
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await query(`
      SELECT
        bs.snapshot_date,
        SUM(COALESCE(bs.balance_usd, 0)) AS total_net_worth,
        SUM(CASE WHEN a.is_corporate = false THEN COALESCE(bs.balance_usd, 0) ELSE 0 END) AS personal_net_worth,
        SUM(CASE WHEN a.is_corporate = true  THEN COALESCE(bs.balance_usd, 0) ELSE 0 END) AS corporate_cash
      FROM balance_snapshots bs
      JOIN accounts a ON bs.account_id = a.id
      WHERE a.is_active = true
      GROUP BY bs.snapshot_date
      ORDER BY bs.snapshot_date DESC
    `)

    // Normalise any date/timestamp to a plain YYYY-MM-DD string.
    const ymd = (v: unknown): string => {
      if (!v) return ''
      if (typeof v === 'string') return v.slice(0, 10)
      const d = new Date(v as string)
      return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
    }

    interface Snap {
      date: string
      totalNetWorth: number
      personalNetWorth: number
      corporateCash: number
      // True when this date has a full per-account balance sheet (from
      // balance_snapshots); false for total-only historical markers.
      detailed: boolean
      lines?: { group: string; label: string; amountUsd: number }[]
    }
    const byDate = new Map<string, Snap>()
    for (const row of result.rows) {
      const date = ymd(row.snapshot_date)
      byDate.set(date, {
        date,
        totalNetWorth: parseFloat(row.total_net_worth),
        personalNetWorth: parseFloat(row.personal_net_worth),
        corporateCash: parseFloat(row.corporate_cash),
        detailed: true,
      })
    }

    // Merge in manually-logged net-worth totals (e.g. historical points) for
    // any date not already covered by per-account balance snapshots.
    try {
      const nws = await query(`SELECT snapshot_date, total_net_worth_usd, data FROM net_worth_snapshots`)
      for (const row of nws.rows) {
        const date = ymd(row.snapshot_date)
        if (!date || byDate.has(date)) continue
        const data = typeof row.data === 'string' ? JSON.parse(row.data || '{}') : row.data || {}
        byDate.set(date, {
          date,
          totalNetWorth: parseFloat(row.total_net_worth_usd),
          personalNetWorth: Number(data.personalNetWorth ?? 0),
          corporateCash: Number(data.corporateCash ?? 0),
          detailed: false,
          lines: Array.isArray(data.lines) ? data.lines : undefined,
        })
      }
    } catch {
      /* net_worth_snapshots may not exist yet */
    }

    const snapshots = Array.from(byDate.values()).sort((a, b) => String(b.date).localeCompare(String(a.date)))

    return NextResponse.json({ snapshots })
  } catch (error) {
    console.error('Failed to fetch snapshots:', error)
    return NextResponse.json({ error: 'Failed to fetch snapshots' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/snapshots — save a balance snapshot for a given date
// Body: { date: string, balances: Array<{ accountId, balanceLocal, balanceUsd, yieldPercent, annualCashflow }> }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { date, balances } = body as {
      date: string
      balances: Array<{
        accountId: string
        balanceLocal: number
        balanceUsd: number
        yieldPercent: number
        annualCashflow: number
      }>
    }

    if (!date || !balances?.length) {
      return NextResponse.json({ error: 'date and balances are required' }, { status: 400 })
    }

    // Upsert each balance snapshot
    for (const b of balances) {
      await query(
        `INSERT INTO balance_snapshots (account_id, balance_local, balance_usd, snapshot_date, yield_percent, annual_cashflow)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (account_id, snapshot_date)
         DO UPDATE SET
           balance_local   = EXCLUDED.balance_local,
           balance_usd     = EXCLUDED.balance_usd,
           yield_percent   = EXCLUDED.yield_percent,
           annual_cashflow = EXCLUDED.annual_cashflow`,
        [b.accountId, b.balanceLocal, b.balanceUsd, date, b.yieldPercent, b.annualCashflow]
      )
    }

    // Also upsert the net_worth_snapshots summary row
    const totalNetWorth = balances.reduce((s, b) => s + b.balanceUsd, 0)

    // Fetch accounts to compute personal vs corporate breakdown
    const accountsResult = await query(
      `SELECT id, is_corporate FROM accounts WHERE is_active = true`
    )
    const corporateIds = new Set(
      accountsResult.rows.filter((r) => r.is_corporate).map((r) => r.id)
    )
    const personalTotal = balances
      .filter((b) => !corporateIds.has(b.accountId))
      .reduce((s, b) => s + b.balanceUsd, 0)
    const corporateTotal = balances
      .filter((b) => corporateIds.has(b.accountId))
      .reduce((s, b) => s + b.balanceUsd, 0)

    await query(
      `INSERT INTO net_worth_snapshots (snapshot_date, total_net_worth_usd, data)
       VALUES ($1, $2, $3)
       ON CONFLICT (snapshot_date)
       DO UPDATE SET
         total_net_worth_usd = EXCLUDED.total_net_worth_usd,
         data = EXCLUDED.data`,
      [
        date,
        totalNetWorth,
        JSON.stringify({
          personalNetWorth: personalTotal,
          corporateCash: corporateTotal,
        }),
      ]
    )

    return NextResponse.json({ success: true, date, totalNetWorth })
  } catch (error) {
    console.error('Failed to save snapshot:', error)
    return NextResponse.json({ error: 'Failed to save snapshot' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/snapshots — re-date an existing snapshot (move every row from one
// date to another). Body: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
// Any existing rows on the target date are replaced.
// ---------------------------------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    const { from, to } = (await request.json()) as { from?: string; to?: string }
    if (!from || !to) {
      return NextResponse.json({ error: 'from and to dates are required' }, { status: 400 })
    }
    if (from === to) return NextResponse.json({ success: true, from, to })

    // Clear the target date first so the move can't collide, then shift rows.
    await query(`DELETE FROM balance_snapshots WHERE snapshot_date = $1`, [to])
    await query(`UPDATE balance_snapshots SET snapshot_date = $1 WHERE snapshot_date = $2`, [to, from])

    // net_worth_snapshots may not exist / may have no matching row — best effort.
    try {
      await query(`DELETE FROM net_worth_snapshots WHERE snapshot_date = $1`, [to])
      await query(`UPDATE net_worth_snapshots SET snapshot_date = $1 WHERE snapshot_date = $2`, [to, from])
    } catch {
      /* table may not exist */
    }

    return NextResponse.json({ success: true, from, to })
  } catch (error) {
    console.error('Failed to re-date snapshot:', error)
    return NextResponse.json({ error: 'Failed to re-date snapshot' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/snapshots?date=YYYY-MM-DD — remove a snapshot entirely.
// ---------------------------------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    const date = new URL(request.url).searchParams.get('date')
    if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

    await query(`DELETE FROM balance_snapshots WHERE snapshot_date = $1`, [date])
    try {
      await query(`DELETE FROM net_worth_snapshots WHERE snapshot_date = $1`, [date])
    } catch {
      /* table may not exist */
    }

    return NextResponse.json({ success: true, date })
  } catch (error) {
    console.error('Failed to delete snapshot:', error)
    return NextResponse.json({ error: 'Failed to delete snapshot' }, { status: 500 })
  }
}
