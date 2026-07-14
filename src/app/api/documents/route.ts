import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// Cap uploads at 4 MB — statements are small, and this stays under the
// serverless request-body limit.
const MAX_BYTES = 4 * 1024 * 1024

// ---------------------------------------------------------------------------
// GET /api/documents?accountId= — list documents (metadata only, no content)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId')

    const result = await query(
      `SELECT d.id, d.account_id, d.file_name, d.mime_type, d.statement_date,
              d.size_bytes, d.uploaded_at, a.name AS account_name
       FROM documents d
       LEFT JOIN accounts a ON d.account_id = a.id
       ${accountId ? 'WHERE d.account_id = $1' : ''}
       ORDER BY d.statement_date DESC NULLS LAST, d.uploaded_at DESC`,
      accountId ? [accountId] : [],
    )

    const documents = result.rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      accountName: row.account_name,
      fileName: row.file_name,
      mimeType: row.mime_type,
      statementDate: row.statement_date,
      sizeBytes: row.size_bytes,
      uploadedAt: row.uploaded_at,
    }))

    return NextResponse.json({ documents })
  } catch (error) {
    console.error('Failed to fetch documents:', error)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/documents — upload a statement
// Body: { accountId, fileName, mimeType, statementDate?, contentBase64 }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { accountId, fileName, mimeType, statementDate, contentBase64 } = body as {
      accountId: string | null
      fileName: string
      mimeType: string
      statementDate?: string | null
      contentBase64: string
    }

    if (!fileName || !contentBase64) {
      return NextResponse.json(
        { error: 'fileName and contentBase64 are required' },
        { status: 400 },
      )
    }

    const content = Buffer.from(contentBase64, 'base64')
    if (content.length === 0) {
      return NextResponse.json({ error: 'Empty file' }, { status: 400 })
    }
    if (content.length > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large — the limit is ${MAX_BYTES / (1024 * 1024)} MB` },
        { status: 413 },
      )
    }

    const result = await query(
      `INSERT INTO documents (account_id, file_name, mime_type, statement_date, size_bytes, content)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [accountId || null, fileName, mimeType || 'application/octet-stream',
        statementDate || null, content.length, content],
    )

    return NextResponse.json({ success: true, id: result.rows[0].id })
  } catch (error) {
    console.error('Failed to upload document:', error)
    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 })
  }
}
