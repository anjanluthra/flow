import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

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
