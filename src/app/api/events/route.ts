import { NextRequest, NextResponse } from 'next/server'
import { getCapitalEvents, createCapitalEvent } from '@/lib/db'

// ---------------------------------------------------------------------------
// Capital events — asset sales, inheritance, gifts. Bundling a sale's proceeds
// and its costs into one event keeps them out of the operating P&L together.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const res = await getCapitalEvents()
    const events = res.rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      txnCount: r.txn_count,
      createdAt: r.created_at,
    }))
    return NextResponse.json({ events })
  } catch (error) {
    console.error('Failed to fetch events:', error)
    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, kind } = (await request.json()) as { name?: string; kind?: string }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const ev = await createCapitalEvent(name.trim(), (kind || 'asset_sale').trim())
    return NextResponse.json({ event: { id: ev.id, name: ev.name, kind: ev.kind } })
  } catch (error) {
    console.error('Failed to create event:', error)
    return NextResponse.json({ error: 'Failed to create event' }, { status: 500 })
  }
}
