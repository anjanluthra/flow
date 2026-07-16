import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// The Vault — important life documents (will, marriage certificate, deeds,
// insurance, etc.), stored privately in the database. Kept separate from bank
// statements. The table is created on first use so no manual migration is
// needed.
// ---------------------------------------------------------------------------

const MAX_BYTES = 8 * 1024 * 1024

async function ensureTable() {
  await query(
    `CREATE TABLE IF NOT EXISTS vault_documents (
       id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
       doc_type    text NOT NULL DEFAULT 'Other',
       title       text NOT NULL,
       file_name   text NOT NULL,
       mime_type   text NOT NULL,
       size_bytes  int  NOT NULL,
       content     bytea NOT NULL,
       notes       text,
       uploaded_at timestamptz NOT NULL DEFAULT now()
     )`,
  )
}

export async function GET() {
  try {
    await ensureTable()
    const result = await query(
      `SELECT id, doc_type, title, file_name, mime_type, size_bytes, notes, uploaded_at
       FROM vault_documents
       ORDER BY uploaded_at DESC`,
    )
    const documents = result.rows.map((r) => ({
      id: r.id,
      docType: r.doc_type,
      title: r.title,
      fileName: r.file_name,
      mimeType: r.mime_type,
      sizeBytes: r.size_bytes,
      notes: r.notes,
      uploadedAt: r.uploaded_at,
    }))
    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Failed to list vault:', error)
    return NextResponse.json({ error: 'Failed to list vault' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { docType, title, fileName, mimeType, contentBase64, notes } = (await request.json()) as {
      docType?: string
      title?: string
      fileName?: string
      mimeType?: string
      contentBase64?: string
      notes?: string | null
    }
    if (!title || !fileName || !contentBase64) {
      return NextResponse.json(
        { error: 'title, fileName and contentBase64 are required' },
        { status: 400 },
      )
    }
    const content = Buffer.from(contentBase64, 'base64')
    if (content.length === 0) return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    if (content.length > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large — 8 MB max' }, { status: 413 })
    }

    await ensureTable()
    const result = await query(
      `INSERT INTO vault_documents (doc_type, title, file_name, mime_type, size_bytes, content, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [docType || 'Other', title, fileName, mimeType || 'application/octet-stream',
        content.length, content, notes || null],
    )
    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error) {
    console.error('Failed to save vault document:', error)
    return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
  }
}
