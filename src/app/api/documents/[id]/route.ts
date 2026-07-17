import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Total assembled-file cap for chunked uploads (a statement PDF should be well
// under this). Each individual chunk stays small enough to fit the serverless
// request-body limit; this guards the sum.
const MAX_TOTAL_BYTES = 25 * 1024 * 1024

// ---------------------------------------------------------------------------
// PUT /api/documents/[id] — append a base64 chunk to an existing document's
// content. Lets the client upload files larger than the serverless request-body
// limit by creating the row with the first chunk (POST) then appending the rest.
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const { appendBase64 } = (await request.json()) as { appendBase64?: string }
    if (!appendBase64) return NextResponse.json({ error: 'appendBase64 is required' }, { status: 400 })

    const chunk = Buffer.from(appendBase64, 'base64')
    if (chunk.length === 0) return NextResponse.json({ error: 'Empty chunk' }, { status: 400 })

    const cur = await query(`SELECT size_bytes FROM documents WHERE id = $1`, [id])
    if (cur.rows.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if ((cur.rows[0].size_bytes ?? 0) + chunk.length > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'File too large' }, { status: 413 })
    }

    await query(
      `UPDATE documents SET content = content || $1, size_bytes = size_bytes + $2 WHERE id = $3`,
      [chunk, chunk.length, id],
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to append document chunk:', error)
    return NextResponse.json({ error: 'Failed to append chunk' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// GET /api/documents/[id] — stream the file for inline viewing/download
// ---------------------------------------------------------------------------

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const download = request.nextUrl.searchParams.get('download') === '1'

    const result = await query(
      `SELECT file_name, mime_type, content FROM documents WHERE id = $1`,
      [id],
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const row = result.rows[0]
    const buffer: Buffer = row.content
    const disposition = download ? 'attachment' : 'inline'

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': row.mime_type,
        'Content-Length': String(buffer.length),
        'Content-Disposition': `${disposition}; filename="${row.file_name.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    })
  } catch (error) {
    console.error('Failed to fetch document:', error)
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/documents/[id] — reassign account / statement date
// ---------------------------------------------------------------------------

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = (await request.json()) as {
      accountId?: string | null
      statementDate?: string | null
      periodStart?: string | null
      periodEnd?: string | null
      source?: string | null
      importedCount?: number | null
      dataRows?: number | null
      formatSignature?: string | null
    }
    const sets: string[] = []
    const vals: unknown[] = []
    let i = 1
    if ('accountId' in body) {
      sets.push(`account_id = $${i++}`)
      vals.push(body.accountId || null)
    }
    if ('statementDate' in body) {
      sets.push(`statement_date = $${i++}`)
      vals.push(body.statementDate || null)
    }
    if ('periodStart' in body) {
      sets.push(`period_start = $${i++}`)
      vals.push(body.periodStart || null)
    }
    if ('periodEnd' in body) {
      sets.push(`period_end = $${i++}`)
      vals.push(body.periodEnd || null)
    }
    // Import metadata — set when a previously-uploaded statement is extracted
    // and imported from the archive, so it flips from "uploaded" to "imported"
    // in place instead of creating a duplicate row.
    if ('source' in body) {
      sets.push(`source = $${i++}`)
      vals.push(body.source || null)
    }
    if ('importedCount' in body) {
      sets.push(`imported_count = $${i++}`)
      vals.push(body.importedCount ?? null)
    }
    if ('dataRows' in body) {
      sets.push(`data_rows = $${i++}`)
      vals.push(body.dataRows ?? null)
    }
    if ('formatSignature' in body) {
      sets.push(`format_signature = $${i++}`)
      vals.push(body.formatSignature || null)
    }
    if (sets.length === 0) return NextResponse.json({ success: true })
    vals.push(id)
    await query(`UPDATE documents SET ${sets.join(', ')} WHERE id = $${i}`, vals)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to update document:', error)
    return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/documents/[id]
// ---------------------------------------------------------------------------

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await query(`DELETE FROM documents WHERE id = $1`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
