import { NextRequest, NextResponse } from 'next/server'
import { getAccountHints, upsertAccountHint } from '@/lib/db'

// Common statement words that carry no account signal — never learned as hints.
const STOP_WORDS = new Set([
  'monthly', 'statement', 'statements', 'account', 'accounts', 'transactions',
  'transaction', 'summary', 'document', 'export', 'report', 'combined', 'final',
  'current', 'savings', 'credit', 'debit', 'card', 'pdf', 'csv',
])

// Derive distinctive tokens from a filename to fingerprint the account:
//  - id-like runs that mix letters and digits (e.g. Revolut's "…_28e61f"), and
//  - brand words (e.g. "barclaycard", "revolut") — alphabetic, length >= 4,
//    excluding generic statement vocabulary.
function idTokens(fileName: string): string[] {
  const parts = fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .split(/[^a-z0-9]+/)
  const out = new Set<string>()
  for (const t of parts) {
    if (t.length >= 5 && /[a-z]/.test(t) && /[0-9]/.test(t) && !/^\d{4}$/.test(t)) out.add(t)
    if (t.length >= 4 && /^[a-z]+$/.test(t) && !STOP_WORDS.has(t)) out.add(t)
  }
  return [...out]
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
