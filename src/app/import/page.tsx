'use client'

import React, { useState, useCallback, useEffect, useRef } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, Eye, Download, Trash2 } from 'lucide-react'
import { DocViewer, type DocViewerTarget } from '@/components/DocViewer'
import { FileUpload } from '@/components/ui/FileUpload'
import { Select } from '@/components/ui/Select'
import { convertToUSD } from '@/lib/currency'
import { deriveMerchantPattern } from '@/lib/categories'

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
  sizeBytes: number
  uploadedAt: string
  source: string | null // 'upload' | 'import'
  formatSignature: string | null
  importedCount: number | null
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
  const [pdfDoc, setPdfDoc] = useState<{ base64: string; fileName: string; format: string } | null>(null)
  const [viewer, setViewer] = useState<DocViewerTarget | null>(null)
  const [archiveFilter, setArchiveFilter] = useState<{ account: string; year: string } | null>(null)

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch('/api/documents')
      const data = await res.json()
      setDocuments(data.documents || [])
    } catch {
      /* ignore */
    }
  }, [])

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

  // Parse a statement's text against a chosen account. When `forced` is passed
  // (a manual override) detection is skipped; otherwise the account is detected
  // from the filename + header.
  const processStatement = useCallback(
    (text: string, fileName: string, forced?: AccountOption) => {
      setParseError(null)

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
      if (rows.length < 2) {
        setParseError('The CSV file appears to be empty or has insufficient data.')
        return
      }
      const mapping = detectColumns(rows[0])
      if (!mapping) {
        setParseError(
          'Could not auto-detect columns. Ensure your CSV has date, description, and amount/debit/credit headers.',
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

        const lowerDesc = description.toLowerCase()
        const learned = mappings.find((m) => lowerDesc.includes(m.pattern.toLowerCase()))
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
    },
    [accounts, mappings, fxRates, hints],
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
        const lowerDesc = r.description.toLowerCase()
        const learned = mappings.find((m) => lowerDesc.includes(m.pattern.toLowerCase()))
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
    },
    [mappings, fxRates],
  )

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile)
      setParseError(null)
      setSaveResult(null)
      setAutoDetected(false)
      setPendingPdfRows(null)
      setPdfDoc(null)

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
          const res = await fetch('/api/parse-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contentBase64: base64 }),
          })
          const data = await res.json()
          if (!res.ok) {
            setParseError(data.error || 'Could not read that PDF.')
            return
          }
          const rows: { date: string; description: string; amount: number }[] = data.transactions || []
          if (rows.length === 0) {
            setParseError('No transactions found in that PDF.')
            return
          }
          const format = `PDF · ${data.bankHint || 'statement'}`
          setPendingPdfRows(rows)
          setPdfDoc({ base64, fileName: selectedFile.name, format })

          const detected = detectAccount(selectedFile.name, String(data.bankHint || ''), accounts, hints)
          setAutoDetected(!!detected)
          if (detected?.account) {
            setSelectedAccountId(detected.account.id)
            setChangingAccount(false)
            buildPdfTransactions(rows, detected.account)
          } else {
            setSelectedAccountId('')
            setChangingAccount(true)
            setParseError("Read the statement — now choose which account it's for below.")
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
    [processStatement, loadDocuments, accounts, hints, buildPdfTransactions],
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
        buildPdfTransactions(pendingPdfRows, acc)
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
    setRawText(null)
    setPdfDoc(null)
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
        // Category type wins over sign: an investment category → 'investment'
        // (its own cash-flow section); a transfer category → 'transfer' (kept
        // out of P&L); an income category → 'income'; otherwise fall back to the
        // debit/credit sign.
        const type: 'income' | 'expense' | 'transfer' | 'investment' =
          cat?.type === 'investment'
            ? 'investment'
            : cat?.type === 'transfer'
              ? 'transfer'
              : cat?.type === 'income'
                ? 'income'
                : tx.amount < 0
                  ? 'expense'
                  : 'income'
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

      // Archive the raw statement to the library, tagged with its format.
      const archiveBody = pdfDoc
        ? {
            accountId: account.id,
            fileName: pdfDoc.fileName,
            mimeType: 'application/pdf',
            contentBase64: pdfDoc.base64,
            source: 'import',
            formatSignature: pdfDoc.format,
            importedCount: data.inserted,
            dataRows: recon?.dataRows ?? null,
          }
        : rawText
          ? {
              accountId: account.id,
              fileName: rawFileName || 'statement.csv',
              mimeType: 'text/csv',
              contentBase64: btoa(unescape(encodeURIComponent(rawText))),
              source: 'import',
              formatSignature: headerSignature(rawText),
              importedCount: data.inserted,
              dataRows: recon?.dataRows ?? null,
            }
          : null

      if (archiveBody) {
        try {
          const archRes = await fetch('/api/documents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(archiveBody),
          })
          if (!archRes.ok) {
            setSaveResult((prev) => `${prev ?? ''} (but filing the statement to the archive failed)`)
          }
          await loadDocuments()
        } catch {
          setSaveResult((prev) => `${prev ?? ''} (but filing the statement to the archive failed)`)
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

  const handleCancel = () => {
    setFile(null)
    setParsedTransactions([])
    setParseError(null)
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

  // Bulk archive: file many statements at once, auto-filing each by account
  // (detected) and year (from the filename). No per-file review — just saved.
  // Dropping several files now feeds the review queue — each statement is
  // parsed and reviewed/categorised in turn (see startReviewQueue).
  const handleBulkFiles = useCallback((files: File[]) => startReviewQueue(files), [startReviewQueue])

  // Reassign an archived statement's account or year.
  const patchDoc = async (id: string, patch: { accountId?: string | null; statementDate?: string | null }) => {
    await fetch(`/api/documents/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    await loadDocuments()
  }

  const fmtBytes = (b: number) =>
    b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`
  const fmtDocDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  // Year for an archived doc: statement date if set, else guessed from filename.
  const docYear = (d: StatementDoc): string => {
    if (d.statementDate) return String(new Date(d.statementDate).getUTCFullYear())
    const y = yearFromFileName(d.fileName)
    return y ? String(y) : 'Unknown'
  }
  const docAccount = (d: StatementDoc): string => d.accountName ?? 'Unassigned'

  // Distinct years and accounts for the archive filters.
  const archiveYears = Array.from(new Set(documents.map(docYear))).sort((a, b) => b.localeCompare(a))
  const archiveAccounts = Array.from(new Set(documents.map(docAccount))).sort()
  const filteredDocs = documents
    .filter((d) => {
      if (!archiveFilter) return true
      const okA = archiveFilter.account === 'all' || docAccount(d) === archiveFilter.account
      const okY = archiveFilter.year === 'all' || docYear(d) === archiveFilter.year
      return okA && okY
    })
    .sort((a, b) => (b.uploadedAt ?? '').localeCompare(a.uploadedAt ?? ''))

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
    <pre className="h-[78vh] overflow-auto rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs leading-relaxed text-gray-700">
      {rawText}
    </pre>
  ) : null

  const splitReview = statementPreview !== null && parsedTransactions.length > 0

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
                        ...expenseCategories.map((cat) => ({ value: cat.name, label: cat.name, group: 'Expenses' })),
                        ...incomeCategories.map((cat) => ({ value: cat.name, label: cat.name, group: 'Income' })),
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
        {/* Saved statements — the archive + per-bank format history           */}
        {/* ------------------------------------------------------------------ */}
        <div className="mt-12">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Saved statements</h2>
          <p className="mb-4 text-sm text-gray-500">
            Every statement, filed by account and year. Click a number to see those statements.
          </p>

          {documents.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <FileText className="mx-auto h-7 w-7 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                No statements saved yet — drop one (or many) above and they&apos;ll be filed here.
              </p>
            </div>
          ) : (
            <>
              {/* Filter pills — year and account */}
              {(() => {
                const af = archiveFilter ?? { account: 'all', year: 'all' }
                const setYear = (year: string) => {
                  const next = { account: af.account, year }
                  setArchiveFilter(next.account === 'all' && next.year === 'all' ? null : next)
                }
                const setAcct = (account: string) => {
                  const next = { account, year: af.year }
                  setArchiveFilter(next.account === 'all' && next.year === 'all' ? null : next)
                }
                const Pill = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
                  <button
                    onClick={onClick}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      on ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {children}
                  </button>
                )
                return (
                  <div className="mb-5 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs font-medium uppercase tracking-wider text-gray-400">Year</span>
                      <Pill on={af.year === 'all'} onClick={() => setYear('all')}>All</Pill>
                      {archiveYears.map((y) => (
                        <Pill key={y} on={af.year === y} onClick={() => setYear(y)}>{y}</Pill>
                      ))}
                    </div>
                    {archiveAccounts.length > 1 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="mr-1 text-xs font-medium uppercase tracking-wider text-gray-400">Account</span>
                        <Pill on={af.account === 'all'} onClick={() => setAcct('all')}>All</Pill>
                        {archiveAccounts.map((a) => (
                          <Pill key={a} on={af.account === a} onClick={() => setAcct(a)}>{a}</Pill>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Statement cards, grouped by account */}
              {filteredDocs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-400">
                  No statements match this filter.
                </div>
              ) : (
                <div className="space-y-6">
                  {Array.from(
                    filteredDocs.reduce((m, d) => {
                      const a = docAccount(d)
                      const list = m.get(a) ?? []
                      list.push(d)
                      m.set(a, list)
                      return m
                    }, new Map<string, StatementDoc[]>()),
                  ).map(([acct, docs]) => (
                    <div key={acct}>
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{acct}</h3>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                          {docs.length}
                        </span>
                      </div>
                      <div className="grid gap-2.5 sm:grid-cols-2">
                        {docs.map((d) => (
                          <div
                            key={d.id}
                            className="group flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
                              <FileText className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-gray-900" title={d.fileName}>
                                {d.fileName}
                              </p>
                              <p className="truncate text-xs text-gray-400">
                                {d.source === 'import' ? 'Imported' : 'Uploaded'} · {fmtDocDate(d.uploadedAt)} · {fmtBytes(d.sizeBytes)}
                                {d.importedCount != null ? ` · ${d.importedCount} txns` : ''}
                              </p>
                              <div className="mt-1.5 flex items-center gap-1.5">
                                <Select
                                  ariaLabel="Assign account"
                                  value={accounts.find((a) => a.name === d.accountName)?.id ?? ''}
                                  onChange={(v) => patchDoc(d.id, { accountId: v || null })}
                                  options={[
                                    { value: '', label: 'Unassigned' },
                                    ...accounts.map((a) => ({ value: a.id, label: a.name })),
                                  ]}
                                  buttonClassName="inline-flex h-6 max-w-[130px] min-w-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                />
                                <Select
                                  ariaLabel="Statement year"
                                  value={docYear(d)}
                                  onChange={(v) => patchDoc(d.id, { statementDate: `${v}-01-01` })}
                                  options={['2023', '2024', '2025', '2026', '2027'].map((y) => ({ value: y, label: y }))}
                                  placeholder="Unknown"
                                  buttonClassName="inline-flex h-6 min-w-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-1.5 text-xs text-gray-600 hover:bg-gray-50"
                                />
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-0.5">
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
                        ))}
                      </div>
                    </div>
                  ))}
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
