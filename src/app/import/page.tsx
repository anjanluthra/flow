'use client'

import React, { useState, useCallback, useEffect } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, Eye, Download, Trash2 } from 'lucide-react'
import { FileUpload } from '@/components/ui/FileUpload'
import { convertToUSD } from '@/lib/currency'
import { suggestCategoryName } from '@/lib/categories'

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

  // 2. Heuristic scoring.
  const hay = `${fileName} ${sampleText}`.toLowerCase()
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && !['the', 'and', 'account', 'card'].includes(t))

  let best: { account: AccountOption; score: number } | null = null
  for (const a of accounts) {
    let score = 0
    const inst = (a.institution ?? '').toLowerCase().trim()
    if (inst && inst.length >= 2 && hay.includes(inst)) score += 3
    for (const tok of tokenize(a.name)) {
      if (hay.includes(tok)) score += 1
    }
    if (!best || score > best.score) best = { account: a, score }
  }

  // Require a real signal, and an unambiguous winner.
  if (!best || best.score < 3) return null
  const runnerUp = accounts
    .filter((a) => a.id !== best!.account.id)
    .reduce((max, a) => {
      let s = 0
      const inst = (a.institution ?? '').toLowerCase().trim()
      if (inst && inst.length >= 2 && hay.includes(inst)) s += 3
      for (const tok of a.name.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3)) {
        if (hay.includes(tok)) s += 1
      }
      return Math.max(max, s)
    }, 0)
  if (best.score - runnerUp < 1) return null // tie — let the user disambiguate
  return best
}

interface CategoryOption {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
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
        const catData = await catRes.json()
        const mapData = await mapRes.json()
        const fxData = await fxRes.json()
        const hintData = await hintRes.json()
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
        const description = row[mapping.descCol] ?? ''

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
        const category = learned?.categoryName ?? suggestCategoryName(description) ?? ''
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
        const category = learned?.categoryName ?? suggestCategoryName(r.description) ?? ''
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

  const handleCategoryChange = useCallback(
    (index: number, newCategory: string) => {
      let description = ''
      setParsedTransactions((prev) => {
        description = prev[index]?.description ?? ''
        return prev.map((tx, i) =>
          i === index
            ? { ...tx, category: newCategory, status: newCategory ? 'categorised' : 'needs-review' }
            : tx,
        )
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
    [categories],
  )

  const handleConfirmImport = async () => {
    if (!account || parsedTransactions.length === 0) return

    setIsSaving(true)
    setSaveResult(null)
    try {
      const catByName = new Map(categories.map((c) => [c.name, c]))
      const payload = parsedTransactions.map((tx) => {
        const cat = tx.category ? catByName.get(tx.category) : undefined
        // Category type wins over sign: a transfer category → 'transfer' (kept
        // out of P&L); an income category → 'income'; otherwise fall back to the
        // debit/credit sign.
        const type: 'income' | 'expense' | 'transfer' =
          cat?.type === 'transfer'
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
      if (pdfDoc) {
        fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: account.id,
            fileName: pdfDoc.fileName,
            mimeType: 'application/pdf',
            contentBase64: pdfDoc.base64,
            source: 'import',
            formatSignature: pdfDoc.format,
            importedCount: data.inserted,
            dataRows: recon?.dataRows ?? null,
          }),
        })
          .then(() => loadDocuments())
          .catch(() => {})
      } else if (rawText) {
        fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accountId: account.id,
            fileName: rawFileName || 'statement.csv',
            mimeType: 'text/csv',
            contentBase64: btoa(unescape(encodeURIComponent(rawText))),
            source: 'import',
            formatSignature: headerSignature(rawText),
            importedCount: data.inserted,
            dataRows: recon?.dataRows ?? null,
          }),
        })
          .then(() => loadDocuments())
          .catch(() => {})
      }

      setParsedTransactions([])
      setFile(null)
      setPendingPdfRows(null)
      setPdfDoc(null)
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

  const fmtBytes = (b: number) =>
    b >= 1024 * 1024 ? `${(b / (1024 * 1024)).toFixed(1)} MB` : b >= 1024 ? `${(b / 1024).toFixed(0)} KB` : `${b} B`
  const fmtDocDate = (d: string) =>
    new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  // Group archived statements per account for browsing.
  const docsByAccount = Array.from(
    documents.reduce((m, d) => {
      const key = d.accountName ?? 'Unassigned'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(d)
      return m
    }, new Map<string, StatementDoc[]>()),
  )

  // Summary stats
  const totalTransactions = parsedTransactions.length
  const autoCategorised = parsedTransactions.filter((tx) => tx.status === 'categorised').length
  const needsReview = parsedTransactions.filter((tx) => tx.status === 'needs-review').length
  const totalAmount = parsedTransactions.reduce((sum, tx) => sum + tx.amountUSD, 0)
  const categorisedPercent = totalTransactions > 0 ? Math.round((autoCategorised / totalTransactions) * 100) : 0

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
            accept=".csv,.pdf"
            label="Drop your bank statement here"
            sublabel="CSV or PDF files accepted — the account is detected automatically"
          />
        </div>

        {/* Account — only shown once a statement is dropped. Detected
            automatically; the picker is tucked away unless it's needed. */}
        {file && (
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
                <select
                  id="account-select"
                  value={selectedAccountId}
                  onChange={(e) => handleAccountChange(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="" disabled>
                    Select an account…
                  </option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({acc.currency})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Processing indicator */}
        {isProcessing && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-blue-700">Parsing and categorising transactions...</p>
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

        {/* PDF notice */}
        {file && file.name.toLowerCase().endsWith('.pdf') && isProcessing && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <FileText className="h-4 w-4 shrink-0 text-blue-500" />
            <p className="text-sm text-blue-700">
              Reading the PDF with Claude and extracting transactions…
            </p>
          </div>
        )}

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

        {/* Preview table */}
        {parsedTransactions.length > 0 && (
          <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Date</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Description</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Amount (Local)</th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Amount (USD)</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Category</th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedTransactions.map((tx, index) => (
                    <tr key={index} className={`transition-colors hover:bg-gray-50 ${tx.status === 'needs-review' ? 'bg-amber-50/30' : ''}`}>
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{tx.date}</td>
                      <td className="max-w-xs truncate px-4 py-3 font-medium text-gray-900" title={tx.description}>
                        {tx.description}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm ${tx.amount < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatLocal(tx.amount, tx.currency)}
                      </td>
                      <td className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm ${tx.amountUSD < 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {tx.amountUSD < 0 ? '-' : ''}${Math.abs(tx.amountUSD).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={tx.category}
                          onChange={(e) => handleCategoryChange(index, e.target.value)}
                          className={`w-full min-w-[160px] rounded-md border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            tx.category ? 'border-gray-200 bg-white text-gray-700' : 'border-amber-300 bg-amber-50 text-amber-700'
                          }`}
                        >
                          <option value="">-- Select category --</option>
                          <optgroup label="Expenses">
                            {expenseCategories.map((cat) => (
                              <option key={cat.id} value={cat.name}>
                                {cat.name}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Income">
                            {incomeCategories.map((cat) => (
                              <option key={cat.id} value={cat.name}>
                                {cat.name}
                              </option>
                            ))}
                          </optgroup>
                          {transferCategories.length > 0 && (
                            <optgroup label="Transfers & Investments">
                              {transferCategories.map((cat) => (
                                <option key={cat.id} value={cat.name}>
                                  {cat.name}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {tx.status === 'categorised' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                            <CheckCircle className="h-3 w-3" />
                            Categorised
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
                            <AlertCircle className="h-3 w-3" />
                            Needs Review
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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

        {/* ------------------------------------------------------------------ */}
        {/* Saved statements — the archive + per-bank format history           */}
        {/* ------------------------------------------------------------------ */}
        <div className="mt-12">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Saved statements</h2>
          <p className="mb-4 text-sm text-gray-500">
            Every imported or uploaded statement is kept here, grouped by account, with the format it
            came in.
          </p>

          {docsByAccount.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
              <FileText className="mx-auto h-7 w-7 text-gray-300" />
              <p className="mt-2 text-sm text-gray-500">
                No statements saved yet — import one above and it&apos;ll be filed here.
              </p>
            </div>
          ) : (
            docsByAccount.map(([accountName, docs]) => (
              <div
                key={accountName}
                className="mb-5 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/60 px-5 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">{accountName}</h3>
                  <span className="text-xs text-gray-400">
                    {docs.length} statement{docs.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {docs.map((d) => (
                      <tr key={d.id} className="hover:bg-gray-50/50">
                        <td className="w-8 py-3 pl-5">
                          <FileText className="h-4 w-4 text-gray-300" />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-gray-900">{d.fileName}</p>
                          <p className="text-xs text-gray-400">
                            {d.source === 'import' ? 'Imported' : 'Uploaded'} ·{' '}
                            {fmtDocDate(d.uploadedAt)} · {fmtBytes(d.sizeBytes)}
                            {d.importedCount != null ? ` · ${d.importedCount} transactions` : ''}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          {d.formatSignature ? (
                            <span
                              className="inline-block max-w-[220px] truncate rounded bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-500"
                              title={d.formatSignature}
                            >
                              {d.formatSignature.split('|').length} cols: {d.formatSignature.replace(/\|/g, ', ')}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-300">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 pr-4">
                            <a
                              href={`/api/documents/${d.id}`}
                              target="_blank"
                              rel="noreferrer"
                              title="View"
                              className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            >
                              <Eye className="h-4 w-4" />
                            </a>
                            <a
                              href={`/api/documents/${d.id}?download=1`}
                              title="Download"
                              className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                            >
                              <Download className="h-4 w-4" />
                            </a>
                            <button
                              onClick={() => handleDeleteDoc(d.id, d.fileName)}
                              title="Delete"
                              className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
