'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, Eye, Download, Trash2, Sparkles } from 'lucide-react'
import { DocViewer, type DocViewerTarget } from '@/components/DocViewer'
import { FileUpload } from '@/components/ui/FileUpload'
import { Select } from '@/components/ui/Select'
import { convertToUSD } from '@/lib/currency'
import { deriveMerchantPattern, merchantMatches } from '@/lib/categories'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountOption {
  id: string
  name: string
  currency: string
  institution?: string | null
}

interface AccountHint {
  accountId: string
  hintType: string // 'header_signature' | 'filename_token'
  hintValue: string
}

/** A stable fingerprint of a statement's column layout (bank-specific). */
function headerSignature(text: string): string {
  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== '') ?? ''
  return firstLine
    .split(',')
    .map((c) => c.replace(/"/g, '').trim().toLowerCase())
    .filter(Boolean)
    .join('|')
}

/**
 * Account detection. A learned fingerprint (you previously told us which account
 * this bank's format is) wins outright; otherwise fall back to scoring each
 * account by how strongly the filename + first rows reference its institution
 * and name, returning null when it's unclear so the user picks.
 */
function detectAccount(
  fileName: string,
  sampleText: string,
  accounts: AccountOption[],
  hints: AccountHint[] = [],
): { account: AccountOption; score: number } | null {
  // 1. Learned fingerprints (from a previous manual pick).
  const sig = headerSignature(sampleText)
  const fileLower = fileName.toLowerCase()
  const learnedIds = new Set<string>()
  for (const h of hints) {
    if (h.hintType === 'header_signature' && sig && h.hintValue === sig) learnedIds.add(h.accountId)
    if (h.hintType === 'filename_token' && fileLower.includes(h.hintValue)) learnedIds.add(h.accountId)
  }
  if (learnedIds.size === 1) {
    const acc = accounts.find((a) => a.id === [...learnedIds][0])
    if (acc) return { account: acc, score: 100 }
  }

  // 2. Heuristic scoring. A distinctive brand token in the *filename* is a
  //    strong signal (e.g. "barclaycard" in "Monthly BarclayCard Statement…"),
  //    so it's weighted much higher than a match anywhere in the body text.
  const hay = `${fileName} ${sampleText}`.toLowerCase()
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !['the', 'and', 'account', 'card', 'current', 'credit', 'debit', 'savings'].includes(t))

  const scoreFor = (a: AccountOption): number => {
    let score = 0
    const inst = (a.institution ?? '').toLowerCase().trim()
    if (inst && inst.length >= 2) {
      if (fileLower.includes(inst)) score += 4
      else if (hay.includes(inst)) score += 3
    }
    for (const tok of tokenize(a.name)) {
      if (fileLower.includes(tok)) score += 3
      else if (hay.includes(tok)) score += 1
    }
    return score
  }

  let best: { account: AccountOption; score: number } | null = null
  for (const a of accounts) {
    const score = scoreFor(a)
    if (!best || score > best.score) best = { account: a, score }
  }

  // Require a real signal, and an unambiguous winner.
  if (!best || best.score < 3) return null
  const runnerUp = accounts
    .filter((a) => a.id !== best!.account.id)
    .reduce((max, a) => Math.max(max, scoreFor(a)), 0)
  if (best.score - runnerUp < 1) return null // tie — let the user disambiguate
  return best
}

interface CategoryOption {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer' | 'investment'
}

interface StatementDoc {
  id: string
  accountId: string | null
  accountName: string | null
  fileName: string
  statementDate: string | null
  periodStart: string | null
  periodEnd: string | null
  sizeBytes: number
  uploadedAt: string
  source: string | null // 'upload' | 'import'
  formatSignature: string | null
  importedCount: number | null
}

// Pull a date range out of a filename, e.g. "2026.01.01-2026.06.30" or
// "..._2026-01-01_2026-06-30_..." → { start, end } ISO date strings.
function parseFilePeriod(name: string): { start: string; end: string } | null {
  const m = name.match(/(\d{4})[.\-_/](\d{1,2})[.\-_/](\d{1,2})\D+(\d{4})[.\-_/](\d{1,2})[.\-_/](\d{1,2})/)
  if (!m) return null
  const pad = (s: string) => s.padStart(2, '0')
  const start = `${m[1]}-${pad(m[2])}-${pad(m[3])}`
  const end = `${m[4]}-${pad(m[5])}-${pad(m[6])}`
  return start <= end ? { start, end } : { start: end, end: start }
}

const MONTH_TOKENS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']

/** The month of a YYYY-MM-DD date string, or null if it isn't one. */
function monthFromDateString(s: string | null | undefined): { year: number; month: number } | null {
  const m = String(s ?? '').match(/^(\d{4})-(\d{2})/)
  if (!m) return null
  const month = parseInt(m[2], 10)
  if (month < 1 || month > 12) return null
  return { year: parseInt(m[1], 10), month }
}

/**
 * Best-effort statement month from a filename — the only clue left when a
 * statement carries no transactions to date it by (a month with no activity).
 * Handles "…22-JAN-26…", "…Jan 2026…", "…2026-01…" and "…01-2026…".
 */
function monthFromFileName(name: string): { year: number; month: number } | null {
  const range = parseFilePeriod(name)
  if (range) return monthFromDateString(range.start)

  const toYear = (raw: string): number | null => {
    const n = parseInt(raw, 10)
    if (raw.length === 4) return n >= 1990 && n <= 2100 ? n : null
    return n >= 15 && n <= 45 ? 2000 + n : null // two-digit year
  }
  const named = name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_. ]?(\d{4}|\d{2})\b/i)
  if (named) {
    const year = toYear(named[2])
    if (year) return { year, month: MONTH_TOKENS.indexOf(named[1].toLowerCase()) + 1 }
  }
  // Underscores are word characters, so these use explicit non-digit edges
  // rather than \b — "statement_03-2025" must still resolve.
  const compact = name.match(/(?:^|[^0-9])(20\d{2})(0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])(?![0-9])/)
  if (compact) return { year: parseInt(compact[1], 10), month: parseInt(compact[2], 10) }
  const iso = name.match(/(?:^|[^0-9])(20\d{2})[-_.]?(0[1-9]|1[0-2])(?![0-9])/)
  if (iso) return { year: parseInt(iso[1], 10), month: parseInt(iso[2], 10) }
  const monthYear = name.match(/(?:^|[^0-9])(0?[1-9]|1[0-2])[-_.](20\d{2})(?![0-9])/)
  if (monthYear) return { year: parseInt(monthYear[2], 10), month: parseInt(monthYear[1], 10) }
  return null
}

function bytesToBase64(u8: Uint8Array): string {
  let bin = ''
  const step = 0x8000
  for (let i = 0; i < u8.length; i += step) bin += String.fromCharCode(...u8.subarray(i, i + step))
  return btoa(bin)
}

// Split a PDF into base64 page-chunks each small enough to POST within Vercel's
// ~4.5 MB serverless request-body limit. A 5 MB+ statement base64-encodes to
// ~7 MB, which the platform rejects before the parser even runs — so we page it
// up in the browser and parse the chunks separately, then merge. Falls back to
// one whole-file chunk if the PDF can't be split (encrypted/odd encoding, or a
// single page). ~3 MB of source PDF per chunk keeps base64 comfortably < 4.5 MB.
async function splitPdfBase64Chunks(file: File, maxChunkBytes = 3 * 1024 * 1024): Promise<string[]> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (bytes.length <= maxChunkBytes) return [bytesToBase64(bytes)]
  try {
    const { PDFDocument } = await import('pdf-lib')
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const total = src.getPageCount()
    if (total <= 1) return [bytesToBase64(bytes)]
    // Pages per chunk from the average page size, so each chunk lands near the
    // budget without an expensive grow-and-measure loop.
    const pagesPerChunk = Math.max(1, Math.floor(maxChunkBytes / (bytes.length / total)))
    const chunks: string[] = []
    for (let start = 0; start < total; start += pagesPerChunk) {
      const out = await PDFDocument.create()
      const idx = Array.from({ length: Math.min(pagesPerChunk, total - start) }, (_, k) => start + k)
      const pages = await out.copyPages(src, idx)
      pages.forEach((p) => out.addPage(p))
      chunks.push(bytesToBase64(await out.save()))
    }
    return chunks
  } catch {
    return [bytesToBase64(bytes)]
  }
}

// Parse CSV text into rows of fields, honouring quoted fields (commas/quotes
// inside quotes). Used to render the source preview as a readable table.
function parseCsvRows(text: string, maxRows = 2000): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length && rows.length < maxRows; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else inQuotes = false
      } else field += c
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field); field = ''
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = ''
    } else if (c !== '\r') {
      field += c
    }
  }
  if ((field.length || row.length) && rows.length < maxRows) { row.push(field); rows.push(row) }
  return rows
}

// Months (1-12) of `year` that a statement covers — from its stored period, a
// range parsed from the filename, or its single representative month.
function coveredMonthsInYear(d: StatementDoc, year: number): number[] {
  let s = d.periodStart
  let e = d.periodEnd
  if (!s || !e) {
    const fp = parseFilePeriod(d.fileName)
    if (fp) { s = fp.start; e = fp.end }
  }
  if (s && e) {
    const st = new Date(s).getTime()
    const en = new Date(e).getTime()
    const out: number[] = []
    for (let m = 1; m <= 12; m++) {
      const first = Date.UTC(year, m - 1, 1)
      const last = Date.UTC(year, m, 0)
      if (first <= en && last >= st) out.push(m)
    }
    return out
  }
  if (d.statementDate && new Date(d.statementDate).getUTCFullYear() === year) {
    return [new Date(d.statementDate).getUTCMonth() + 1]
  }
  return []
}

// Whether a statement can be placed on the grid at all (has period, filename
// range, or a single month).
function docHasPeriod(d: StatementDoc): boolean {
  return !!(d.periodStart || d.periodEnd || d.statementDate || parseFilePeriod(d.fileName))
}

interface ParsedTransaction {
  date: string
  description: string
  amount: number // negative = debit, positive = credit
  currency: string
  amountUSD: number
  category: string // canonical DB category name, or '' if unmatched
  status: 'categorised' | 'needs-review'
  alreadyImported?: boolean // already in Flow (matched on re-import)
  aiSuggested?: boolean // category proposed by Claude (review before saving)
}

/**
 * A statement Flow could read but has nothing to import from — either a period
 * with no activity ('empty') or a file it couldn't parse ('unreadable'). Both
 * are still filed so the coverage grid reflects that the statement exists; only
 * an empty one counts as reconciled (there was genuinely nothing to import).
 */
interface EmptyStatement {
  kind: 'empty' | 'unreadable'
  reason: string
  /** The underlying cause from /api/parse-pdf, shown so a failure is diagnosable. */
  detail?: string
}

interface ColumnMapping {
  dateCol: number
  descCol: number
  amountCol: number
  debitCol?: number
  creditCol?: number
  stateCol?: number
}

// Only these statuses actually moved money; anything else (reverted, declined,
// failed, pending…) is on the statement but never hit the balance, so importing
// it would break reconciliation.
const COMPLETED_STATES = new Set(['completed', 'complete', 'settled', 'posted', 'success', 'successful'])

interface MerchantMapping {
  pattern: string
  categoryName: string
}

interface SkippedRow {
  line: number
  reason: string
  raw: string
}

// Reconciliation evidence: proves every line in the file is accounted for.
interface Reconciliation {
  fileLines: number // non-empty lines in the file
  dataRows: number // excluding the header
  parsed: number
  skipped: SkippedRow[]
  sumCredits: number // local currency
  sumDebits: number
  imported: number | null // rows saved (after save)
  duplicates: number | null // rows skipped as already-imported (after save)
}

// ---------------------------------------------------------------------------
// CSV parsing utilities
// ---------------------------------------------------------------------------

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    const nextChar = text[i + 1]

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"'
        i++
      } else if (char === '"') {
        inQuotes = false
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField.trim())
        currentField = ''
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField.trim())
        if (currentRow.some((field) => field !== '')) rows.push(currentRow)
        currentRow = []
        currentField = ''
        if (char === '\r') i++
      } else {
        currentField += char
      }
    }
  }

  currentRow.push(currentField.trim())
  if (currentRow.some((field) => field !== '')) rows.push(currentRow)

  return rows
}

function detectColumns(headers: string[]): ColumnMapping | null {
  const lower = headers.map((h) => h.toLowerCase())

  let dateCol = -1
  let descCol = -1
  let amountCol = -1
  let debitCol: number | undefined
  let creditCol: number | undefined
  let stateCol: number | undefined

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (dateCol === -1 && (h.includes('date') || h.includes('posted'))) dateCol = i
    if (
      descCol === -1 &&
      (h.includes('description') || h.includes('narrative') || h.includes('details') ||
        h.includes('memo') || h.includes('particulars') || h.includes('reference'))
    ) {
      descCol = i
    }
    if (amountCol === -1 && h === 'amount') amountCol = i
    if (h.includes('debit') || h.includes('withdrawal')) debitCol = i
    if (h.includes('credit') || h.includes('deposit')) creditCol = i
    if (stateCol === undefined && (h === 'state' || h === 'status')) stateCol = i
  }

  if (amountCol === -1 && debitCol === undefined && creditCol === undefined) {
    for (let i = 0; i < lower.length; i++) {
      if (lower[i].includes('amount') || lower[i].includes('value') || lower[i].includes('sum')) {
        amountCol = i
        break
      }
    }
  }

  if (dateCol === -1) dateCol = 0
  if (descCol === -1) descCol = Math.min(1, headers.length - 1)

  if (amountCol === -1 && debitCol === undefined && creditCol === undefined) return null

  return { dateCol, descCol, amountCol, debitCol, creditCol, stateCol }
}

/**
 * Normalise a statement date to ISO (YYYY-MM-DD). ISO passes through; slash/dash
 * formats are treated as day-first (DD/MM/YYYY) to match UK/UAE bank exports.
 * Anything unrecognised is returned unchanged for Postgres to try.
 */
function normalizeDate(raw: string): string {
  const s = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const day = m[1].padStart(2, '0')
    const month = m[2].padStart(2, '0')
    const year = m[3].length === 2 ? `20${m[3]}` : m[3]
    return `${year}-${month}-${day}`
  }
  return s
}

// Best-effort year from a statement filename, e.g. "…23-JAN-26…" -> 2026,
// "…2024…" -> 2024. Used to file bulk uploads by year.
function yearFromFileName(name: string): number | null {
  const mon = name.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-_ ]?(\d{2})\b/i)
  if (mon) {
    const y = parseInt(mon[2], 10)
    if (y >= 15 && y <= 45) return 2000 + y
  }
  const m4 = name.match(/20(\d{2})/)
  if (m4) return parseInt(`20${m4[1]}`, 10)
  return null
}

function formatLocal(amount: number, currency: string): string {
  const symbol =
    currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'AED' ? 'AED ' : `${currency} `
  return `${amount < 0 ? '-' : ''}${symbol}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The statement's month, inferred from the transactions it contains: the most
// common YYYY-MM across the rows (statements often spill a day or two into the
// next month, so the mode beats min/max). Returns a first-of-month date string.
function statementMonthFromTxns(txns: { date: string }[]): string | null {
  const counts = new Map<string, number>()
  for (const t of txns) {
    const m = (t.date || '').slice(0, 7) // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(m)) counts.set(m, (counts.get(m) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [m, n] of counts) if (n > bestN) { best = m; bestN = n }
  return best ? `${best}-01` : null
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [selectedAccountId, setSelectedAccountId] = useState<string>('')
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<string | null>(null)
  const [mappings, setMappings] = useState<MerchantMapping[]>([])
  const [recon, setRecon] = useState<Reconciliation | null>(null)
  // A statement with nothing to import (no transactions, or unreadable) — kept
  // so it can still be filed against a month instead of being thrown away.
  const [emptyStatement, setEmptyStatement] = useState<EmptyStatement | null>(null)
  const [emptyPeriod, setEmptyPeriod] = useState<{ year: number; month: number } | null>(null)
  const [fxRates, setFxRates] = useState<Record<string, number> | null>(null)
  // Optional statement balances for the reconciliation check (local currency).
  const [openingBalance, setOpeningBalance] = useState('')
  const [closingBalance, setClosingBalance] = useState('')
  // Whether the current account selection was auto-detected from the file.
  const [autoDetected, setAutoDetected] = useState(false)
  // Raw CSV kept so a manual account override can re-parse without re-dropping.
  const [rawText, setRawText] = useState<string | null>(null)
  const [rawFileName, setRawFileName] = useState('')
  // Whether the user has expanded the account picker to override the detection.
  const [changingAccount, setChangingAccount] = useState(false)
  // Learned account fingerprints + the archived statement library.
  const [hints, setHints] = useState<AccountHint[]>([])
  const [documents, setDocuments] = useState<StatementDoc[]>([])
  // PDF import: rows extracted by Claude, held so the account picker can rebuild,
  // plus the raw PDF for archiving on confirm.
  const [pendingPdfRows, setPendingPdfRows] = useState<
    { date: string; description: string; amount: number }[] | null
  >(null)
  const [pdfDoc, setPdfDoc] = useState<{ base64: string; fileName: string; format: string; originDocId?: string | null } | null>(null)
  // When re-extracting a statement already saved in the archive (PDF or CSV),
  // its id — so on confirm we update that row in place instead of duplicating it.
  const [originDocId, setOriginDocId] = useState<string | null>(null)
  // Set while extracting a statement that's already saved in the archive, so its
  // card can show a spinner and we can mark it imported (not duplicated) on save.
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)
  const [viewer, setViewer] = useState<DocViewerTarget | null>(null)
  // Coverage grid: the year in view, and an optional cell (account+month) the
  // list below is narrowed to.
  const [gridYear, setGridYear] = useState<number>(new Date().getFullYear())
  const [cellFilter, setCellFilter] = useState<{ account: string; month: number } | null>(null)
  // Months marked "no statement expected" (no activity / account didn't exist),
  // keyed `${accountId}|${month}` for the year in view — so legit gaps aren't
  // flagged as missing.
  const [skips, setSkips] = useState<Set<string>>(new Set())
  // Multi-select for bulk editing statements (account / period) in one go.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  // Frozen list layout (order + section + account group) so editing a row's
  // account/period doesn't make it jump around mid-edit. Rebuilt only on
  // structural changes (a doc added/removed, or the year switched) — i.e. once
  // you're "done", not on every field change.
  const [layout, setLayout] = useState<Map<string, { ord: number; undated: boolean; account: string }>>(new Map())
  // Rows manually expanded to a From–To month range. Most statements cover one
  // month (a single picker); only the few full-period exports need a range.
  const [rangeRows, setRangeRows] = useState<Set<string>>(new Set())

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      setDocuments(data.documents || [])
    } catch {
      /* ignore */
    }
  }, [])

  // Load the "no statement expected" marks for the year in view.
  const loadSkips = useCallback(async (year: number) => {
    try {
      const res = await fetch(`/api/statement-skips?year=${year}`)
      if (!res.ok) throw new Error()
      const d = await res.json()
      setSkips(new Set((d.skips || []).map((s: { accountId: string; month: number }) => `${s.accountId}|${s.month}`)))
    } catch {
      setSkips(new Set())
    }
  }, [])
  useEffect(() => { loadSkips(gridYear) }, [gridYear, loadSkips])

  // Toggle a month as "no statement expected" for an account (optimistic).
  const toggleSkip = useCallback(async (accountId: string, month: number) => {
    const key = `${accountId}|${month}`
    const next = !skips.has(key)
    setSkips((prev) => {
      const s = new Set(prev)
      if (next) s.add(key)
      else s.delete(key)
      return s
    })
    try {
      await fetch('/api/statement-skips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, year: gridYear, month, skip: next }),
      })
    } catch {
      loadSkips(gridYear)
    }
  }, [skips, gridYear, loadSkips])

  // Snapshot the list layout: order (account → month → name), which section a
  // doc sits in, and its account group. Recomputed only on structural changes.
  const buildLayout = useCallback((docs: StatementDoc[]) => {
    const acct = (d: StatementDoc) => d.accountName ?? 'Unassigned'
    const ordered = [...docs].sort((a, b) => {
      const aa = acct(a), ba = acct(b)
      if (aa !== ba) return aa === 'Unassigned' ? 1 : ba === 'Unassigned' ? -1 : aa.localeCompare(ba)
      const am = coveredMonthsInYear(a, gridYear)[0] ?? 99
      const bm = coveredMonthsInYear(b, gridYear)[0] ?? 99
      if (am !== bm) return am - bm
      return a.fileName.localeCompare(b.fileName)
    })
    const map = new Map<string, { ord: number; undated: boolean; account: string }>()
    ordered.forEach((d, i) => map.set(d.id, { ord: i, undated: !docHasPeriod(d), account: acct(d) }))
    setLayout(map)
  }, [gridYear])

  // Rebuild the frozen layout only when the set of docs changes size (add/remove)
  // or the year switches — never on an in-place field edit, so rows stay put.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { buildLayout(documents) }, [documents.length, gridYear, buildLayout])

  // ---- Load real accounts + categories + learned mappings + FX + hints ----
  useEffect(() => {
    async function load() {
      try {
        const [accRes, catRes, mapRes, fxRes, hintRes] = await Promise.all([
          fetch('/api/accounts'),
          fetch('/api/categories'),
          fetch('/api/merchant-mappings'),
          fetch('/api/fx'),
          fetch('/api/account-hints'),
        ])
        const accData = await accRes.json()
        let catData = await catRes.json()
        const mapData = await mapRes.json()
        const fxData = await fxRes.json()
        const hintData = await hintRes.json()

        // Ensure the "Credit Card Payment" transfer category exists so
        // balance-payment lines can be excluded from the P&L.
        const hasCcPayment = (catData.categories || []).some(
          (c: { name: string }) => c.name === 'Credit Card Payment',
        )
        if (!hasCcPayment) {
          try {
            await fetch('/api/categories', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: 'Credit Card Payment',
                type: 'transfer',
                colorHex: '#475569',
                iconName: 'credit-card',
              }),
            })
            catData = await (await fetch('/api/categories')).json()
          } catch {
            /* keep going with the categories we have */
          }
        }

        setAccounts(accData.accounts || [])
        setCategories(catData.categories || [])
        setMappings(mapData.mappings || [])
        if (fxData?.rates) setFxRates(fxData.rates)
        setHints(hintData.hints || [])
        // No default account — it's detected from the file (or picked on drop).
      } catch {
        // Leave lists empty; the UI will prompt to check the connection.
      }
    }
    load()
    loadDocuments()
  }, [loadDocuments])

  const account = accounts.find((a) => a.id === selectedAccountId)
  const expenseCategories = categories.filter((c) => c.type === 'expense')
  const incomeCategories = categories.filter((c) => c.type === 'income')
  const transferCategories = categories.filter((c) => c.type === 'transfer')
  const investmentCategories = categories.filter((c) => c.type === 'investment')

  // Self-learning review pass. For each freshly-parsed statement:
  //  1. reuse the saved category for rows already in Flow (re-imports),
  //  2. ask Claude to categorise anything still unknown (analyses the merchant),
  // so you rarely start from scratch — and every choice you keep is learned.
  const annotatedRef = useRef<ParsedTransaction[] | null>(null)
  const [aiBusy, setAiBusy] = useState(false)
  useEffect(() => {
    if (!account || parsedTransactions.length === 0) return
    if (annotatedRef.current === parsedTransactions) return
    const current = parsedTransactions
    annotatedRef.current = current
    let cancelled = false

    ;(async () => {
      let next = current

      // 1. Reuse categories for already-imported rows.
      try {
        const rows = current.map((tx) => ({ date: tx.date, description: tx.description, amountLocal: Math.abs(tx.amount) }))
        const { results } = await (
          await fetch('/api/transactions/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accountId: account.id, rows }),
          })
        ).json()
        if (Array.isArray(results)) {
          next = next.map((tx, i) =>
            results[i]?.matched
              ? {
                  ...tx,
                  category: results[i].categoryName ?? tx.category,
                  status: (results[i].categoryName ? 'categorised' : tx.status) as ParsedTransaction['status'],
                  alreadyImported: true,
                }
              : tx,
          )
        }
      } catch {
        /* fall through */
      }

      // 2. Claude categorises rows still without a category.
      const unknown = next.map((tx, i) => ({ tx, i })).filter(({ tx }) => !tx.category && !tx.alreadyImported)
      if (unknown.length && categories.length) {
        setAiBusy(true)
        try {
          const { results: ai } = await (
            await fetch('/api/categorise-ai', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                descriptions: unknown.map(({ tx }) => tx.description),
                amounts: unknown.map(({ tx }) => tx.amount),
                categories: categories.map((c) => ({ name: c.name, type: c.type })),
              }),
            })
          ).json()
          if (Array.isArray(ai)) {
            const suggByIdx = new Map<number, string>()
            unknown.forEach(({ i }, k) => {
              const name = ai[k]?.categoryName
              if (name) suggByIdx.set(i, name)
            })
            next = next.map((tx, i) =>
              suggByIdx.has(i)
                ? { ...tx, category: suggByIdx.get(i)!, status: 'categorised', aiSuggested: true }
                : tx,
            )
          }
        } catch {
          /* leave as needs-review */
        } finally {
          if (!cancelled) setAiBusy(false)
        }
      }

      if (cancelled) return
      setParsedTransactions((prev) => {
        if (prev !== current) return prev
        annotatedRef.current = next
        return next
      })
    })()

    return () => {
      cancelled = true
    }
  }, [parsedTransactions, account, categories])

  // The file being reviewed and the statement date Claude read off it (PDFs),
  // held in refs so the "nothing to import" path can date the statement without
  // threading them through every parse callback.
  const fileNameRef = useRef<string>('')
  const statementDateHintRef = useRef<string | null>(null)
  // Whether the month below was chosen by hand — re-parsing (e.g. after picking
  // the account) must not overwrite it with the guess.
  const emptyPeriodTouchedRef = useRef(false)

  // Flag the current statement as having nothing to import, and pre-fill the
  // month it covers from the statement date Claude read (PDFs) or the filename —
  // the transactions that would normally date it don't exist.
  const markEmptyStatement = useCallback((kind: EmptyStatement['kind'], reason: string, detail?: string) => {
    setParseError(null)
    setParsedTransactions([])
    setEmptyStatement({ kind, reason, detail })
    if (!emptyPeriodTouchedRef.current) {
      setEmptyPeriod(
        monthFromDateString(statementDateHintRef.current) ?? monthFromFileName(fileNameRef.current),
      )
    }
  }, [])

  // Parse a statement's text against a chosen account. When `forced` is passed
  // (a manual override) detection is skipped; otherwise the account is detected
  // from the filename + header.
  const processStatement = useCallback(
    (text: string, fileName: string, forced?: AccountOption) => {
      setParseError(null)
      setEmptyStatement(null)

      const detected = forced ? null : detectAccount(fileName, text.slice(0, 4000), accounts, hints)
      const activeAccount = forced ?? detected?.account
      setAutoDetected(!!detected && !forced)

      if (!activeAccount) {
        setSelectedAccountId('')
        setParsedTransactions([])
        setRecon(null)
        setChangingAccount(true)
        setParseError(
          "Couldn't tell which account this statement is for — choose it below.",
        )
        return
      }
      setSelectedAccountId(activeAccount.id)
      setChangingAccount(false)

      const rows = parseCSV(text)
      if (rows.length === 0 || text.trim() === '') {
        setParseError('That file is empty — there is nothing to read or save.')
        return
      }
      // A header row with no data rows is a real statement for a month with no
      // activity, not a broken file: keep it so it can still be filed.
      if (rows.length < 2) {
        setRecon({
          fileLines: rows.length,
          dataRows: 0,
          parsed: 0,
          skipped: [],
          sumCredits: 0,
          sumDebits: 0,
          imported: null,
          duplicates: null,
        })
        markEmptyStatement('empty', 'This statement lists no transactions.')
        return
      }
      const mapping = detectColumns(rows[0])
      if (!mapping) {
        setRecon(null)
        markEmptyStatement(
          'unreadable',
          'Could not auto-detect columns — the CSV needs date, description, and amount/debit/credit headers.',
        )
        return
      }

      const transactions: ParsedTransaction[] = []
      const skipped: SkippedRow[] = []
      let sumCredits = 0
      let sumDebits = 0
      const dataRows = rows.length - 1

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
        const dateRaw = row[mapping.dateCol] ?? ''
        let description = row[mapping.descCol] ?? ''

        // Some exports (e.g. Monzo pot round-ups, transfers) leave the primary
        // description blank but carry the detail in another column. Fall back to
        // the longest non-numeric text cell so a row is never left unlabelled.
        if (!description.trim()) {
          const skipCols = new Set(
            [mapping.dateCol, mapping.amountCol, mapping.debitCol, mapping.creditCol, mapping.stateCol].filter(
              (c): c is number => c !== undefined,
            ),
          )
          let best = ''
          for (let c = 0; c < row.length; c++) {
            if (skipCols.has(c)) continue
            const cell = (row[c] ?? '').trim()
            if (!cell || /^[-+]?[\d.,\s£$€]+$/.test(cell)) continue // skip pure numbers/currency
            if (cell.length > best.length) best = cell
          }
          description = best || '(no description)'
        }

        if (row.length < 2 || (!dateRaw && !description)) {
          skipped.push({
            line: i + 1,
            reason: row.length < 2 ? 'Too few columns' : 'No date or description',
            raw: row.join(', ').slice(0, 80),
          })
          continue
        }

        // Skip rows that never actually moved money (reverted, declined, …).
        if (mapping.stateCol !== undefined) {
          const state = (row[mapping.stateCol] ?? '').trim().toLowerCase()
          if (state && !COMPLETED_STATES.has(state)) {
            skipped.push({
              line: i + 1,
              reason: `Not completed (${row[mapping.stateCol]})`,
              raw: `${description} ${row[mapping.amountCol] ?? ''}`.slice(0, 80),
            })
            continue
          }
        }

        let amount = 0
        if (mapping.amountCol !== -1 && row[mapping.amountCol]) {
          amount = parseFloat(row[mapping.amountCol].replace(/[^0-9.\-]/g, '')) || 0
        } else if (mapping.debitCol !== undefined || mapping.creditCol !== undefined) {
          const debit = mapping.debitCol !== undefined ? parseFloat(row[mapping.debitCol]?.replace(/[^0-9.\-]/g, '') ?? '0') || 0 : 0
          const credit = mapping.creditCol !== undefined ? parseFloat(row[mapping.creditCol]?.replace(/[^0-9.\-]/g, '') ?? '0') || 0 : 0
          amount = credit - debit
        }

        if (amount >= 0) sumCredits += amount
        else sumDebits += amount

        const learned = mappings.find((m) => merchantMatches(description, m.pattern))
        // Learned mappings win; everything else is left for Claude to assess.
        const category = learned?.categoryName ?? ''
        const amountUSD = convertToUSD(amount, activeAccount.currency, fxRates ?? undefined)

        transactions.push({
          date: normalizeDate(dateRaw),
          description,
          amount,
          currency: activeAccount.currency,
          amountUSD,
          category,
          status: category ? 'categorised' : 'needs-review',
        })
      }

      setParsedTransactions(transactions)
      setRecon({
        fileLines: rows.length,
        dataRows,
        parsed: transactions.length,
        skipped,
        sumCredits,
        sumDebits,
        imported: null,
        duplicates: null,
      })
      // Every row was a non-transaction (reverted, declined, blank…): there's
      // nothing to import, but the statement itself still counts.
      if (transactions.length === 0) {
        markEmptyStatement(
          'empty',
          `No transactions to import — all ${dataRows} row${dataRows !== 1 ? 's' : ''} on this statement were skipped.`,
        )
      }
    },
    [accounts, mappings, fxRates, hints, markEmptyStatement],
  )

  // Build the review list from already-extracted rows (used by the PDF path,
  // where Claude has done the parsing). Mirrors the CSV categorisation + FX.
  const buildPdfTransactions = useCallback(
    (rows: { date: string; description: string; amount: number }[], activeAccount: AccountOption) => {
      const transactions: ParsedTransaction[] = []
      let sumCredits = 0
      let sumDebits = 0
      for (const r of rows) {
        const amount = r.amount
        if (amount >= 0) sumCredits += amount
        else sumDebits += amount
        const learned = mappings.find((m) => merchantMatches(r.description, m.pattern))
        const category = learned?.categoryName ?? ''
        transactions.push({
          date: normalizeDate(r.date),
          description: r.description,
          amount,
          currency: activeAccount.currency,
          amountUSD: convertToUSD(amount, activeAccount.currency, fxRates ?? undefined),
          category,
          status: category ? 'categorised' : 'needs-review',
        })
      }
      setParsedTransactions(transactions)
      setRecon({
        fileLines: rows.length,
        dataRows: rows.length,
        parsed: transactions.length,
        skipped: [],
        sumCredits,
        sumDebits,
        imported: null,
        duplicates: null,
      })
      if (transactions.length === 0) {
        markEmptyStatement('empty', 'Claude read the statement and it lists no transactions.')
      } else {
        setEmptyStatement(null)
      }
    },
    [mappings, fxRates, markEmptyStatement],
  )

  const handleFileSelect = useCallback(
    async (
      selectedFile: File,
      originDocId?: string | null,
      preferredAccountId?: string | null,
      knownStatementDate?: string | null,
    ) => {
      setFile(selectedFile)
      setParseError(null)
      setSaveResult(null)
      setAutoDetected(false)
      setPendingPdfRows(null)
      setPdfDoc(null)
      setOriginDocId(originDocId ?? null)
      setEmptyStatement(null)
      setEmptyPeriod(null)
      fileNameRef.current = selectedFile.name
      // A statement already filed under a month keeps that month if it turns out
      // to have nothing to import.
      statementDateHintRef.current = knownStatementDate ?? null
      emptyPeriodTouchedRef.current = false

      const isPdf = selectedFile.name.toLowerCase().endsWith('.pdf')
      const isCsv = selectedFile.name.toLowerCase().endsWith('.csv')

      // Read the file to base64 once (used for PDF parsing and/or archiving).
      const readBase64 = async () => {
        const bytes = new Uint8Array(await selectedFile.arrayBuffer())
        let bin = ''
        const step = 0x8000
        for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step))
        return btoa(bin)
      }

      // PDF: extract transactions with Claude, then run the normal review flow.
      if (isPdf) {
        setRawText(null)
        setParsedTransactions([])
        setIsProcessing(true)
        try {
          const base64 = await readBase64()
          // Page the PDF up so each request stays under the serverless body
          // limit, parse the chunks, and merge — big statements would otherwise
          // be rejected whole (base64 ~4/3 the file size).
          const chunks = await splitPdfBase64Chunks(selectedFile)
          const data: { transactions: { date: string; description: string; amount: number }[]; bankHint: string; statementDate: string | null } = {
            transactions: [],
            bankHint: '',
            statementDate: null,
          }
          let anyOk = false
          let errMsg = ''
          let errDetail = ''
          for (const chunkB64 of chunks) {
            const res = await fetch('/api/parse-pdf', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contentBase64: chunkB64 }),
            })
            // A timed-out/edge response can be an HTML error page, not JSON — read
            // defensively so it surfaces a clear message instead of throwing.
            let d: { error?: string; detail?: string; transactions?: { date: string; description: string; amount: number }[]; bankHint?: string; statementDate?: string | null } = {}
            try {
              d = await res.json()
            } catch {
              d = {}
            }
            if (res.ok && Array.isArray(d.transactions)) {
              anyOk = true
              data.transactions.push(...d.transactions)
              if (!data.bankHint && d.bankHint) data.bankHint = d.bankHint
              if (!data.statementDate && d.statementDate) data.statementDate = d.statementDate
            } else if (!errMsg) {
              errMsg =
                d.error ||
                (res.status === 504 || res.status === 408
                  ? 'That statement took too long to read — please try Extract again.'
                  : 'Could not read that PDF.')
              errDetail = d.detail ?? ''
            }
          }
          const rows: { date: string; description: string; amount: number }[] = data.transactions || []
          const format = `PDF · ${data.bankHint || 'statement'}`
          statementDateHintRef.current = statementDateHintRef.current ?? data.statementDate
          // Keep the PDF around either way: even one we couldn't read is still a
          // statement worth filing, rather than being dropped on the floor.
          setPdfDoc({ base64, fileName: selectedFile.name, format: anyOk ? format : 'PDF', originDocId: originDocId ?? null })
          setPendingPdfRows(anyOk ? rows : null)
          if (!anyOk) {
            const known = preferredAccountId ? accounts.find((a) => a.id === preferredAccountId) : null
            const failAccount = known ?? detectAccount(selectedFile.name, '', accounts, hints)?.account ?? null
            setAutoDetected(!known && !!failAccount)
            setSelectedAccountId(failAccount?.id ?? '')
            setChangingAccount(!failAccount)
            markEmptyStatement('unreadable', errMsg || 'Could not read that PDF.', errDetail)
            return
          }

          // If we're extracting a statement already filed under an account (e.g.
          // "Extract & categorise" from the archive), use that account — don't
          // re-detect from the meaningless filename and end up asking again.
          const preferred = preferredAccountId ? accounts.find((a) => a.id === preferredAccountId) : null
          const detected = preferred ? null : detectAccount(selectedFile.name, String(data.bankHint || ''), accounts, hints)
          const chosen = preferred ?? detected?.account ?? null
          setAutoDetected(!!chosen)
          if (chosen) {
            setSelectedAccountId(chosen.id)
            setChangingAccount(false)
            buildPdfTransactions(rows, chosen)
          } else {
            setSelectedAccountId('')
            setChangingAccount(true)
            if (rows.length === 0) {
              markEmptyStatement('empty', 'Claude read the statement and it lists no transactions.')
            } else {
              setParseError("Read the statement — now choose which account it's for below.")
            }
          }
        } catch {
          setParseError('Failed to read that PDF. Try a CSV export instead.')
        } finally {
          setIsProcessing(false)
        }
        return
      }

      // Other non-CSV files (images, xlsx…): archive only.
      if (!isCsv) {
        setRawText(null)
        setParsedTransactions([])
        setIsProcessing(true)
        try {
          const res = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: null,
              fileName: selectedFile.name,
              mimeType: selectedFile.type || 'application/octet-stream',
              contentBase64: await readBase64(),
              source: 'upload',
            }),
          })
          if (!res.ok) throw new Error('save failed')
          setSaveResult(`Saved ${selectedFile.name} to your statements.`)
          await loadDocuments()
        } catch {
          setParseError('Could not save that file — it may be over the 4 MB limit.')
        } finally {
          setIsProcessing(false)
          setFile(null)
        }
        return
      }

      setIsProcessing(true)
      try {
        const text = await selectedFile.text()
        setRawText(text)
        setRawFileName(selectedFile.name)
        processStatement(text, selectedFile.name)
      } catch {
        setParseError('Failed to parse the CSV file. Please check the file format.')
      } finally {
        setIsProcessing(false)
      }
    },
    [processStatement, loadDocuments, accounts, hints, buildPdfTransactions, markEmptyStatement],
  )

  // Extract & categorise a statement that's already saved in the archive: pull
  // its stored bytes back down and run them through the very same review flow as
  // a fresh upload. On confirm it flips the saved file from "uploaded" to
  // "imported" in place (see handleConfirmImport) rather than duplicating it.
  const processSavedDoc = useCallback(
    async (doc: StatementDoc) => {
      if (reprocessingId) return
      setReprocessingId(doc.id)
      setSaveResult(null)
      setParseError(null)
      try {
        const res = await fetch(`/api/documents/${doc.id}`)
        if (!res.ok) throw new Error('fetch failed')
        const blob = await res.blob()
        const type = doc.fileName.toLowerCase().endsWith('.pdf')
          ? 'application/pdf'
          : blob.type || 'application/octet-stream'
        const file = new File([blob], doc.fileName, { type })
        if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
        // The saved doc already knows its account (and month) — use them so we
        // don't ask again.
        await handleFileSelect(file, doc.id, doc.accountId, doc.periodStart ?? doc.statementDate)
      } catch {
        setParseError('Could not open that saved statement to extract it. Please try again.')
      } finally {
        setReprocessingId(null)
      }
    },
    [reprocessingId, handleFileSelect],
  )

  // Manual override: re-parse the same file against the chosen account, and
  // remember this account's fingerprint so its format auto-detects next time.
  const handleAccountChange = useCallback(
    (accountId: string) => {
      const acc = accounts.find((a) => a.id === accountId)
      setSelectedAccountId(accountId)
      setChangingAccount(false)
      if (!acc) return

      // PDF: rebuild from the rows Claude extracted; learn the filename + format.
      if (pendingPdfRows) {
        setParseError(null)
        if (pendingPdfRows.length > 0) buildPdfTransactions(pendingPdfRows, acc)
        fetch('/api/account-hints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            headerSignature: pdfDoc?.format ?? '',
            fileName: pdfDoc?.fileName ?? '',
          }),
        })
          .then(() => fetch('/api/account-hints'))
          .then((r) => r.json())
          .then((d) => setHints(d.hints || []))
          .catch(() => {})
        return
      }

      if (rawText) {
        processStatement(rawText, rawFileName, acc)
        fetch('/api/account-hints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId,
            headerSignature: headerSignature(rawText),
            fileName: rawFileName,
          }),
        })
          .then(() => fetch('/api/account-hints'))
          .then((r) => r.json())
          .then((d) => setHints(d.hints || []))
          .catch(() => {})
      }
    },
    [accounts, rawText, rawFileName, processStatement, pendingPdfRows, pdfDoc, buildPdfTransactions],
  )

  const refreshCategories = useCallback(async () => {
    try {
      const data = await (await fetch('/api/categories')).json()
      const list: CategoryOption[] = data.categories || []
      setCategories(list)
      return list
    } catch {
      return categories
    }
  }, [categories])

  // Create a new category on the fly while reviewing and assign it to the row.
  // The type is inferred from the transaction (credits → income, else expense).
  const addCategoryForRow = useCallback(
    async (index: number) => {
      const name = window.prompt('New category name:')?.trim()
      if (!name) return
      const tx = parsedTransactions[index]
      const type = tx && tx.amount > 0 ? 'income' : 'expense'
      try {
        await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type }),
        })
        const list = await refreshCategories()
        const pattern = deriveMerchantPattern(tx?.description ?? '')
        setParsedTransactions((prev) =>
          prev.map((t, i) => {
            if (i === index) return { ...t, category: name, status: 'categorised', aiSuggested: false }
            if (pattern && !t.alreadyImported && (!t.category || t.aiSuggested) && deriveMerchantPattern(t.description) === pattern) {
              return { ...t, category: name, status: 'categorised', aiSuggested: false }
            }
            return t
          }),
        )
        // Learn the mapping for next time.
        const cat = list.find((c) => c.name === name)
        if (cat && tx?.description) {
          fetch('/api/merchant-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: tx.description, categoryId: cat.id }),
          }).catch(() => {})
        }
      } catch {
        /* leave the row unchanged */
      }
    },
    [parsedTransactions, refreshCategories],
  )

  const handleCategoryChange = useCallback(
    (index: number, newCategory: string) => {
      if (newCategory === '__new__') {
        void addCategoryForRow(index)
        return
      }
      let description = ''
      setParsedTransactions((prev) => {
        description = prev[index]?.description ?? ''
        // Cascade the choice to every other row from the same merchant in this
        // statement that you haven't already set yourself (empty or an AI/auto
        // guess) — categorise once, the rest fill in.
        const pattern = newCategory ? deriveMerchantPattern(description) : ''
        return prev.map((tx, i) => {
          if (i === index) {
            return { ...tx, category: newCategory, status: newCategory ? 'categorised' : 'needs-review', aiSuggested: false }
          }
          if (
            newCategory &&
            pattern &&
            !tx.alreadyImported &&
            (!tx.category || tx.aiSuggested) &&
            deriveMerchantPattern(tx.description) === pattern
          ) {
            return { ...tx, category: newCategory, status: 'categorised', aiSuggested: false }
          }
          return tx
        })
      })
      // Self-learning: a manual correction during review teaches the mapping.
      const cat = categories.find((c) => c.name === newCategory)
      if (cat && description) {
        fetch('/api/merchant-mappings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, categoryId: cat.id }),
        }).catch(() => {})
      }
    },
    [categories, addCategoryForRow],
  )

  // ---- Bulk review queue: drop many statements, review/categorise each ----
  const queueRef = useRef<File[]>([])
  const [queueInfo, setQueueInfo] = useState<{ total: number; remaining: number }>({ total: 0, remaining: 0 })

  const advanceQueue = useCallback(() => {
    const next = queueRef.current.shift()
    setQueueInfo((s) => ({ total: s.total, remaining: queueRef.current.length }))
    if (next) handleFileSelect(next)
    else setQueueInfo({ total: 0, remaining: 0 })
  }, [handleFileSelect])

  const startReviewQueue = useCallback(
    (files: File[]) => {
      if (!files.length) return
      setSaveResult(null)
      setParseError(null)
      queueRef.current = files.slice(1)
      setQueueInfo({ total: files.length, remaining: files.length - 1 })
      handleFileSelect(files[0])
    },
    [handleFileSelect],
  )

  const archiveFile = useCallback(async (f: File, acctId: string | null) => {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer())
      let bin = ''
      const step = 0x8000
      for (let i = 0; i < bytes.length; i += step) bin += String.fromCharCode(...bytes.subarray(i, i + step))
      const year = yearFromFileName(f.name)
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: acctId,
          fileName: f.name,
          mimeType: f.type || 'application/octet-stream',
          contentBase64: btoa(bin),
          source: 'upload',
          statementDate: year ? `${year}-01-01` : null,
        }),
      })
    } catch {
      /* ignore */
    }
  }, [])

  const resetReview = useCallback(() => {
    setParsedTransactions([])
    setRecon(null)
    setEmptyStatement(null)
    setEmptyPeriod(null)
    emptyPeriodTouchedRef.current = false
    setRawText(null)
    setPdfDoc(null)
    setOriginDocId(null)
    setPendingPdfRows(null)
    setParseError(null)
    setFile(null)
    setSelectedAccountId('')
    setChangingAccount(false)
    setAutoDetected(false)
  }, [])

  // Skip the current statement (still filed to the archive) and move on.
  const skipCurrent = useCallback(async () => {
    if (file) await archiveFile(file, account?.id ?? null)
    resetReview()
    await loadDocuments()
    advanceQueue()
  }, [file, account, archiveFile, resetReview, loadDocuments, advanceQueue])

  // Give up on reviewing the rest — just file them all without importing.
  const skipAllRemaining = useCallback(async () => {
    const rest = queueRef.current
    queueRef.current = []
    setQueueInfo({ total: 0, remaining: 0 })
    if (file) await archiveFile(file, account?.id ?? null)
    for (const f of rest) {
      const d = detectAccount(f.name, '', accounts, hints)
      await archiveFile(f, d?.account?.id ?? null)
    }
    resetReview()
    setSaveResult(`Filed ${rest.length + (file ? 1 : 0)} statement${rest.length ? 's' : ''} without importing.`)
    await loadDocuments()
  }, [file, account, archiveFile, accounts, hints, resetReview, loadDocuments])

  const handleConfirmImport = async () => {
    if (!account || parsedTransactions.length === 0) return

    setIsSaving(true)
    setSaveResult(null)
    try {
      const catByName = new Map(categories.map((c) => [c.name, c]))
      const payload = parsedTransactions.map((tx) => {
        const cat = tx.category ? catByName.get(tx.category) : undefined
        // Type follows the category, always: an expense category stays an
        // expense even on a positive (refund) amount — so a "Car" row can never
        // land in the income section. Only uncategorised rows fall back to the
        // debit/credit sign.
        const type: 'income' | 'expense' | 'transfer' | 'investment' =
          (cat?.type as 'income' | 'expense' | 'transfer' | 'investment' | undefined) ??
          (tx.amount < 0 ? 'expense' : 'income')
        return {
          accountId: account.id,
          date: tx.date,
          description: tx.description,
          amountLocal: Math.abs(tx.amount),
          currency: tx.currency,
          amountUsd: Math.abs(tx.amountUSD),
          categoryName: tx.category || null,
          type,
          isInternalTransfer: cat?.type === 'transfer' && cat?.name === 'Internal Transfer',
        }
      })

      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: payload }),
      })
      if (!res.ok) throw new Error('Save failed')
      const data = await res.json()

      const dupNote =
        data.skipped > 0 ? ` (${data.skipped} duplicate${data.skipped !== 1 ? 's' : ''} skipped)` : ''
      setSaveResult(
        `Imported ${data.inserted} transaction${data.inserted !== 1 ? 's' : ''} into ${account.name}${dupNote}.`,
      )
      setRecon((prev) =>
        prev ? { ...prev, imported: data.inserted, duplicates: data.skipped ?? 0 } : prev,
      )

      // Auto-detect the statement month AND its full span from the transactions
      // themselves, so multi-month statements light up every month they cover on
      // the grid without manual tagging.
      const stmtDate = statementMonthFromTxns(parsedTransactions)
      const txDates = parsedTransactions.map((tx) => tx.date).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort()
      const periodStart = txDates[0] ?? null
      const periodEnd = txDates[txDates.length - 1] ?? null

      // Archive the statement. If we're re-importing one that's already saved
      // (extracted from the archive), update that row in place so it flips to
      // "imported" instead of creating a duplicate; otherwise file a fresh copy.
      // NB: do NOT touch the period/date here — the user sets the month in the
      // grid, and the transaction span can cross calendar months (e.g. a credit
      // card statement dated the 22nd), so recomputing it would wrongly widen a
      // single month back into a range.
      if (originDocId) {
        try {
          const patchRes = await fetch(`/api/documents/${originDocId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accountId: account.id,
              source: 'import',
              importedCount: data.inserted,
              dataRows: recon?.dataRows ?? null,
              formatSignature: pdfDoc ? pdfDoc.format : rawText ? headerSignature(rawText) : null,
            }),
          })
          if (!patchRes.ok) {
            setSaveResult((prev) => `${prev ?? ''} (but updating the saved statement failed)`)
          }
          await loadDocuments()
        } catch {
          setSaveResult((prev) => `${prev ?? ''} (but updating the saved statement failed)`)
        }
      } else {
        const archiveMeta: ArchiveMeta | null = pdfDoc
          ? {
              accountId: account.id,
              fileName: pdfDoc.fileName,
              mimeType: 'application/pdf',
              source: 'import',
              formatSignature: pdfDoc.format,
              importedCount: data.inserted,
              dataRows: recon?.dataRows ?? null,
              statementDate: stmtDate,
              periodStart,
              periodEnd,
            }
          : rawText
            ? {
                accountId: account.id,
                fileName: rawFileName || 'statement.csv',
                mimeType: 'text/csv',
                source: 'import',
                formatSignature: headerSignature(rawText),
                importedCount: data.inserted,
                dataRows: recon?.dataRows ?? null,
                statementDate: stmtDate,
                periodStart,
                periodEnd,
              }
            : null
        const archiveB64 = pdfDoc ? pdfDoc.base64 : rawText ? btoa(unescape(encodeURIComponent(rawText))) : ''

        if (archiveMeta) {
          try {
            const ok = await archiveDocument(archiveMeta, archiveB64)
            if (!ok) {
              setSaveResult((prev) => `${prev ?? ''} (but filing the statement to the archive failed)`)
            }
            await loadDocuments()
          } catch {
            setSaveResult((prev) => `${prev ?? ''} (but filing the statement to the archive failed)`)
          }
        }
      }

      // Self-learning bookkeeper: reinforce a merchant→category mapping from
      // every categorised row, so future statements auto-fill and get better
      // the more you categorise. Runs on every import.
      const catIdByName = new Map(categories.map((c) => [c.name, c.id]))
      const learnItems = parsedTransactions
        .filter((tx) => tx.category && catIdByName.has(tx.category))
        .map((tx) => ({ description: tx.description, categoryId: catIdByName.get(tx.category)! }))
      if (learnItems.length) {
        try {
          await fetch('/api/merchant-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: learnItems }),
          })
        } catch {
          /* best-effort */
        }
      }
      // Refresh learned mappings so the very next statement benefits.
      fetch('/api/merchant-mappings')
        .then((r) => r.json())
        .then((d) => setMappings(d.mappings || []))
        .catch(() => {})

      // Clear the whole review so the page returns to a clean state — only the
      // success banner and the updated Saved-statements list remain.
      setParsedTransactions([])
      setFile(null)
      setPendingPdfRows(null)
      setPdfDoc(null)
      setOriginDocId(null)
      setRawText(null)
      setRecon(null)
      setSelectedAccountId('')
      setChangingAccount(false)
      setAutoDetected(false)
      setOpeningBalance('')
      setClosingBalance('')

      // If we're working through a bulk drop, load the next statement to review.
      advanceQueue()
    } catch {
      setSaveResult('Import failed — could not save to the database. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  // File a statement that had nothing to import. It still belongs in the archive
  // — and on the coverage grid, so a quiet month reads as covered rather than
  // missing. An empty statement is filed as reconciled (there was genuinely
  // nothing to import, so the month is done); one Flow couldn't read is filed as
  // uploaded, so it still shows as needing attention.
  const handleSaveEmptyStatement = async () => {
    if (!emptyStatement || !account || !emptyPeriod) return
    const { year, month } = emptyPeriod
    const mm = String(month).padStart(2, '0')
    const lastDay = String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')
    const period = {
      statementDate: `${year}-${mm}-01`,
      periodStart: `${year}-${mm}-01`,
      periodEnd: `${year}-${mm}-${lastDay}`,
    }
    const reconciled = emptyStatement.kind === 'empty'
    const fileName = pdfDoc?.fileName || rawFileName || file?.name || 'statement'
    const formatSignature = pdfDoc ? pdfDoc.format : rawText ? headerSignature(rawText) : null

    setIsSaving(true)
    setSaveResult(null)
    setParseError(null)
    try {
      let ok = false
      if (originDocId) {
        // Already in the archive (extracted from there) — update it in place.
        const res = await fetch(`/api/documents/${originDocId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: account.id,
            source: reconciled ? 'import' : 'upload',
            importedCount: reconciled ? 0 : null,
            dataRows: recon?.dataRows ?? 0,
            formatSignature,
            ...period,
          }),
        })
        ok = res.ok
      } else {
        const base64 = pdfDoc ? pdfDoc.base64 : rawText ? btoa(unescape(encodeURIComponent(rawText))) : ''
        ok =
          !!base64 &&
          (await archiveDocument(
            {
              accountId: account.id,
              fileName,
              mimeType: pdfDoc ? 'application/pdf' : 'text/csv',
              source: reconciled ? 'import' : 'upload',
              formatSignature,
              importedCount: reconciled ? 0 : null,
              dataRows: recon?.dataRows ?? 0,
              ...period,
            },
            base64,
          ))
      }
      if (!ok) {
        setParseError('Could not file that statement — please try again.')
        return
      }
      setSaveResult(
        reconciled
          ? `Filed ${fileName} — no transactions to import. ${MONTHS_SHORT[month - 1]} ${year} is now covered for ${account.name}.`
          : `Filed ${fileName} under ${account.name} for ${MONTHS_SHORT[month - 1]} ${year}. It's marked uploaded — extract it below once you have a readable copy.`,
      )
      await loadDocuments()
      resetReview()
      advanceQueue()
    } catch {
      setParseError('Could not file that statement — please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    setFile(null)
    setParsedTransactions([])
    setParseError(null)
    setEmptyStatement(null)
    setEmptyPeriod(null)
    emptyPeriodTouchedRef.current = false
    setSaveResult(null)
    setRecon(null)
    setOpeningBalance('')
    setClosingBalance('')
    setRawText(null)
    setRawFileName('')
    setAutoDetected(false)
    setChangingAccount(false)
    setSelectedAccountId('')
  }

  const handleDeleteDoc = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    await loadDocuments()
  }

  // Archive a document to the statement store. Small files POST whole; larger
  // ones (whose base64 would blow the serverless request-body limit) send a
  // first chunk to create the row, then append the rest — so a big statement
  // still gets filed, not silently dropped.
  type ArchiveMeta = {
    accountId: string | null
    fileName: string
    mimeType: string
    source?: string
    formatSignature?: string | null
    importedCount?: number | null
    dataRows?: number | null
    statementDate?: string | null
    periodStart?: string | null
    periodEnd?: string | null
  }
  const ARCHIVE_CHUNK_CHARS = 3_000_000 // multiple of 4 → each slice decodes cleanly
  const archiveDocument = async (meta: ArchiveMeta, base64: string): Promise<boolean> => {
    if (base64.length <= 4_000_000) {
      const r = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...meta, contentBase64: base64 }),
      })
      return r.ok
    }
    const createRes = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...meta, contentBase64: base64.slice(0, ARCHIVE_CHUNK_CHARS) }),
    })
    if (!createRes.ok) return false
    let id: string
    try {
      id = (await createRes.json()).id
    } catch {
      return false
    }
    for (let i = ARCHIVE_CHUNK_CHARS; i < base64.length; i += ARCHIVE_CHUNK_CHARS) {
      const r = await fetch(`/api/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appendBase64: base64.slice(i, i + ARCHIVE_CHUNK_CHARS) }),
      })
      if (!r.ok) return false
    }
    return true
  }

  // Bulk archive: file many statements at once, auto-filing each by account
  // (detected) and year (from the filename). No per-file review — just saved.
  // Dropping several files now feeds the review queue — each statement is
  // parsed and reviewed/categorised in turn (see startReviewQueue).
  const handleBulkFiles = useCallback((files: File[]) => startReviewQueue(files), [startReviewQueue])

  // Reassign an archived statement's account or year.
  type DocPatch = { accountId?: string | null; statementDate?: string | null; periodStart?: string | null; periodEnd?: string | null }
  const patchDocRaw = (id: string, patch: DocPatch) =>
    fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
  // Optimistic edit: update the row in place and persist, WITHOUT re-fetching —
  // so the frozen layout keeps the row where it is instead of re-sorting it out
  // from under the user mid-edit. `local` mirrors the patch into StatementDoc
  // fields for the immediate UI update; on failure we resync from the server.
  const patchDocOptimistic = async (id: string, patch: DocPatch, local: Partial<StatementDoc>) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...local } : d)))
    try {
      const r = await patchDocRaw(id, patch)
      if (!r.ok) throw new Error()
    } catch {
      loadDocuments()
    }
  }

  const fmtBytes = (b: number) =>
    b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`
  const fmtDocDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  const docAccount = (d: StatementDoc): string => d.accountName ?? 'Unassigned'
  // Representative statement year, from the single statement date.
  const docYearN = (d: StatementDoc): number | null =>
    d.statementDate ? new Date(d.statementDate).getUTCFullYear() : null
  const isImported = (d: StatementDoc): boolean => d.source === 'import' || (d.importedCount ?? 0) > 0

  // ---- Coverage grid + compact list data ----------------------------------
  const gridAccountNames = Array.from(new Set(documents.map(docAccount))).sort((a, b) =>
    a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b),
  )
  // Years covered by any statement (via period, filename range, or single date).
  const docYears = (d: StatementDoc): number[] => {
    let s = d.periodStart
    let e = d.periodEnd
    if (!s || !e) {
      const fp = parseFilePeriod(d.fileName)
      if (fp) { s = fp.start; e = fp.end }
    }
    if (s && e) {
      const ys: number[] = []
      for (let y = new Date(s).getUTCFullYear(); y <= new Date(e).getUTCFullYear(); y++) ys.push(y)
      return ys
    }
    return docYearN(d) != null ? [docYearN(d)!] : []
  }
  const gridYearOptions = Array.from(
    new Set<number>([new Date().getFullYear(), ...documents.flatMap(docYears)]),
  ).sort((a, b) => b - a)
  // key `${account}|${month}` -> { imported, count }. A statement fills every
  // month of its period, so a Jan–Jun export lights up all six cells.
  const coverage = new Map<string, { imported: boolean; count: number }>()
  for (const d of documents) {
    for (const m of coveredMonthsInYear(d, gridYear)) {
      const key = `${docAccount(d)}|${m}`
      const cur = coverage.get(key) ?? { imported: false, count: 0 }
      cur.count += 1
      if (isImported(d)) cur.imported = true
      coverage.set(key, cur)
    }
  }
  // Map a grid row's account name to its id, so skips (keyed by id) line up.
  const accountIdByName = new Map(accounts.map((a) => [a.name, a.id]))
  const isSkipped = (name: string, m: number): boolean => {
    const id = accountIdByName.get(name)
    return !!id && skips.has(`${id}|${m}`)
  }
  // Frozen-layout accessors: which section a doc sits in, its account group and
  // its order — captured at the last structural change so field edits don't
  // reshuffle the list mid-edit. Fall back to live values for brand-new docs.
  const isUndated = (d: StatementDoc): boolean => (layout.has(d.id) ? layout.get(d.id)!.undated : !docHasPeriod(d))
  const layoutAccount = (d: StatementDoc): string => layout.get(d.id)?.account ?? docAccount(d)
  const layoutOrd = (d: StatementDoc): number => layout.get(d.id)?.ord ?? 1e9
  // Docs for the list: dated ones that touch this year, optionally narrowed to a
  // clicked cell. Order is the frozen ordinal, not the live month.
  const yearDocs = documents
    .filter((d) => !isUndated(d) && coveredMonthsInYear(d, gridYear).length > 0)
    .filter((d) => !cellFilter || (docAccount(d) === cellFilter.account && coveredMonthsInYear(d, gridYear).includes(cellFilter.month)))
    .sort((a, b) => layoutOrd(a) - layoutOrd(b))
  // Group the year's statements by (frozen) account so the list reads per-account.
  const yearDocsByAccount = Array.from(
    yearDocs.reduce((m, d) => {
      const a = layoutAccount(d)
      const list = m.get(a) ?? []
      list.push(d)
      m.set(a, list)
      return m
    }, new Map<string, StatementDoc[]>()),
  ).sort((a, b) => (a[0] === 'Unassigned' ? 1 : b[0] === 'Unassigned' ? -1 : a[0].localeCompare(b[0])))
  // Docs that can't be placed on the grid yet — surfaced so you can date them.
  const undatedDocs = documents.filter(isUndated)
  // Header counts are scoped to the year in view, so they match the grid/list
  // below (which are year-scoped) rather than lumping in other years.
  const yearAllDocs = documents.filter((d) => coveredMonthsInYear(d, gridYear).length > 0)
  const yearTotal = yearAllDocs.length
  const importedTotal = yearAllDocs.filter(isImported).length
  const notImportedTotal = yearTotal - importedTotal

  // Summary stats
  const totalTransactions = parsedTransactions.length
  const autoCategorised = parsedTransactions.filter((tx) => tx.status === 'categorised').length
  const needsReview = parsedTransactions.filter((tx) => tx.status === 'needs-review').length
  const totalAmount = parsedTransactions.reduce((sum, tx) => sum + tx.amountUSD, 0)
  const categorisedPercent = totalTransactions > 0 ? Math.round((autoCategorised / totalTransactions) * 100) : 0

  // Live preview of the statement being reviewed, shown beside the extracted
  // transactions so you can cross-check what Flow read against the source.
  const statementPreview = pdfDoc ? (
    <iframe
      title="Statement"
      src={`data:application/pdf;base64,${pdfDoc.base64}`}
      className="h-[78vh] w-full rounded-lg border border-gray-200 bg-white"
    />
  ) : rawText ? (
    (() => {
      const rows = parseCsvRows(rawText)
      if (rows.length === 0) {
        return (
          <pre className="h-[78vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">{rawText}</pre>
        )
      }
      const [header, ...body] = rows
      return (
        <div className="h-[78vh] overflow-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full border-separate border-spacing-0 text-xs">
            <thead>
              <tr>
                {header.map((h, i) => (
                  <th key={i} className="sticky top-0 z-10 whitespace-nowrap border-b border-gray-200 bg-gray-50 px-2 py-1.5 text-left font-semibold text-gray-600">
                    {h || <span className="text-gray-300">—</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((r, ri) => (
                <tr key={ri} className="odd:bg-white even:bg-gray-50/50">
                  {header.map((_, ci) => (
                    <td key={ci} className="whitespace-nowrap border-b border-gray-100 px-2 py-1 text-gray-700">
                      {r[ci] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    })()
  ) : null

  const splitReview = statementPreview !== null && parsedTransactions.length > 0

  // Set a saved statement's covered period (from/to month within a year). Also
  // stamps statement_date to the first month for back-compat.
  // Build the period patch for one doc, merging the given field(s) with its
  // current span so partial edits (just From, just Year…) keep the rest.
  const periodPatchFor = (d: StatementDoc, opts: { year?: number; from?: number; to?: number }): DocPatch => {
    const y = opts.year ?? docYears(d)[0] ?? gridYear
    const cur = coveredMonthsInYear(d, y)
    let from = opts.from ?? cur[0] ?? 1
    let to = opts.to ?? cur[cur.length - 1] ?? from
    // Honor whichever bound was just edited: moving the start past the end (or
    // the end before the start) pulls the other bound along, rather than
    // silently swapping them so the edit looks like it didn't take.
    if (opts.from != null && from > to) to = from
    if (opts.to != null && to < from) from = to
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const start = `${y}-${String(lo).padStart(2, '0')}-01`
    const lastDay = new Date(Date.UTC(y, hi, 0)).getUTCDate()
    const end = `${y}-${String(hi).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    return { periodStart: start, periodEnd: end, statementDate: start }
  }
  const periodLocal = (patch: DocPatch): Partial<StatementDoc> => ({
    periodStart: patch.periodStart ?? null,
    periodEnd: patch.periodEnd ?? null,
    statementDate: patch.statementDate ?? null,
  })
  const setPeriodRange = (d: StatementDoc, opts: { year?: number; from?: number; to?: number }) => {
    const patch = periodPatchFor(d, opts)
    patchDocOptimistic(d.id, patch, periodLocal(patch))
  }
  const setDocAccount = (d: StatementDoc, accountId: string | null) => {
    const accountName = accounts.find((a) => a.id === accountId)?.name ?? null
    patchDocOptimistic(d.id, { accountId }, { accountId, accountName })
  }
  const PERIOD_YEARS = ['2023', '2024', '2025', '2026', '2027']
  const MONTH_OPTS = MONTHS_SHORT.map((m, i) => ({ value: String(i + 1), label: m }))

  // ---- Multi-select + bulk edits -----------------------------------------
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const clearSelection = () => setSelectedIds(new Set())
  const allSelected = (ids: string[]) => ids.length > 0 && ids.every((id) => selectedIds.has(id))
  const toggleSelectMany = (ids: string[]) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      const all = ids.every((id) => next.has(id))
      ids.forEach((id) => (all ? next.delete(id) : next.add(id)))
      return next
    })
  const selectedDocs = () => documents.filter((d) => selectedIds.has(d.id))
  // Apply a patch across every selected doc optimistically (update in place,
  // persist, no re-fetch) so the frozen layout keeps rows put; resync only if a
  // save fails.
  const runBulkOptimistic = async (build: (d: StatementDoc) => { patch: DocPatch; local: Partial<StatementDoc> }) => {
    const docs = selectedDocs()
    if (docs.length === 0) return
    const builds = new Map(docs.map((d) => [d.id, build(d)]))
    setDocuments((prev) => prev.map((d) => (builds.has(d.id) ? { ...d, ...builds.get(d.id)!.local } : d)))
    setBulkBusy(true)
    try {
      const results = await Promise.all([...builds].map(([id, b]) => patchDocRaw(id, b.patch)))
      if (results.some((r) => !r.ok)) loadDocuments()
    } finally {
      setBulkBusy(false)
    }
  }
  const bulkSetAccount = (accountId: string | null) =>
    runBulkOptimistic(() => {
      const accountName = accounts.find((a) => a.id === accountId)?.name ?? null
      return { patch: { accountId }, local: { accountId, accountName } }
    })
  const bulkSetPeriod = (opts: { year?: number; from?: number; to?: number }) =>
    runBulkOptimistic((d) => {
      const patch = periodPatchFor(d, opts)
      return { patch, local: periodLocal(patch) }
    })
  const bulkDelete = async () => {
    const docs = selectedDocs()
    if (docs.length === 0) return
    if (!confirm(`Delete ${docs.length} document${docs.length !== 1 ? 's' : ''}? This can't be undone.`)) return
    setBulkBusy(true)
    try {
      await Promise.all(docs.map((d) => fetch(`/api/documents/${d.id}`, { method: 'DELETE' })))
      clearSelection()
      await loadDocuments()
    } finally {
      setBulkBusy(false)
    }
  }

  // One compact row in the statements list.
  const renderStatementRow = (d: StatementDoc) => {
    const imported = isImported(d)
    const isPdf = d.fileName.toLowerCase().endsWith('.pdf')
    const isCsv = d.fileName.toLowerCase().endsWith('.csv')
    const acctId = accounts.find((a) => a.name === d.accountName)?.id ?? ''
    return (
      <div key={d.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-100 px-4 py-2.5 last:border-0 ${selectedIds.has(d.id) ? 'bg-blue-50/60' : 'hover:bg-gray-50/50'}`}>
        <input
          type="checkbox"
          checked={selectedIds.has(d.id)}
          onChange={() => toggleSelect(d.id)}
          className="h-4 w-4 shrink-0 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          aria-label={`Select ${d.fileName}`}
        />
        <FileText className="h-4 w-4 shrink-0 text-gray-300" />
        <button
          onClick={() => setViewer({ url: `/api/documents/${d.id}`, downloadUrl: `/api/documents/${d.id}?download=1`, fileName: d.fileName })}
          className="min-w-0 flex-1 basis-48 truncate text-left text-sm font-medium text-gray-900 hover:text-blue-700 hover:underline"
          title={d.fileName}
        >
          {d.fileName}
        </button>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
            imported ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}
        >
          {imported ? (
            <>
              <CheckCircle className="h-3 w-3" /> Reconciled
              {d.importedCount === 0 ? ' · no transactions' : d.importedCount != null ? ` · ${d.importedCount}` : ''}
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3" /> Uploaded
            </>
          )}
        </span>
        <Select
          ariaLabel="Account"
          value={acctId}
          onChange={(v) => setDocAccount(d, v || null)}
          options={[{ value: '', label: 'Unassigned' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
          buttonClassName="inline-flex h-7 max-w-[150px] min-w-0 shrink-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600 hover:bg-gray-50"
        />
        {(() => {
          const yr = docYears(d)[0] ?? gridYear
          const cov = coveredMonthsInYear(d, yr)
          const fromM = cov[0]
          const toM = cov[cov.length - 1]
          const spans = !!(fromM && toM && fromM !== toM)
          const range = spans || rangeRows.has(d.id)
          const small = 'inline-flex h-7 w-16 min-w-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600 hover:bg-gray-50'
          const yearSel = (
            <Select ariaLabel="Year" value={docYears(d)[0] ? String(docYears(d)[0]) : ''} onChange={(v) => setPeriodRange(d, { year: Number(v) })} options={PERIOD_YEARS.map((y) => ({ value: y, label: y }))} placeholder="Year" buttonClassName="inline-flex h-7 w-20 min-w-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600 hover:bg-gray-50" />
          )
          const toggleRange = () =>
            setRangeRows((prev) => {
              const next = new Set(prev)
              if (range) {
                // Collapse to a single month (the current start).
                next.delete(d.id)
                if (spans && fromM) setPeriodRange(d, { from: fromM, to: fromM })
              } else {
                next.add(d.id)
              }
              return next
            })
          const rangeBtn = (
            <button
              type="button"
              onClick={toggleRange}
              title={range ? 'Single month' : 'Set a month range (statement spans several months)'}
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-xs ${range ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50'}`}
            >
              ⇄
            </button>
          )
          return (
            <div className="flex shrink-0 items-center gap-1" title="Statement period">
              {range ? (
                <>
                  <Select ariaLabel="Period from" value={fromM ? String(fromM) : ''} onChange={(v) => setPeriodRange(d, { from: Number(v) })} options={MONTH_OPTS} placeholder="From" buttonClassName={small} />
                  <span className="text-gray-300">–</span>
                  <Select ariaLabel="Period to" value={toM ? String(toM) : ''} onChange={(v) => setPeriodRange(d, { to: Number(v) })} options={MONTH_OPTS} placeholder="To" buttonClassName={small} />
                </>
              ) : (
                <Select ariaLabel="Month" value={fromM ? String(fromM) : ''} onChange={(v) => setPeriodRange(d, { from: Number(v), to: Number(v) })} options={MONTH_OPTS} placeholder="Month" buttonClassName={small} />
              )}
              {yearSel}
              {rangeBtn}
            </div>
          )
        })()}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {!imported && (isPdf || isCsv) && (
            <button
              onClick={() => processSavedDoc(d)}
              disabled={reprocessingId !== null}
              title="Extract transactions and categorise them for review"
              className="mr-1 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reprocessingId === d.id ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> Extracting…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" /> Extract
                </>
              )}
            </button>
          )}
          <button
            onClick={() => setViewer({ url: `/api/documents/${d.id}`, downloadUrl: `/api/documents/${d.id}?download=1`, fileName: d.fileName })}
            title="View"
            className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
          >
            <Eye className="h-4 w-4" />
          </button>
          <a href={`/api/documents/${d.id}?download=1`} title="Download" className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
            <Download className="h-4 w-4" />
          </a>
          <button onClick={() => handleDeleteDoc(d.id, d.fileName)} title="Delete" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Document Hub</h1>
          <p className="mt-1 text-sm text-gray-500">
            Drop a statement to import it and file it — CSVs and PDFs are parsed into transactions
            (Claude reads PDFs), everything is archived below
          </p>
        </div>

        {/* File upload */}
        <div className="mb-4">
          <FileUpload
            onFileSelect={handleFileSelect}
            onFilesSelect={handleBulkFiles}
            multiple
            accept=".csv,.pdf,.png,.jpg,.jpeg"
            label="Drop a statement — or drag in many at once"
            sublabel="Each statement opens for review & categorising, one after another"
          />
        </div>

        {/* Bulk review queue progress */}
        {queueInfo.total > 1 && (
          <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-indigo-800">
                Statement {queueInfo.total - queueInfo.remaining} of {queueInfo.total}
              </span>
              <span className="text-xs text-indigo-500">{queueInfo.remaining} left to review</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={skipCurrent}
                className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 shadow-sm hover:bg-indigo-50"
                title="File this one without importing and move on"
              >
                Skip this
              </button>
              <button
                onClick={skipAllRemaining}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm hover:bg-gray-50"
                title="File all remaining statements without importing"
              >
                Skip all — just file
              </button>
            </div>
          </div>
        )}

        {/* Account — shown only after parsing finishes: as a confirmed pill if
            auto-detected, or the picker if Flow couldn't work it out. Hidden
            while still reading the statement. */}
        {file && !isProcessing && (
          <div className="mb-8">
            {account && !changingAccount ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-gray-500">Account:</span>
                <span className="font-medium text-gray-900">
                  {account.name} ({account.currency})
                </span>
                {autoDetected && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                    <CheckCircle className="h-3 w-3" />
                    auto-detected
                  </span>
                )}
                <button
                  onClick={() => setChangingAccount(true)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  Change
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="account-select" className="mb-1.5 block text-sm font-medium text-gray-700">
                  {account ? 'Change account' : 'Which account is this statement for?'}
                </label>
                <Select
                  ariaLabel="Select an account"
                  value={selectedAccountId}
                  onChange={(v) => handleAccountChange(v)}
                  options={accounts.map((acc) => ({ value: acc.id, label: `${acc.name} (${acc.currency})` }))}
                  placeholder="Select an account…"
                  searchable
                  buttonClassName="inline-flex h-11 w-full max-w-md min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50"
                />
              </div>
            )}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="mb-8 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
            <div className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <div>
              <p className="text-sm font-medium text-blue-800">
                {file && file.name.toLowerCase().endsWith('.pdf')
                  ? 'Reading your statement with Claude…'
                  : 'Parsing and categorising transactions…'}
              </p>
              <p className="text-xs text-blue-600">
                {file?.name ? `${file.name} · ` : ''}extracting transactions and matching categories
              </p>
            </div>
          </div>
        )}

        {/* Save result */}
        {saveResult && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
            <p className="text-sm text-green-700">{saveResult}</p>
          </div>
        )}

        {/* Parse error */}
        {parseError && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{parseError}</p>
          </div>
        )}

        {/* Nothing to import — file the statement anyway so the month is covered */}
        {emptyStatement && (
          <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-amber-900">
                  {emptyStatement.kind === 'empty'
                    ? 'No transactions on this statement'
                    : "Couldn't read this statement"}
                </p>
                <p className="mt-0.5 text-sm text-amber-800">
                  {emptyStatement.reason}{' '}
                  {emptyStatement.kind === 'empty'
                    ? 'Save it anyway — the statement is filed and its month counts as reconciled on the grid below, so a quiet month is not mistaken for a missing one.'
                    : 'Save it anyway so it is filed against its month — it stays marked "uploaded" so you can extract it later.'}
                </p>
                {emptyStatement.detail && (
                  <p className="mt-2 break-words rounded-md bg-amber-100/70 px-2 py-1 font-mono text-[11px] leading-relaxed text-amber-900">
                    {emptyStatement.detail}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wider text-amber-700">
                    Statement month
                  </span>
                  <Select
                    ariaLabel="Statement month"
                    value={emptyPeriod ? String(emptyPeriod.month) : ''}
                    onChange={(v) => {
                      emptyPeriodTouchedRef.current = true
                      setEmptyPeriod((prev) => ({ year: prev?.year ?? gridYear, month: Number(v) }))
                    }}
                    options={MONTH_OPTS}
                    placeholder="Month"
                    buttonClassName="inline-flex h-8 w-20 min-w-0 items-center justify-between gap-1 rounded-md border border-amber-300 bg-white px-2 text-sm text-gray-700 hover:bg-amber-50"
                  />
                  <Select
                    ariaLabel="Statement year"
                    value={emptyPeriod ? String(emptyPeriod.year) : ''}
                    onChange={(v) => {
                      emptyPeriodTouchedRef.current = true
                      setEmptyPeriod((prev) => ({ year: Number(v), month: prev?.month ?? new Date().getMonth() + 1 }))
                    }}
                    options={Array.from(new Set([...PERIOD_YEARS, ...(emptyPeriod ? [String(emptyPeriod.year)] : [])]))
                      .sort()
                      .map((y) => ({ value: y, label: y }))}
                    placeholder="Year"
                    buttonClassName="inline-flex h-8 w-24 min-w-0 items-center justify-between gap-1 rounded-md border border-amber-300 bg-white px-2 text-sm text-gray-700 hover:bg-amber-50"
                  />
                  <button
                    onClick={handleSaveEmptyStatement}
                    disabled={isSaving || !account || !emptyPeriod}
                    title={
                      !account
                        ? 'Choose the account this statement belongs to first'
                        : !emptyPeriod
                          ? 'Choose the month this statement covers'
                          : undefined
                    }
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    {isSaving ? 'Saving…' : 'Save statement'}
                  </button>
                  <button
                    onClick={handleCancel}
                    className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm font-medium text-amber-800 shadow-sm transition-colors hover:bg-amber-100"
                  >
                    Discard
                  </button>
                </div>
                {(!account || !emptyPeriod) && (
                  <p className="mt-2 text-xs text-amber-700">
                    {!account
                      ? 'Pick the account above, then save.'
                      : "Flow couldn't work out which month this covers — pick it so the grid can show it."}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Split review: statement on the left, extracted transactions on the right */}
        <div className={splitReview ? 'grid gap-6 xl:grid-cols-2' : ''}>
          {splitReview && (
            <div className="xl:sticky xl:top-6 xl:self-start">
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <p className="truncate text-xs font-medium uppercase tracking-wider text-gray-400">
                    {pdfDoc?.fileName ?? rawFileName ?? 'Statement'}
                  </p>
                </div>
                {statementPreview}
              </div>
            </div>
          )}
          <div className={splitReview ? 'min-w-0' : ''}>
        {/* Summary bar */}
        {parsedTransactions.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Total Transactions</p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{totalTransactions}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Auto-categorised</p>
              <p className="mt-1 text-xl font-semibold text-green-600">
                {autoCategorised} <span className="text-sm font-normal text-gray-400">({categorisedPercent}%)</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Needs Review</p>
              <p className="mt-1 text-xl font-semibold text-amber-600">{needsReview}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Total Amount (USD)</p>
              <p className={`mt-1 text-xl font-semibold ${totalAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalAmount < 0 ? '-' : ''}${Math.abs(totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* Reconciliation evidence — proof nothing was dropped */}
        {recon && (
          (() => {
            const accounted = recon.parsed + recon.skipped.length
            const balanced = accounted === recon.dataRows
            const net = recon.sumCredits + recon.sumDebits
            return (
              <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Reconciliation — statement coverage check
                  </h3>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                      balanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {balanced ? (
                      <CheckCircle className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    {balanced ? 'All lines accounted for' : 'Line-count mismatch'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Data rows</p>
                    <p className="mt-0.5 font-semibold text-gray-900">{recon.dataRows}</p>
                    <p className="text-xs text-gray-400">of {recon.fileLines} file lines</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Parsed</p>
                    <p className="mt-0.5 font-semibold text-gray-900">{recon.parsed}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Skipped</p>
                    <p className={`mt-0.5 font-semibold ${recon.skipped.length ? 'text-amber-600' : 'text-gray-900'}`}>
                      {recon.skipped.length}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Parsed + Skipped</p>
                    <p className={`mt-0.5 font-semibold ${balanced ? 'text-green-700' : 'text-red-600'}`}>
                      {accounted} {balanced ? '=' : '≠'} {recon.dataRows}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-100 pt-4 text-sm">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Credits (in)</p>
                    <p className="mt-0.5 font-mono font-semibold text-green-600">
                      {formatLocal(recon.sumCredits, account?.currency ?? 'USD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Debits (out)</p>
                    <p className="mt-0.5 font-mono font-semibold text-red-600">
                      {formatLocal(recon.sumDebits, account?.currency ?? 'USD')}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-gray-400">Net movement</p>
                    <p className={`mt-0.5 font-mono font-semibold ${net < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatLocal(net, account?.currency ?? 'USD')}
                    </p>
                  </div>
                </div>

                {/* Balance assertion — opening + net movement should equal closing */}
                <div className="mt-4 border-t border-gray-100 pt-4">
                  <p className="mb-2 text-xs font-medium text-gray-500">
                    Balance check{' '}
                    <span className="font-normal text-gray-400">
                      (optional — enter the statement&apos;s opening &amp; closing balance to verify)
                    </span>
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Opening balance"
                      value={openingBalance}
                      onChange={(e) => setOpeningBalance(e.target.value)}
                      className="w-36 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
                    />
                    <span className="text-gray-400">+</span>
                    <span className="font-mono text-sm text-gray-600">
                      {formatLocal(net, account?.currency ?? 'USD')}
                    </span>
                    <span className="text-gray-400">=</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Closing balance"
                      value={closingBalance}
                      onChange={(e) => setClosingBalance(e.target.value)}
                      className="w-36 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none"
                    />
                    {openingBalance.trim() !== '' && closingBalance.trim() !== '' && (() => {
                      const open = parseFloat(openingBalance.replace(/[^0-9.\-]/g, ''))
                      const close = parseFloat(closingBalance.replace(/[^0-9.\-]/g, ''))
                      if (isNaN(open) || isNaN(close)) return null
                      const diff = open + net - close
                      const ok = Math.abs(diff) < 0.01
                      return (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                            ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                          }`}
                        >
                          {ok ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                          {ok
                            ? 'Balances reconcile ✓'
                            : `Off by ${formatLocal(diff, account?.currency ?? 'USD')}`}
                        </span>
                      )
                    })()}
                  </div>
                </div>

                {recon.imported !== null && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                    <CheckCircle className="h-4 w-4" />
                    Saved {recon.imported} of {recon.parsed} parsed rows
                    {recon.duplicates ? `, ${recon.duplicates} skipped as already-imported` : ''}
                    {recon.imported + (recon.duplicates ?? 0) === recon.parsed
                      ? ' — all accounted for ✓'
                      : ' — review the difference'}
                  </div>
                )}

                {recon.skipped.length > 0 && (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-xs font-medium text-amber-700">
                      View {recon.skipped.length} skipped line{recon.skipped.length !== 1 ? 's' : ''} (with reason)
                    </summary>
                    <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50">
                      <table className="w-full text-left text-xs">
                        <thead className="text-gray-400">
                          <tr>
                            <th className="px-3 py-1.5 font-medium">Line</th>
                            <th className="px-3 py-1.5 font-medium">Reason</th>
                            <th className="px-3 py-1.5 font-medium">Content</th>
                          </tr>
                        </thead>
                        <tbody className="text-gray-600">
                          {recon.skipped.map((s) => (
                            <tr key={s.line} className="border-t border-gray-100">
                              <td className="px-3 py-1.5 tabular-nums">{s.line}</td>
                              <td className="px-3 py-1.5">{s.reason}</td>
                              <td className="px-3 py-1.5 font-mono text-gray-400">{s.raw}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
              </div>
            )
          })()
        )}

        {/* Preview list — compact so it fits beside the statement with no side-scroll */}
        {parsedTransactions.length > 0 && (
          <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {parsedTransactions.length} transaction{parsedTransactions.length !== 1 ? 's' : ''}
              </span>
              {aiBusy ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-600">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
                  Claude is categorising…
                </span>
              ) : needsReview > 0 ? (
                <span className="text-xs font-medium text-amber-600">{needsReview} need review</span>
              ) : (
                <span className="text-xs font-medium text-green-600">All set</span>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {parsedTransactions.map((tx, index) => (
                <div
                  key={index}
                  className={`px-4 py-3 ${tx.status === 'needs-review' && !tx.alreadyImported ? 'bg-amber-50/40' : ''}`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900" title={tx.description}>
                      {tx.description}
                    </span>
                    <span className={`shrink-0 font-mono text-sm ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatLocal(tx.amount, tx.currency)}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="w-16 shrink-0 text-xs text-gray-400">{tx.date}</span>
                    <Select
                      ariaLabel="Category"
                      value={tx.category}
                      onChange={(v) => handleCategoryChange(index, v)}
                      options={[
                        // Money-out can only be an expense, money-in only income;
                        // transfers/investments move either way. Keeps you from
                        // filing income under an expense category (e.g. Car).
                        ...(tx.amount < 0
                          ? expenseCategories.map((cat) => ({ value: cat.name, label: cat.name, group: 'Expenses' }))
                          : incomeCategories.map((cat) => ({ value: cat.name, label: cat.name, group: 'Income' }))),
                        ...investmentCategories.map((cat) => ({ value: cat.name, label: cat.name, group: 'Investments' })),
                        ...transferCategories.map((cat) => ({ value: cat.name, label: cat.name, group: 'Transfers' })),
                      ]}
                      placeholder="Uncategorise… / Choose category"
                      searchable
                      panelWidth={260}
                      buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 hover:bg-gray-50"
                      actions={[{ label: '+ Add new category…', onSelect: () => handleCategoryChange(index, '__new__') }]}
                    />
                    {tx.alreadyImported ? (
                      <span title="Already in Flow — skipped on import" className="shrink-0 text-gray-400">
                        <CheckCircle className="h-4 w-4" />
                      </span>
                    ) : tx.aiSuggested ? (
                      <span
                        title="Suggested by Claude — check it's right"
                        className="shrink-0 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700"
                      >
                        AI
                      </span>
                    ) : tx.status === 'categorised' ? (
                      <span title="Categorised" className="shrink-0 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                      </span>
                    ) : (
                      <span title="Needs review" className="shrink-0 text-amber-500">
                        <AlertCircle className="h-4 w-4" />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        {parsedTransactions.length > 0 && (
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              disabled={isSaving}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {isSaving ? 'Importing…' : 'Confirm & Import'}
            </button>
          </div>
        )}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* Saved statements — coverage grid + compact list                    */}
        {/* ------------------------------------------------------------------ */}
        <div className="mt-12">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Saved statements</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {yearTotal} statement{yearTotal !== 1 ? 's' : ''} in {gridYear}
                {yearTotal > 0 && (
                  <> · <span className="text-emerald-600">{importedTotal} reconciled</span> · <span className="text-amber-600">{notImportedTotal} uploaded</span></>
                )}
                {documents.length !== yearTotal && <span className="text-gray-400"> · {documents.length} all-time</span>}
              </p>
            </div>
            {documents.length > 0 && (
              <div className="flex items-center gap-4">
                <div className="hidden items-center gap-3 text-xs text-gray-500 sm:flex">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Uploaded</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> Reconciled</span>
                  <span className="flex items-center gap-1.5"><span className="inline-flex h-3 w-3 items-center justify-center rounded-sm border border-gray-200 bg-gray-100 text-[8px] font-bold text-gray-400">–</span> No statement</span>
                </div>
                <Select
                  ariaLabel="Coverage year"
                  value={String(gridYear)}
                  onChange={(v) => { setGridYear(Number(v)); setCellFilter(null) }}
                  options={gridYearOptions.map((y) => ({ value: String(y), label: String(y) }))}
                />
              </div>
            )}
          </div>

          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <FileText className="mx-auto h-7 w-7 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                No statements saved yet — drop one (or many) above and they&apos;ll be filed here.
              </p>
            </div>
          ) : (
            <>
              {/* Bulk-edit bar — appears once one or more statements are ticked.
                  Each control applies to every selected row at once. */}
              {selectedIds.size > 0 && (
                <div className="sticky top-2 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 shadow-sm">
                  <span className="text-sm font-semibold text-blue-800">{selectedIds.size} selected</span>
                  <span className="ml-1 text-xs font-medium text-blue-600">Set for all:</span>
                  <Select
                    ariaLabel="Set account for selected"
                    value=""
                    placeholder="Account"
                    onChange={(v) => bulkSetAccount(v || null)}
                    options={[{ value: '', label: 'Unassigned' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
                    buttonClassName="inline-flex h-7 max-w-[160px] min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50"
                  />
                  <div className="flex items-center gap-1">
                    <Select ariaLabel="Set month for selected" value="" placeholder="Month" onChange={(v) => bulkSetPeriod({ from: Number(v), to: Number(v) })} options={MONTH_OPTS} buttonClassName="inline-flex h-7 w-16 min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50" />
                    <span className="text-[10px] text-blue-400">or</span>
                    <Select ariaLabel="Set from month for selected" value="" placeholder="From" onChange={(v) => bulkSetPeriod({ from: Number(v) })} options={MONTH_OPTS} buttonClassName="inline-flex h-7 w-16 min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50" />
                    <span className="text-gray-300">–</span>
                    <Select ariaLabel="Set to month for selected" value="" placeholder="To" onChange={(v) => bulkSetPeriod({ to: Number(v) })} options={MONTH_OPTS} buttonClassName="inline-flex h-7 w-16 min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50" />
                    <Select ariaLabel="Set year for selected" value="" placeholder="Year" onChange={(v) => bulkSetPeriod({ year: Number(v) })} options={PERIOD_YEARS.map((y) => ({ value: y, label: y }))} buttonClassName="inline-flex h-7 w-20 min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-700 hover:bg-gray-50" />
                  </div>
                  <button
                    onClick={bulkDelete}
                    disabled={bulkBusy}
                    className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                  {bulkBusy && <span className="text-xs text-blue-500">Saving…</span>}
                  <button onClick={clearSelection} className="ml-auto text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline">
                    Clear
                  </button>
                </div>
              )}

              {gridAccountNames.length > 0 && (
                <div className="mb-6 overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
                  <table className="w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-white px-4 py-2 text-left text-xs font-medium text-gray-500">Account</th>
                        {MONTHS_SHORT.map((m) => (
                          <th key={m} className="px-1 py-2 text-center text-xs font-medium text-gray-400">{m}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {gridAccountNames.map((name) => (
                        <tr key={name} className="hover:bg-gray-50/40">
                          <td className="sticky left-0 z-10 bg-white px-4 py-1.5 whitespace-nowrap text-gray-700">{name}</td>
                          {MONTHS_SHORT.map((_, i) => {
                            const m = i + 1
                            const cov = coverage.get(`${name}|${m}`)
                            const acctId = accountIdByName.get(name)
                            const skipped = !cov && isSkipped(name, m)
                            const active = !!cellFilter && cellFilter.account === name && cellFilter.month === m
                            const cls = cov
                              ? cov.imported ? 'bg-emerald-500' : 'bg-amber-400'
                              : skipped ? 'border border-gray-200 bg-gray-100 text-gray-400'
                                : 'border border-gray-200 bg-gray-50 text-gray-300'
                            return (
                              <td key={i} className="px-1 py-1.5 text-center">
                                <button
                                  // Empty cells (no statement) are clickable only when the
                                  // row maps to a real account — toggling "no statement
                                  // expected". Filled cells filter the list below.
                                  disabled={!cov && !acctId}
                                  onClick={() =>
                                    cov
                                      ? setCellFilter(active ? null : { account: name, month: m })
                                      : acctId && toggleSkip(acctId, m)
                                  }
                                  title={
                                    cov
                                      ? `${cov.count} statement${cov.count !== 1 ? 's' : ''} — ${cov.imported ? 'reconciled' : 'uploaded'}`
                                      : skipped
                                        ? `No statement for ${MONTHS_SHORT[i]} ${gridYear} (click to unmark)`
                                        : acctId
                                          ? `No ${MONTHS_SHORT[i]} ${gridYear} statement — click to mark "no statement"`
                                          : `No ${MONTHS_SHORT[i]} ${gridYear} statement`
                                  }
                                  className={`mx-auto flex h-6 w-full max-w-[40px] items-center justify-center rounded-sm text-[10px] font-bold ${cls} ${cov || acctId ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} ${active ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                                >
                                  {skipped ? '–' : ''}
                                </button>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {cellFilter && (
                <div className="mb-3 flex items-center gap-2 text-sm">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                    {cellFilter.account} · {MONTHS_SHORT[cellFilter.month - 1]} {gridYear}
                  </span>
                  <button onClick={() => setCellFilter(null)} className="text-xs font-medium text-gray-500 hover:text-gray-700 hover:underline">Clear</button>
                </div>
              )}

              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  {yearDocs.length > 0 && (
                    <input
                      type="checkbox"
                      checked={allSelected(yearDocs.map((d) => d.id))}
                      onChange={() => toggleSelectMany(yearDocs.map((d) => d.id))}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      aria-label="Select all statements this year"
                    />
                  )}
                  {gridYear} · {yearDocs.length} statement{yearDocs.length !== 1 ? 's' : ''}
                </div>
                {yearDocs.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-400">
                    {cellFilter ? 'No statement here yet.' : `No ${gridYear} statements yet.`}
                  </p>
                ) : (
                  yearDocsByAccount.map(([acct, docs]) => (
                    <div key={acct}>
                      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50/40 px-4 py-1.5">
                        <span className="text-xs font-semibold text-gray-700">{acct}</span>
                        <span className="rounded-full bg-gray-200/70 px-1.5 text-[10px] font-medium text-gray-500">{docs.length}</span>
                      </div>
                      {docs.map((d) => renderStatementRow(d))}
                    </div>
                  ))
                )}
              </div>

              {undatedDocs.length > 0 && (
                <div className="mt-6 overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
                  <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-amber-700">
                    <input
                      type="checkbox"
                      checked={allSelected(undatedDocs.map((d) => d.id))}
                      onChange={() => toggleSelectMany(undatedDocs.map((d) => d.id))}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-amber-300 text-blue-600 focus:ring-blue-500"
                      aria-label="Select all undated statements"
                    />
                    Needs a date · {undatedDocs.length} — set a month so they appear on the grid
                  </div>
                  {undatedDocs.map((d) => renderStatementRow(d))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <DocViewer target={viewer} onClose={() => setViewer(null)} />
    </div>
  )
}
