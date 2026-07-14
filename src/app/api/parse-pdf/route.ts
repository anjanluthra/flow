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
- Use the transaction date (not the posting date if both are shown). Format every date as YYYY-MM-DD; infer the year from the statement period.
- Keep the description concise but recognisable (the merchant name).
- Do NOT include opening/closing balance lines, running balances, or subtotals — only actual transactions.
- If the document is not a statement or has no transactions, return an empty transactions array.`

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
        max_tokens: 8192,
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

    // Pull the JSON object out of the response (tolerate stray text/fences).
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    if (start === -1 || end === -1) {
      return NextResponse.json({ error: 'No transactions found in that PDF.' }, { status: 422 })
    }
    let parsed: {
      bankHint?: string
      statementDate?: string | null
      currency?: string
      transactions?: Array<{ date: string; description: string; amount: number }>
    }
    try {
      parsed = JSON.parse(raw.slice(start, end + 1))
    } catch {
      return NextResponse.json({ error: 'Could not read the statement layout.' }, { status: 422 })
    }

    const transactions = (parsed.transactions ?? [])
      .filter((t) => t && t.date && typeof t.amount === 'number')
      .map((t) => ({
        date: t.date,
        description: (t.description ?? '').trim() || '(no description)',
        amount: t.amount,
      }))

    return NextResponse.json({
      transactions,
      bankHint: parsed.bankHint ?? '',
      statementDate: parsed.statementDate ?? null,
      currency: parsed.currency ?? null,
    })
  } catch (error) {
    console.error('PDF parse failed:', error)
    return NextResponse.json({ error: 'PDF parse failed' }, { status: 500 })
  }
}
