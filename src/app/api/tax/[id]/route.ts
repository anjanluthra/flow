import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const download = request.nextUrl.searchParams.get('download') === '1'

    // HTML mode: convert a Word .docx to structured HTML (headings, bold,
    // lists, tables preserved) so the in-app preview keeps its formatting.
    // Falls back to the stored plain text for non-docx rich formats.
    if (request.nextUrl.searchParams.get('html') === '1') {
      const r = await query(`SELECT file_name, mime_type, content, text_content FROM tax_documents WHERE id = $1`, [id])
      const row = r.rows[0]
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      const isDocx = /\.docx$/i.test(row.file_name) || String(row.mime_type || '').includes('word')
      if (isDocx && row.content) {
        try {
          const mammoth = await import('mammoth')
          const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(row.content) })
          return NextResponse.json({ html: value })
        } catch (e) {
          console.error('docx→html failed:', e)
        }
      }
      return NextResponse.json({ html: null, text: row.text_content ?? '' })
    }

    // Text mode: return the extracted plain-text for in-app preview.
    if (request.nextUrl.searchParams.get('text') === '1') {
      const t = await query(`SELECT text_content FROM tax_documents WHERE id = $1`, [id])
      return NextResponse.json({ text: t.rows[0]?.text_content ?? '' })
    }

    const result = await query(
      `SELECT file_name, mime_type, content FROM tax_documents WHERE id = $1`,
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
    console.error('Failed to fetch tax document:', error)
    return NextResponse.json({ error: 'Failed to fetch document' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    await query(`DELETE FROM tax_documents WHERE id = $1`, [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete tax document:', error)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
