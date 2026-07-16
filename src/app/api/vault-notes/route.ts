import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// Free-text notes for the Vault (e.g. the "For Kate" guide). Stored as
// key/value in an app_settings table, created on first use.
// ---------------------------------------------------------------------------

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key        text PRIMARY KEY,
       value      text NOT NULL DEFAULT '',
       updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

const KEY = 'vault.for_kate'

export async function GET() {
  try {
    await ensureTable()
    const result = await query('SELECT value, updated_at FROM app_settings WHERE key = $1', [KEY])
    return NextResponse.json({
      value: result.rows[0]?.value ?? '',
      updatedAt: result.rows[0]?.updated_at ?? null,
    })
  } catch (error) {
    console.error('Failed to load vault notes:', error)
    return NextResponse.json({ error: 'Failed to load notes' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { value } = (await request.json()) as { value?: string }
    await ensureTable()
    await query(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [KEY, value ?? ''],
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save vault notes:', error)
    return NextResponse.json({ error: 'Failed to save notes' }, { status: 500 })
  }
}
