import { NextRequest, NextResponse } from 'next/server'
import { getAccountHints, upsertAccountHint } from '@/lib/db'

// Derive id-like tokens from a filename (e.g. Revolut's "…_28e61f"): alphanumeric
// runs of length >= 5 that mix letters and digits and aren't pure years.
function idTokens(fileName: string): string[] {
  return fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 5 && /[a-z]/.test(t) && /[0-9]/.test(t) && !/^\d{4}$/.test(t))
}

// ---------------------------------------------------------------------------
// GET /api/account-hints — learned fingerprints used during auto-detection
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await getAccountHints()
    const hints = result.rows.map((r) => ({
      accountId: r.account_id,
      hintType: r.hint_type,
      hintValue: r.hint_value,
    }))
    return NextResponse.json({ hints })
  } catch (error) {
    console.error('Failed to fetch account hints:', error)
    return NextResponse.json({ error: 'Failed to fetch account hints' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/account-hints — learn from a manual account pick
// Body: { accountId, headerSignature?, fileName? }
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    const { accountId, headerSignature, fileName } = (await request.json()) as {
      accountId?: string
      headerSignature?: string
      fileName?: string
    }
    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 })
    }

    const learned: string[] = []
    if (headerSignature && headerSignature.length >= 3) {
      await upsertAccountHint(accountId, 'header_signature', headerSignature)
      learned.push('format')
    }
    for (const tok of fileName ? idTokens(fileName) : []) {
      await upsertAccountHint(accountId, 'filename_token', tok)
      learned.push(tok)
    }

    return NextResponse.json({ success: true, learned })
  } catch (error) {
    console.error('Failed to save account hint:', error)
    return NextResponse.json({ error: 'Failed to save account hint' }, { status: 500 })
  }
}
