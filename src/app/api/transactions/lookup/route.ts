import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/transactions/lookup — given the rows about to be reviewed, report
// which are already in Flow and what category they carry, so re-importing a
// statement reuses the existing categorisation instead of starting over.
//
// Body: { accountId, rows: [{ date, description, amountLocal }] }
// Matches on the same key used for de-duplication (account, date, amount,
// description), respecting repeats via an occurrence counter.
// Returns: { results: [{ matched, categoryName, type }] }
// ---------------------------------------------------------------------------

interface Row {
  date: string
  description: string
  amountLocal: number
}

const ymd = (v: unknown): string => {
  if (!v) return ''
  if (typeof v === 'string') return v.slice(0, 10)
  const d = new Date(v as string)
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10)
}

const keyOf = (date: string, amount: number, description: string) =>
  [ymd(date), Math.round(Math.abs(amount) * 100), description.trim().toLowerCase()].join('|')

export async function POST(request: NextRequest) {
  try {
    const { accountId, rows } = (await request.json()) as { accountId?: string; rows?: Row[] }
    if (!accountId || !Array.isArray(rows)) {
      return NextResponse.json({ results: [] })
    }

    const existing = await query(
      `SELECT t.date, t.amount_local, t.description, t.type, c.name AS category_name
       FROM transactions t
       LEFT JOIN categories c ON t.category_id = c.id
       WHERE t.account_id = $1`,
      [accountId],
    )

    // Bucket existing rows by match key; consume in order for repeats.
    const buckets = new Map<string, Array<{ categoryName: string | null; type: string | null }>>()
    for (const r of existing.rows) {
      const k = keyOf(String(r.date), Number(r.amount_local), String(r.description ?? ''))
      const list = buckets.get(k) ?? []
      list.push({ categoryName: r.category_name ?? null, type: r.type ?? null })
      buckets.set(k, list)
    }

    const used = new Map<string, number>()
    const results = rows.map((row) => {
      const k = keyOf(row.date, row.amountLocal, row.description ?? '')
      const list = buckets.get(k)
      const idx = used.get(k) ?? 0
      if (list && idx < list.length) {
        used.set(k, idx + 1)
        return { matched: true, categoryName: list[idx].categoryName, type: list[idx].type }
      }
      return { matched: false, categoryName: null, type: null }
    })

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Failed to look up transactions:', error)
    return NextResponse.json({ results: [] })
  }
}
