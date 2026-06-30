'use client'

import React, { useState, useCallback } from 'react'
import { Upload, CheckCircle, AlertCircle, FileText, ArrowRight, X } from 'lucide-react'
import { FileUpload } from '@/components/ui/FileUpload'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountOption {
  name: string
  currency: string
  usdRate: number // how many USD per 1 unit of this currency
}

interface ParsedTransaction {
  date: string
  description: string
  amount: number // negative = debit, positive = credit
  currency: string
  amountUSD: number
  category: string
  status: 'categorised' | 'needs-review'
}

interface ColumnMapping {
  dateCol: number
  descCol: number
  amountCol: number
  debitCol?: number
  creditCol?: number
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNTS: AccountOption[] = [
  { name: 'FAB Current Account', currency: 'AED', usdRate: 0.272294 },
  { name: 'FAB iSavings', currency: 'AED', usdRate: 0.272294 },
  { name: 'Wio Personal (Anjan)', currency: 'AED', usdRate: 0.272294 },
  { name: 'Wio Personal (Kate)', currency: 'AED', usdRate: 0.272294 },
  { name: 'Barclaycard Credit Card', currency: 'GBP', usdRate: 1.3231 },
  { name: 'Monzo Joint', currency: 'GBP', usdRate: 1.3231 },
  { name: 'Revolut', currency: 'GBP', usdRate: 1.3231 },
  { name: 'Santander/NS&I', currency: 'GBP', usdRate: 1.3231 },
  { name: 'HSBC Jersey', currency: 'GBP', usdRate: 1.3231 },
  { name: 'IBKR', currency: 'USD', usdRate: 1.0 },
]

const KEYWORD_MAP: Record<string, string> = {
  // Groceries
  carrefour: 'Groceries',
  spinneys: 'Groceries',
  lulu: 'Groceries',
  waitrose: 'Groceries',
  tesco: 'Groceries',
  supermarket: 'Groceries',
  grocery: 'Groceries',
  choithrams: 'Groceries',
  geant: 'Groceries',
  // Dining
  starbucks: 'Dining & Coffee',
  restaurant: 'Dining & Coffee',
  cafe: 'Dining & Coffee',
  coffee: 'Dining & Coffee',
  mcdonald: 'Dining & Coffee',
  deliveroo: 'Dining & Coffee',
  talabat: 'Dining & Coffee',
  zomato: 'Dining & Coffee',
  costa: 'Dining & Coffee',
  // Transport
  uber: 'Taxis & Rideshare',
  careem: 'Taxis & Rideshare',
  bolt: 'Taxis & Rideshare',
  taxi: 'Taxis & Rideshare',
  // Car
  adnoc: 'Car',
  enoc: 'Car',
  salik: 'Car',
  parking: 'Car',
  rta: 'Car',
  petrol: 'Car',
  fuel: 'Car',
  // Shopping
  amazon: 'Shopping',
  noon: 'Shopping',
  ikea: 'Shopping',
  mall: 'Shopping',
  zara: 'Shopping',
  // Bills & Utilities
  du: 'Bills & Utilities',
  etisalat: 'Bills & Utilities',
  dewa: 'Bills & Utilities',
  electricity: 'Bills & Utilities',
  water: 'Bills & Utilities',
  internet: 'Bills & Utilities',
  // Subscriptions
  netflix: 'Subscriptions',
  spotify: 'Subscriptions',
  apple: 'Subscriptions',
  google: 'Subscriptions',
  youtube: 'Subscriptions',
  // Health
  pharmacy: 'Health & Fitness',
  gym: 'Health & Fitness',
  clinic: 'Health & Fitness',
  hospital: 'Health & Fitness',
  medical: 'Health & Fitness',
  // Entertainment
  cinema: 'Entertainment',
  movie: 'Entertainment',
  // Travel
  airline: 'Travel',
  emirates: 'Travel',
  hotel: 'Travel',
  booking: 'Travel',
  airbnb: 'Travel',
  flight: 'Travel',
  // Housing
  rent: 'Housing & Rent',
  landlord: 'Housing & Rent',
  // Education
  school: 'Education',
  tuition: 'Education',
  course: 'Education',
  // Income
  salary: 'Salary',
  payroll: 'Salary',
  interest: 'Bank Interest',
  dividend: 'Dividends',
  cashback: 'Cashback & Rewards',
  refund: 'Refunds',
  transfer: 'Internal Transfer',
}

const EXPENSE_CATEGORIES = [
  'Groceries',
  'Dining & Coffee',
  'Taxis & Rideshare',
  'Car',
  'Bills & Utilities',
  'Housing & Rent',
  'Shopping',
  'Subscriptions',
  'Health & Fitness',
  'Entertainment',
  'Travel',
  'Education',
  'Personal Care',
  'Gifts & Donations',
  'Insurance',
  'Childcare',
  'Other Expense',
]

const INCOME_CATEGORIES = [
  'Salary',
  'Freelance Income',
  'Bank Interest',
  'Dividends',
  'Rental Income',
  'Cashback & Rewards',
  'Refunds',
  'Internal Transfer',
]

const ALL_CATEGORIES = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

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
        i++ // skip escaped quote
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
        if (currentRow.some((field) => field !== '')) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
        if (char === '\r') i++ // skip \n after \r
      } else {
        currentField += char
      }
    }
  }

  // Handle last field/row
  currentRow.push(currentField.trim())
  if (currentRow.some((field) => field !== '')) {
    rows.push(currentRow)
  }

  return rows
}

function detectColumns(headers: string[]): ColumnMapping | null {
  const lower = headers.map((h) => h.toLowerCase())

  let dateCol = -1
  let descCol = -1
  let amountCol = -1
  let debitCol: number | undefined
  let creditCol: number | undefined

  for (let i = 0; i < lower.length; i++) {
    const h = lower[i]
    if (dateCol === -1 && (h.includes('date') || h.includes('posted') || h.includes('transaction date'))) {
      dateCol = i
    }
    if (descCol === -1 && (h.includes('description') || h.includes('narrative') || h.includes('details') || h.includes('memo') || h.includes('particulars') || h.includes('reference'))) {
      descCol = i
    }
    if (amountCol === -1 && h === 'amount') {
      amountCol = i
    }
    if (h.includes('debit') || h.includes('withdrawal')) {
      debitCol = i
    }
    if (h.includes('credit') || h.includes('deposit')) {
      creditCol = i
    }
  }

  // If no single amount column but we have debit/credit, that works
  if (amountCol === -1 && debitCol === undefined && creditCol === undefined) {
    // Try broader matching for amount
    for (let i = 0; i < lower.length; i++) {
      if (lower[i].includes('amount') || lower[i].includes('value') || lower[i].includes('sum')) {
        amountCol = i
        break
      }
    }
  }

  // Fallback: if still no date column, try first column
  if (dateCol === -1) dateCol = 0
  // Fallback: if still no description, try second column
  if (descCol === -1) descCol = Math.min(1, headers.length - 1)

  if (amountCol === -1 && debitCol === undefined && creditCol === undefined) {
    return null
  }

  return { dateCol, descCol, amountCol, debitCol, creditCol }
}

function suggestCategory(description: string): string {
  const lower = description.toLowerCase()
  for (const [keyword, category] of Object.entries(KEYWORD_MAP)) {
    if (lower.includes(keyword)) {
      return category
    }
  }
  return ''
}

function formatCurrency(amount: number, currency: string): string {
  const symbol =
    currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'AED' ? 'AED ' : `${currency} `
  return `${amount < 0 ? '-' : ''}${symbol}${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ImportPage() {
  const [selectedAccount, setSelectedAccount] = useState<string>(ACCOUNTS[0].name)
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)

  const account = ACCOUNTS.find((a) => a.name === selectedAccount) ?? ACCOUNTS[0]

  const handleFileSelect = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile)
      setParseError(null)

      if (!selectedFile.name.toLowerCase().endsWith('.csv')) {
        setParsedTransactions([])
        return
      }

      setIsProcessing(true)

      try {
        const text = await selectedFile.text()
        const rows = parseCSV(text)

        if (rows.length < 2) {
          setParseError('The CSV file appears to be empty or has insufficient data.')
          setIsProcessing(false)
          return
        }

        const headers = rows[0]
        const mapping = detectColumns(headers)

        if (!mapping) {
          setParseError(
            'Could not auto-detect columns. Please ensure your CSV has headers including date, description, and amount/debit/credit columns.'
          )
          setIsProcessing(false)
          return
        }

        const transactions: ParsedTransaction[] = []

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (row.length < 2) continue

          const dateRaw = row[mapping.dateCol] ?? ''
          const description = row[mapping.descCol] ?? ''

          let amount = 0
          if (mapping.amountCol !== -1 && row[mapping.amountCol]) {
            amount = parseFloat(row[mapping.amountCol].replace(/[^0-9.\-]/g, '')) || 0
          } else if (mapping.debitCol !== undefined || mapping.creditCol !== undefined) {
            const debit = mapping.debitCol !== undefined ? parseFloat(row[mapping.debitCol]?.replace(/[^0-9.\-]/g, '') ?? '0') || 0 : 0
            const credit = mapping.creditCol !== undefined ? parseFloat(row[mapping.creditCol]?.replace(/[^0-9.\-]/g, '') ?? '0') || 0 : 0
            amount = credit - debit
          }

          if (!dateRaw && !description) continue

          const category = suggestCategory(description)
          const amountUSD = amount * account.usdRate

          transactions.push({
            date: dateRaw,
            description,
            amount,
            currency: account.currency,
            amountUSD,
            category,
            status: category ? 'categorised' : 'needs-review',
          })
        }

        setParsedTransactions(transactions)
      } catch {
        setParseError('Failed to parse the CSV file. Please check the file format.')
      } finally {
        setIsProcessing(false)
      }
    },
    [account]
  )

  const handleCategoryChange = useCallback((index: number, newCategory: string) => {
    setParsedTransactions((prev) =>
      prev.map((tx, i) =>
        i === index
          ? {
              ...tx,
              category: newCategory,
              status: newCategory ? 'categorised' : 'needs-review',
            }
          : tx
      )
    )
  }, [])

  const handleConfirmImport = () => {
    const categorised = parsedTransactions.filter((tx) => tx.status === 'categorised')
    const needsReview = parsedTransactions.filter((tx) => tx.status === 'needs-review')
    // eslint-disable-next-line no-console
    console.log('Importing transactions:', {
      account: selectedAccount,
      total: parsedTransactions.length,
      categorised: categorised.length,
      needsReview: needsReview.length,
      transactions: parsedTransactions,
    })
    alert(
      `Imported ${parsedTransactions.length} transactions from ${selectedAccount}.\n${categorised.length} categorised, ${needsReview.length} need review.`
    )
  }

  const handleCancel = () => {
    setFile(null)
    setParsedTransactions([])
    setParseError(null)
  }

  // Summary stats
  const totalTransactions = parsedTransactions.length
  const autoCategorised = parsedTransactions.filter((tx) => tx.status === 'categorised').length
  const needsReview = parsedTransactions.filter((tx) => tx.status === 'needs-review').length
  const totalAmount = parsedTransactions.reduce((sum, tx) => sum + tx.amountUSD, 0)
  const categorisedPercent = totalTransactions > 0 ? Math.round((autoCategorised / totalTransactions) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* ----------------------------------------------------------------- */}
        {/* Page header                                                        */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Import</h1>
          <p className="mt-1 text-sm text-gray-500">Import Bank Statements</p>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Account selector                                                   */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-6">
          <label htmlFor="account-select" className="mb-2 block text-sm font-medium text-gray-700">
            Bank Account
          </label>
          <select
            id="account-select"
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ACCOUNTS.map((acc) => (
              <option key={acc.name} value={acc.name}>
                {acc.name} ({acc.currency})
              </option>
            ))}
          </select>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* File upload                                                        */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-8">
          <FileUpload
            onFileSelect={handleFileSelect}
            accept=".csv,.pdf"
            label="Drop your bank statement here"
            sublabel="CSV or PDF files accepted"
          />
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Processing indicator                                               */}
        {/* ----------------------------------------------------------------- */}
        {isProcessing && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="text-sm text-blue-700">Parsing and categorising transactions...</p>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Parse error                                                        */}
        {/* ----------------------------------------------------------------- */}
        {parseError && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{parseError}</p>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* PDF notice                                                         */}
        {/* ----------------------------------------------------------------- */}
        {file && file.name.toLowerCase().endsWith('.pdf') && parsedTransactions.length === 0 && !parseError && (
          <div className="mb-8 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <FileText className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-sm text-amber-700">
              PDF parsing requires server-side processing. The file has been staged for import. Click
              &ldquo;Confirm &amp; Import&rdquo; to process it.
            </p>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Summary bar                                                        */}
        {/* ----------------------------------------------------------------- */}
        {parsedTransactions.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Total Transactions
              </p>
              <p className="mt-1 text-xl font-semibold text-gray-900">{totalTransactions}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Auto-categorised
              </p>
              <p className="mt-1 text-xl font-semibold text-green-600">
                {autoCategorised}{' '}
                <span className="text-sm font-normal text-gray-400">({categorisedPercent}%)</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Needs Review
              </p>
              <p className="mt-1 text-xl font-semibold text-amber-600">{needsReview}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                Total Amount (USD)
              </p>
              <p className={`mt-1 text-xl font-semibold ${totalAmount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {totalAmount < 0 ? '-' : ''}${Math.abs(totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------------- */}
        {/* Preview table                                                      */}
        {/* ----------------------------------------------------------------- */}
        {parsedTransactions.length > 0 && (
          <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Date
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Description
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Amount (Local)
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Amount (USD)
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Category
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsedTransactions.map((tx, index) => (
                    <tr
                      key={index}
                      className={`transition-colors hover:bg-gray-50 ${
                        tx.status === 'needs-review' ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-gray-600">{tx.date}</td>
                      <td className="max-w-xs truncate px-4 py-3 font-medium text-gray-900" title={tx.description}>
                        {tx.description}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm ${
                          tx.amount < 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {formatCurrency(tx.amount, tx.currency)}
                      </td>
                      <td
                        className={`whitespace-nowrap px-4 py-3 text-right font-mono text-sm ${
                          tx.amountUSD < 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {tx.amountUSD < 0 ? '-' : ''}$
                        {Math.abs(tx.amountUSD).toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={tx.category}
                          onChange={(e) => handleCategoryChange(index, e.target.value)}
                          className={`w-full min-w-[160px] rounded-md border px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                            tx.category
                              ? 'border-gray-200 bg-white text-gray-700'
                              : 'border-amber-300 bg-amber-50 text-amber-700'
                          }`}
                        >
                          <option value="">-- Select category --</option>
                          <optgroup label="Expenses">
                            {EXPENSE_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Income">
                            {INCOME_CATEGORIES.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </optgroup>
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

        {/* ----------------------------------------------------------------- */}
        {/* Action buttons                                                     */}
        {/* ----------------------------------------------------------------- */}
        {(parsedTransactions.length > 0 || (file && file.name.toLowerCase().endsWith('.pdf'))) && (
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-2"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmImport}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Upload className="h-4 w-4" />
              Confirm &amp; Import
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
