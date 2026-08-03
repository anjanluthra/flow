import { NextRequest, NextResponse } from 'next/server'
import { PDFDocument } from 'pdf-lib'

// ---------------------------------------------------------------------------
// POST /api/parse-pdf — extract transactions from a bank/card statement PDF.
//
// Body: { contentBase64 }
// Uses Claude's native PDF reading to return structured rows, so it works
// across any bank's layout (including scanned/image statements). Large
// statements (a full month of a current account can run to ~200 transactions
// across 30+ pages) are split into page-chunks and read concurrently, so no
// single model call is large or slow enough to time the function out.
// Requires ANTHROPIC_API_KEY (model via ANTHROPIC_MODEL).
// ---------------------------------------------------------------------------

export const maxDuration = 120

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5'
// Pages per model call. Small enough that each call's JSON stays well under the
// token limit and returns quickly; large enough to keep the call count low.
const CHUNK_PAGES = 6
const MAX_CONCURRENCY = 5

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
// chunk the response can hit max_tokens mid-array; rather than failing the whole
// file we salvage every complete transaction object that did come back.
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

// A failed model call, carrying the HTTP status so the caller can turn "every
// chunk failed" into a message that names the actual cause (bad key, bad model,
// an unreadable/encrypted PDF) rather than a generic dead-end.
class ChunkError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`anthropic ${status}`)
  }
}

// Turn the collected chunk failures into a user-facing message + HTTP status.
// Every chunk failing usually means one systemic cause, so key off the first
// failure's status and (for 4xx) the detail Anthropic returned.
function describeFailure(failures: ChunkError[]): { message: string; status: number } {
  const f = failures[0]
  if (!f) return { message: 'Claude could not read that PDF. Try a CSV export instead.', status: 502 }

  const detail = f.detail.toLowerCase()
  if (f.status === 401 || f.status === 403) {
    return { message: "PDF parsing isn't configured correctly — the Anthropic API key was rejected.", status: 502 }
  }
  if (f.status === 429) {
    return { message: 'Too many statements at once — please wait a moment and try again.', status: 503 }
  }
  if (f.status === 404 || detail.includes('model')) {
    return { message: "PDF parsing isn't configured correctly — the configured Claude model is unavailable.", status: 502 }
  }
  if (f.status >= 500) {
    return { message: 'Claude was temporarily unavailable while reading that PDF — please try Extract again.', status: 503 }
  }
  // A 400 on the document itself: almost always an encrypted/password-protected
  // or corrupted file that Claude's PDF reader can't open.
  if (detail.includes('password') || detail.includes('encrypt')) {
    return {
      message: 'That PDF is password-protected. Remove the password (open it and re-save/print to PDF) or use a CSV export, then try again.',
      status: 422,
    }
  }
  return {
    message: 'Claude could not read that PDF — it may be encrypted, scanned at low quality, or corrupted. Try re-saving it or use a CSV export.',
    status: 502,
  }
}

// One model call over a single (whole or chunked) PDF, returned as a parsed
// statement. `context` appends period/currency hints for continuation chunks
// whose pages don't repeat the statement header. Throws ChunkError on a non-OK
// response so the caller can drop just that chunk rather than fail the whole
// statement, while still learning why it failed.
async function extractChunk(base64: string, apiKey: string, context: string): Promise<StatementExtract | null> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: 'disabled' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
            { type: 'text', text: INSTRUCTION + context },
          ],
        },
      ],
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    console.error('Anthropic PDF parse error:', res.status, detail.slice(0, 300))
    throw new ChunkError(res.status, detail.slice(0, 300))
  }
  const data = await res.json()
  const raw: string = Array.isArray(data?.content)
    ? data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
    : ''
  return parseStatement(raw, data?.stop_reason === 'max_tokens')
}

// Split a PDF into base64 chunks of at most CHUNK_PAGES pages each.
//
// Every chunk — including a short statement that fits in one chunk — is rebuilt
// by copying its pages into a fresh document and re-saving. That normalises the
// bytes and, crucially, drops any encryption/permissions layer: bank e-statements
// are frequently password- or owner-locked, and Anthropic's PDF reader rejects an
// encrypted document outright. Re-saving the pages unencrypted lets those through.
async function splitIntoChunks(bytes: Uint8Array): Promise<string[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = src.getPageCount()
  const chunks: string[] = []
  for (let start = 0; start < total; start += CHUNK_PAGES) {
    const out = await PDFDocument.create()
    const indices = Array.from({ length: Math.min(CHUNK_PAGES, total - start) }, (_, k) => start + k)
    const pages = await out.copyPages(src, indices)
    pages.forEach((p) => out.addPage(p))
    chunks.push(Buffer.from(await out.save()).toString('base64'))
  }
  return chunks
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let idx = 0
  const worker = async () => {
    while (idx < items.length) {
      const i = idx++
      out[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
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

    // Cap the payload BEFORE decoding (base64 is ~4/3 the byte size), so a huge
    // body can't blow up memory or run up Anthropic costs. ~12 MB of PDF.
    const MAX_PDF_BYTES = 12 * 1024 * 1024
    if (contentBase64.length > Math.ceil((MAX_PDF_BYTES * 4) / 3) + 1024) {
      return NextResponse.json({ error: 'PDF is too large (max 12 MB).' }, { status: 413 })
    }
    const pdfBuf = Buffer.from(contentBase64, 'base64')
    // Verify it's actually a PDF (magic bytes) before shipping it to Claude.
    if (pdfBuf.subarray(0, 5).toString('latin1') !== '%PDF-') {
      return NextResponse.json({ error: 'That file is not a valid PDF.' }, { status: 400 })
    }

    // Split into page-chunks. If the PDF can't be parsed for splitting (e.g.
    // unusual encoding) fall back to reading the whole document in one call.
    let chunks: string[]
    try {
      chunks = await splitIntoChunks(pdfBuf)
      // A PDF that reports no pages yields no chunks — send the raw document
      // rather than nothing so Claude still gets a shot at it.
      if (chunks.length === 0) chunks = [contentBase64]
    } catch {
      chunks = [contentBase64]
    }

    // Remember why chunks failed so an all-chunks-failed result can name the
    // actual cause instead of a generic dead-end.
    const failures: ChunkError[] = []
    const runChunk = async (b64: string, context: string): Promise<StatementExtract | null> => {
      try {
        return await extractChunk(b64, apiKey, context)
      } catch (e) {
        if (e instanceof ChunkError) failures.push(e)
        return null
      }
    }

    // Read the first chunk on its own to capture the statement period/currency,
    // then hand that to the remaining chunks (whose pages may not repeat the
    // header) so dates without a year are attributed to the right period.
    const first = await runChunk(chunks[0], '')

    const rest: StatementExtract[] = []
    if (chunks.length > 1) {
      const period = first?.statementDate ? ` dated around ${first.statementDate}` : ''
      const ccy = first?.currency ? ` in ${first.currency}` : ''
      const context = `\n\nContext: these are continuation pages of one bank statement${period}${ccy}. If a transaction row shows a day and month but no year, use the statement period's year. Return the same JSON shape.`
      const results = await mapLimit(chunks.slice(1), MAX_CONCURRENCY, (b64) => runChunk(b64, context))
      for (const r of results) if (r) rest.push(r)
    }

    const all = [first, ...rest].filter((r): r is StatementExtract => r !== null)
    if (all.length === 0) {
      const { message, status } = describeFailure(failures)
      return NextResponse.json({ error: message }, { status })
    }

    const transactions = all.flatMap((r) => r.transactions)
    if (transactions.length === 0) {
      return NextResponse.json({ error: 'No transactions found in that PDF.' }, { status: 422 })
    }

    return NextResponse.json({
      transactions,
      bankHint: all.find((r) => r.bankHint)?.bankHint ?? '',
      statementDate: all.find((r) => r.statementDate)?.statementDate ?? null,
      currency: all.find((r) => r.currency)?.currency ?? null,
      // True if any chunk was cut off by the token limit (rare now that chunks
      // are small) — the client still gets everything we recovered.
      truncated: all.some((r) => r.truncated),
    })
  } catch (error) {
    console.error('PDF parse failed:', error)
    return NextResponse.json({ error: 'PDF parse failed' }, { status: 500 })
  }
}
