import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// GET /api/vault/[id] — stream the file (inline, or ?download=1 to save)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const download = request.nextUrl.searchParams.get('download') === '1'
    const result = await query(
      `SELECT file_name, mime_type, content FROM vault_documents WHERE id = $1`,
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
    console.error('Failed to fetch vault document:', error)
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
  }
}

// DELETE /api/vault/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await query(`DELETE FROM vault_documents WHERE id = $1`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete vault document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
