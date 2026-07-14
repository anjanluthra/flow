import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import taxDocs from '@/data/tax-docs.json'

export const maxDuration = 60

// ---------------------------------------------------------------------------
// Tax documents (UK↔UAE advice) + the day/return tracker. The advice pack is
// seeded from a bundle on first use; further documents can be uploaded. Tables
// are created on first use — no manual migration.
// ---------------------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024
const TRACKER_KEY = 'tax.tracker'

interface SeedDoc {
  title: string
  category: string
  fileName: string
  mimeType: string
  contentBase64: string
  seedHash: string
}

async function ensureTables() {
  await query(
    `CREATE TABLE IF NOT EXISTS tax_documents (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       category    text NOT NULL DEFAULT 'Other',
       title       text NOT NULL,
       file_name   text NOT NULL,
       mime_type   text NOT NULL,
       size_bytes  int  NOT NULL,
       content     bytea NOT NULL,
       seed_hash   text UNIQUE,
       uploaded_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
       key text PRIMARY KEY, value text NOT NULL DEFAULT '', updated_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

async function seedIfNeeded() {
  for (const d of taxDocs as SeedDoc[]) {
    const content = Buffer.from(d.contentBase64, 'base64')
    await query(
      `INSERT INTO tax_documents (category, title, file_name, mime_type, size_bytes, content, seed_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (seed_hash) DO NOTHING`,
      [d.category, d.title, d.fileName, d.mimeType, content.length, content, d.seedHash],
    )
  }
}

export async function GET() {
  try {
    await ensureTables()
    await seedIfNeeded()
    const [docs, tracker] = await Promise.all([
      query(
        `SELECT id, category, title, file_name, mime_type, size_bytes, uploaded_at
         FROM tax_documents ORDER BY category, uploaded_at DESC`,
      ),
      query('SELECT value FROM app_settings WHERE key = $1', [TRACKER_KEY]),
    ])
    return NextResponse.json({
      documents: docs.rows.map((r) => ({
        id: r.id,
        category: r.category,
        title: r.title,
        fileName: r.file_name,
        mimeType: r.mime_type,
        sizeBytes: r.size_bytes,
        uploadedAt: r.uploaded_at,
      })),
      tracker: tracker.rows[0]?.value ? JSON.parse(tracker.rows[0].value) : {},
    })
  } catch (error) {
    console.error('Failed to load tax data:', error)
    return NextResponse.json({ error: 'Failed to load tax data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { category, title, fileName, mimeType, contentBase64 } = (await request.json()) as {
      category?: string
      title?: string
      fileName?: string
      mimeType?: string
      contentBase64?: string
    }
    if (!title || !fileName || !contentBase64) {
      return NextResponse.json({ error: 'title, fileName and contentBase64 are required' }, { status: 400 })
    }
    const content = Buffer.from(contentBase64, 'base64')
    if (content.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    if (content.length > MAX_BYTES) return NextResponse.json({ error: 'File too large — 8 MB max' }, { status: 413 })

    await ensureTables()
    const result = await query(
      `INSERT INTO tax_documents (category, title, file_name, mime_type, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [category || 'Other', title, fileName, mimeType || 'application/octet-stream', content.length, content],
    )
    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error) {
    console.error('Failed to save tax document:', error)
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const tracker = await request.json()
    await ensureTables()
    await query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [TRACKER_KEY, JSON.stringify(tracker ?? {})],
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to save tracker:', error)
    return NextResponse.json({ error: 'Failed to save tracker' }, { status: 500 })
  }
}
