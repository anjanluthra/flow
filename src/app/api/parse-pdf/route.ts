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
- "amount" is a signed JSON number (not a string): money OUT (purchases, payments, fees, debits) is NEGATIVE; money IN (credits, refunds, salary, interest) is POSITIVE. Return the bare number only — no currency symbol, thousands separators, or CR/DR text.
- Some statements (e.g. UK cards) print an amount with a trailing "CR" (credit → money IN → POSITIVE) or "DR" (debit → money OUT → NEGATIVE); read that marker to set the sign. Card payments, cashback and reward credits are transactions — include them.
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

// Coerce a model-provided amount into a signed number. The prompt asks for a
// JSON number, but on statements that print amounts with a currency symbol or a
// trailing CR/DR marker (common on UK cards — e.g. "£47.07CR") the model often
// returns a string like "£47.07CR", "(8.99)" or "-25.99" to preserve the
// notation. Parse those instead of dropping the transaction, which is what a
// strict typeof-number check did — silently losing every row on such a
// statement and reporting "No transactions found".
function toAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const raw = v.trim()
  if (!raw) return null
  // Money-out markers: a leading minus, parentheses, or a trailing DR.
  const negative = raw.includes('-') || /^\(.*\)$/.test(raw) || /dr\b|dr$/i.test(raw)
  // Money-in marker: a trailing CR (credit) — used when no explicit sign.
  const credit = /cr\b|cr$/i.test(raw)
  const digits = raw.replace(/[^0-9.]/g, '')
  if (!digits || digits === '.') return null
  const n = Number(digits)
  if (!Number.isFinite(n)) return null
  const magnitude = Math.abs(n)
  if (negative) return -magnitude
  if (credit) return magnitude
  return magnitude
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

  let rows: Array<{ date?: string; description?: string; amount?: unknown }> = []
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
    .map((t) => ({ t, amount: toAmount(t?.amount) }))
    .filter((r): r is { t: { date?: string; description?: string }; amount: number } =>
      !!r.t && !!r.t.date && r.amount !== null,
    )
    .map(({ t, amount }) => ({
      date: t.date as string,
      description: (t.description ?? '').trim() || '(no description)',
      amount,
    }))

  return { bankHint, statementDate, currency, transactions, truncated }
}

// A failed model call, carrying the HTTP status so the caller can turn "every
// chunk failed" into a message that names the actual cause (bad key, bad model,
// an unreadable/encrypted PDF) rather than a generic dead-end. Two statuses are
// ours, not Anthropic's: NO_JSON when the call succeeded but the reply held no
// JSON to parse, and TRANSPORT when the request never completed. Both used to
// surface as an unexplained null, which is how a readable statement could come
// back as "Claude could not read that PDF" with nothing logged.
const NO_JSON = 0
const TRANSPORT = -1
class ChunkError extends Error {
  constructor(readonly status: number, readonly detail: string) {
    super(`anthropic ${status}`)
  }
}

// The PDF is encrypted with a real user password we don't have (not the common
// empty-password owner lock), so we can't decrypt it to read the text.
class PdfPasswordError extends Error {}

// Turn the collected chunk failures into a user-facing message + HTTP status.
// Every chunk failing usually means one systemic cause, so key off the first
// failure's status and (for 4xx) the detail Anthropic returned.
function describeFailure(failures: ChunkError[]): { message: string; status: number } {
  const f = failures[0]
  if (!f) return { message: 'Claude could not read that PDF. Try a CSV export instead.', status: 502 }

  const detail = f.detail.toLowerCase()
  if (f.status === NO_JSON) {
    return {
      message: 'Claude read that PDF but returned nothing usable — please try Extract again.',
      status: 502,
    }
  }
  if (f.status === TRANSPORT) {
    return {
      message: 'Could not reach Claude to read that PDF — please try Extract again.',
      status: 503,
    }
  }
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

// One model call, returned as a parsed statement. `content` is the user-message
// content blocks — either a PDF document (native reading) or extracted text (for
// encrypted PDFs we decrypt ourselves, see below). Throws ChunkError on a non-OK
// response so the caller can drop just that chunk rather than fail the whole
// statement, while still learning why it failed.
async function callClaude(content: unknown[], apiKey: string): Promise<StatementExtract | null> {
  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        thinking: { type: 'disabled' },
        messages: [{ role: 'user', content }],
      }),
    })
  } catch (e) {
    console.error('Anthropic PDF parse request failed:', e)
    throw new ChunkError(TRANSPORT, String(e).slice(0, 300))
  }
  if (!res.ok) {
    const detail = await res.text()
    console.error('Anthropic PDF parse error:', res.status, detail.slice(0, 300))
    throw new ChunkError(res.status, detail.slice(0, 300))
  }
  const data = await res.json()
  const raw: string = Array.isArray(data?.content)
    ? data.content.filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('')
    : ''
  const parsed = parseStatement(raw, data?.stop_reason === 'max_tokens')
  if (!parsed) {
    // The call succeeded but the reply carried no JSON object (an empty reply,
    // a refusal, prose only). Raise it so it's logged and classified instead of
    // vanishing into a null the caller can't explain.
    const detail = `stop_reason=${data?.stop_reason ?? 'none'} reply=${raw.slice(0, 200) || '(empty)'}`
    console.error('Anthropic PDF parse returned no JSON:', detail)
    throw new ChunkError(NO_JSON, detail)
  }
  return parsed
}

// Read a (whole or chunked) PDF via Claude's native PDF support. `context`
// appends period/currency hints for continuation chunks whose pages don't
// repeat the statement header.
function extractChunk(base64: string, apiKey: string, context: string): Promise<StatementExtract | null> {
  return callClaude(
    [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: INSTRUCTION + context },
    ],
    apiKey,
  )
}

// Read a chunk of statement TEXT (extracted from an encrypted PDF we decrypted
// locally) via Claude. Anthropic's PDF reader rejects encrypted documents, so
// for those we extract the text ourselves and send it here instead.
function extractTextChunk(text: string, apiKey: string, context: string): Promise<StatementExtract | null> {
  return callClaude(
    [{ type: 'text', text: `${INSTRUCTION}${context}\n\n--- Statement text extracted from the PDF ---\n${text}` }],
    apiKey,
  )
}

// The text of each page, read with pdf.js. Used for two things: decrypting a
// password-protected PDF (empty user password — the common case for bank
// e-statements, which are owner/permission-locked with AES; pdf-lib can't
// decrypt AES, pdf.js can), and as the fallback path for any PDF whose native
// read came back empty. Throws PdfPasswordError when the file needs a real open
// password we don't have.
async function extractPageTexts(bytes: Uint8Array): Promise<string[]> {
  // Loaded lazily and kept out of the server bundle (see serverExternalPackages).
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  let doc
  try {
    // Copy the bytes — pdf.js may detach the underlying buffer.
    doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), password: '', isEvalSupported: false, useSystemFonts: false }).promise
  } catch (e) {
    // PasswordException => the empty password didn't open it (a real user password).
    if (e && typeof e === 'object' && (e as { name?: string }).name === 'PasswordException') {
      throw new PdfPasswordError()
    }
    throw e
  }
  const pages: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    pages.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
    page.cleanup()
  }
  await doc.destroy()
  return pages
}

// Split a PDF into base64 chunks of at most CHUNK_PAGES pages each. A statement
// that already fits in one chunk is sent as its original bytes — re-saving it
// through pdf-lib can subtly re-encode fonts/content and is pointless work.
// (Encrypted PDFs never reach here; they're decrypted to text upstream.)
async function splitIntoChunks(bytes: Uint8Array): Promise<string[]> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = src.getPageCount()
  if (total <= CHUNK_PAGES) return [Buffer.from(bytes).toString('base64')]
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

// Page texts joined into CHUNK_PAGES-sized groups, dropping blank pages.
function groupPageTexts(pageTexts: string[]): string[] {
  const groups: string[] = []
  for (let i = 0; i < pageTexts.length; i += CHUNK_PAGES) {
    const text = pageTexts.slice(i, i + CHUNK_PAGES).join('\n\n').trim()
    if (text) groups.push(text)
  }
  return groups
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

    // Decide how to feed the statement to Claude. Anthropic's PDF reader can't
    // open an encrypted document, so if the PDF is encrypted we decrypt it here
    // (empty user password — the norm for bank e-statements) and send the
    // extracted text per page-chunk. Otherwise we let Claude read the PDF
    // natively (which also handles scanned/image statements), splitting large
    // files into page-chunks so no single call is too big. Each caller takes the
    // shared period/currency context and returns a parsed statement.
    type ChunkCaller = (context: string) => Promise<StatementExtract | null>
    const failures: ChunkError[] = []
    let callers: ChunkCaller[]
    // Whether we're already reading the text layer (encrypted statements), so
    // the fallback below doesn't repeat the same call.
    let usedTextLayer = false
    try {
      const doc = await PDFDocument.load(pdfBuf, { ignoreEncryption: true })
      if (doc.isEncrypted) {
        const groups = groupPageTexts(await extractPageTexts(pdfBuf))
        if (groups.length === 0) {
          return NextResponse.json(
            { error: "That PDF is password-protected and has no readable text layer (it looks scanned). Try a CSV export instead." },
            { status: 422 },
          )
        }
        callers = groups.map((text) => (context: string) => extractTextChunk(text, apiKey, context))
        usedTextLayer = true
      } else {
        const chunks = await splitIntoChunks(pdfBuf)
        const list = chunks.length ? chunks : [contentBase64]
        callers = list.map((b64) => (context: string) => extractChunk(b64, apiKey, context))
      }
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        return NextResponse.json(
          { error: 'That PDF needs a password to open. Remove the password (or use a CSV export) and try again.' },
          { status: 422 },
        )
      }
      // Couldn't parse the PDF for splitting/encryption (unusual encoding): fall
      // back to letting Claude read the whole document in one native call.
      callers = [(context: string) => extractChunk(contentBase64, apiKey, context)]
    }

    const runCaller = async (caller: ChunkCaller, context: string): Promise<StatementExtract | null> => {
      try {
        return await caller(context)
      } catch (e) {
        if (e instanceof ChunkError) failures.push(e)
        else console.error('PDF chunk failed:', e)
        return null
      }
    }

    // Read the first chunk on its own to capture the statement period/currency,
    // then hand that to the remaining chunks (whose pages may not repeat the
    // header) so dates without a year are attributed to the right period.
    const runAll = async (list: ChunkCaller[]): Promise<StatementExtract[]> => {
      const first = await runCaller(list[0], '')
      const rest: StatementExtract[] = []
      if (list.length > 1) {
        const period = first?.statementDate ? ` dated around ${first.statementDate}` : ''
        const ccy = first?.currency ? ` in ${first.currency}` : ''
        const context = `\n\nContext: these are continuation pages of one bank statement${period}${ccy}. If a transaction row shows a day and month but no year, use the statement period's year. Return the same JSON shape.`
        const results = await mapLimit(list.slice(1), MAX_CONCURRENCY, (caller) => runCaller(caller, context))
        for (const r of results) if (r) rest.push(r)
      }
      return [first, ...rest].filter((r): r is StatementExtract => r !== null)
    }

    let all = await runAll(callers)

    // Second, independent path. Reading the PDF natively is one mechanism with
    // one failure mode — an empty or non-JSON reply used to end the import right
    // here, even for a statement whose text is plainly readable. So whenever the
    // native read yields no transactions, re-ask Claude using the PDF's own text
    // layer (the same route encrypted statements already take). Only runs when
    // the first path came back empty, so a normal import costs nothing extra.
    // A rejected key, a bad model or a rate limit will fail the same way twice —
    // don't spend a second round of calls on those.
    const systemic = failures.some((f) => [401, 403, 404, 429].includes(f.status))
    if (!usedTextLayer && !systemic && all.every((r) => r.transactions.length === 0)) {
      try {
        const groups = groupPageTexts(await extractPageTexts(pdfBuf))
        if (groups.length) {
          console.warn(`PDF native read found no transactions; retrying via the text layer (${groups.length} chunk(s))`)
          const textResults = await runAll(groups.map((text) => (context: string) => extractTextChunk(text, apiKey, context)))
          // Keep whichever path actually read something.
          if (textResults.some((r) => r.transactions.length > 0) || all.length === 0) all = textResults
        }
      } catch (e) {
        // No text layer (a scanned statement), or pdf.js couldn't open it —
        // the native result, empty or not, stands.
        console.error('PDF text-layer fallback failed:', e)
      }
    }

    if (all.length === 0) {
      const { message, status } = describeFailure(failures)
      return NextResponse.json({ error: message }, { status })
    }

    // An empty list here means both paths read the document and it genuinely
    // lists no transactions (a quiet month). That's a 200, not an error: the
    // importer files such a statement and marks its month covered.
    const transactions = all.flatMap((r) => r.transactions)

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
