import { NextRequest, NextResponse } from 'next/server'

// ---------------------------------------------------------------------------
// POST /api/parse-pdf — extract transactions from a bank/card statement PDF.
//
// Body: { contentBase64 }
// Uses Claude's native PDF reading to return structured rows, so it works
// across any bank's layout (including scanned/image statements). Requires
// ANTHROPIC_API_KEY (model via ANTHROPIC_MODEL).
// ---------------------------------------------------------------------------

export const maxDuration = 60

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'

const INSTRUCTION = `You are extracting every transaction from this bank or credit-card statement.

Return ONLY a JSON object (no prose, no markdown fences) of the form:
{
  "bankHint": "<bank/card name and account holder if visible, e.g. 'Barclaycard credit card, A Luthra'>",
  "statementDate": "<the statement or period-end date as YYYY-MM-DD, or null>",
  "currency": "<ISO currency code of the statement, e.g. GBP, AED, USD>",
  "transactions": [
    { "date": "YYYY-MM-DD", "description": "<merchant/description>", "amount": <number> }
  ]
}

Rules:
- Include EVERY posted transaction line. Do not summarise or skip any.
- "amount" is a signed number: money OUT (purchases, payments, fees, debits) is NEGATIVE; money IN (credits, refunds, salary, interest) is POSITIVE.
- Some statements (e.g. current accounts) list debits and credits in separate columns with no +/- sign, and wrap a single transaction's description across several lines. Treat each dated row as one transaction: join its wrapped description onto one line, and use which column the amount sits in — or the direction the running balance moves — to set the sign.
- Use the transaction date (not the posting date if both are shown). Format every date as YYYY-MM-DD; infer the year from the statement period.
- Keep the description concise but recognisable (the merchant name).
- Do NOT include opening/closing balance lines, running balances, or subtotals — only actual transactions.
- If the document is not a statement or has no transactions, return an empty transactions array.`

// Extract complete top-level JSON objects from a (possibly truncated) array
// body. String-aware so braces inside quoted values don't confuse the depth
// counter. Lets us recover every finished transaction even when the model's
// response was cut off by the output-token limit before the array closed.
function extractObjectStrings(text: string): string[] {
  const objs: string[] = []
  let depth = 0
  let objStart = -1
  let inStr = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inStr) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') {
      if (depth === 0) objStart = i
      depth++
    } else if (c === '}') {
      depth--
      if (depth === 0 && objStart !== -1) {
        objs.push(text.slice(objStart, i + 1))
        objStart = -1
      }
    }
  }
  return objs
}

interface StatementExtract {
  bankHint: string
  statementDate: string | null
  currency: string | null
  transactions: Array<{ date: string; description: string; amount: number }>
  truncated: boolean
}

// Turn Claude's raw text into a statement, tolerating truncated JSON. On a large
// statement the response can hit max_tokens mid-array; rather than failing the
// whole file we salvage every complete transaction object that did come back.
function parseStatement(raw: string, truncated: boolean): StatementExtract | null {
  const start = raw.indexOf('{')
  if (start === -1) return null

  const readField = (name: string): string | null => {
    const m = raw.match(new RegExp(`"${name}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`))
    return m ? m[1].replace(/\\"/g, '"') : null
  }

  let rows: Array<{ date?: string; description?: string; amount?: number }> = []
  let bankHint = readField('bankHint') ?? ''
  let statementDate = readField('statementDate')
  let currency = readField('currency')

  // Happy path: the whole object is valid JSON.
  const end = raw.lastIndexOf('}')
  if (end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1))
      rows = parsed.transactions ?? []
      bankHint = parsed.bankHint ?? bankHint
      statementDate = parsed.statementDate ?? statementDate
      currency = parsed.currency ?? currency
      truncated = false
    } catch {
      // Fall through to salvage below.
    }
  }

  // Salvage path: pull whatever finished transaction objects exist.
  if (rows.length === 0) {
    const arrIdx = raw.indexOf('[', raw.indexOf('"transactions"'))
    if (arrIdx !== -1) {
      for (const objStr of extractObjectStrings(raw.slice(arrIdx + 1))) {
        try {
          rows.push(JSON.parse(objStr))
        } catch {
          // Skip a malformed fragment; keep the rest.
        }
      }
    }
  }

  const transactions = rows
    .filter((t) => t && t.date && typeof t.amount === 'number')
    .map((t) => ({
      date: t.date as string,
      description: (t.description ?? '').trim() || '(no description)',
      amount: t.amount as number,
    }))

  return { bankHint, statementDate, currency, transactions, truncated }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'PDF parsing needs an ANTHROPIC_API_KEY environment variable in Vercel.' },
        { status: 503 },
      )
    }

    const { contentBase64 } = (await request.json()) as { contentBase64?: string }
    if (!contentBase64) {
      return NextResponse.json({ error: 'contentBase64 is required' }, { status: 400 })
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        // A full month of a current account can run to ~200 transactions; 8192
        // tokens truncated the JSON and the whole file failed. 16000 is the safe
        // non-streaming ceiling and comfortably covers a monthly statement.
        max_tokens: 16000,
        // Pure extraction — no reasoning needed. Disabling thinking keeps the
        // entire token budget for the JSON (Sonnet 5 runs adaptive thinking by
        // default otherwise) and returns faster, well inside maxDuration.
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: contentBase64 },
              },
              { type: 'text', text: INSTRUCTION },
            ],
          },
        ],
      }),
    })

    if (!res.ok) {
      const detail = await res.text()
      console.error('Anthropic PDF parse error:', res.status, detail)
      return NextResponse.json(
        { error: 'Claude could not read that PDF. Try a CSV export instead.' },
        { status: 502 },
      )
    }

    const data = await res.json()
    const raw: string = Array.isArray(data?.content)
      ? data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
      : ''

    const wasTruncated = data?.stop_reason === 'max_tokens'
    const extract = parseStatement(raw, wasTruncated)
    if (!extract) {
      return NextResponse.json({ error: 'Could not read the statement layout.' }, { status: 422 })
    }
    if (extract.transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions found in that PDF.' }, { status: 422 })
    }

    return NextResponse.json({
      transactions: extract.transactions,
      bankHint: extract.bankHint,
      statementDate: extract.statementDate,
      currency: extract.currency,
      // True when the statement was too large to return in full — the client
      // gets every transaction we could recover plus a signal to warn the user.
      truncated: extract.truncated,
    })
  } catch (error) {
    console.error('PDF parse failed:', error)
    return NextResponse.json({ error: 'PDF parse failed' }, { status: 500 })
  }
}
