'use client'

import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Copy, Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { DataTable } from '@/components/ui/DataTable'
import { Select, MultiSelect } from '@/components/ui/Select'
import { formatCurrency, formatUSD } from '@/lib/currency'

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

interface Transaction {
  id: string
  date: string
  description: string
  accountId: string | null
  accountName: string | null
  accountCountry: string | null
  accountCurrency: string | null
  categoryId: string | null
  categoryName: string
  categoryColor: string
  amountLocal: number
  currency: string
  amountUsd: number
  type: 'income' | 'expense' | 'transfer' | 'investment'
  isBusinessExpense: boolean
  isInternalTransfer: boolean
  holder: 'anjan' | 'kate' | 'joint'
}

interface Category {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer' | 'investment'
  color: string
}

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

// Row tint by account currency — a quick visual grouping.
const CURRENCY_ROW_CLASS: Record<string, string> = {
  AED: 'bg-amber-50/40',
  GBP: 'bg-sky-50/40',
  USD: '',
}

// A blank manual-entry form, dated today.
const emptyAddForm = () => ({
  date: new Date().toISOString().slice(0, 10),
  description: '',
  amount: '',
  currency: 'USD',
  accountId: '',
  categoryId: '',
})

// ────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────

export default function TransactionsPage() {
  // Data state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [accounts, setAccounts] = useState<{ id: string; name: string; currency?: string }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dbConnected, setDbConnected] = useState(true)

  // Manual "add transaction" form.
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState(emptyAddForm)
  // The transaction the form was copied from, so the form can say what it's a
  // duplicate of (recurring entries are far quicker to copy than to retype).
  const [duplicatedFrom, setDuplicatedFrom] = useState<string | null>(null)

  // Filter state
  const [search, setSearch] = useState('')
  const [catFilters, setCatFilters] = useState<Set<string>>(new Set())
  const [acctFilters, setAcctFilters] = useState<Set<string>>(new Set())
  const [monthFilter, setMonthFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense' | 'transfer' | 'investment'>('all')

  // Inline description editing
  const [editingDesc, setEditingDesc] = useState<string | null>(null)
  const [descDraft, setDescDraft] = useState('')

  // ---- Fetch data ----
  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [txRes, catRes, accRes] = await Promise.all([
        // This page filters client-side (multi-select category/account, year,
        // month, search), so it must have every transaction — not just the
        // API's default newest-500 window, which hid all older-year rows and
        // made year filters (e.g. 2024) come back empty.
        fetch('/api/transactions?limit=100000'),
        fetch('/api/categories'),
        fetch('/api/accounts'),
      ])
      if (!txRes.ok || !catRes.ok) throw new Error('API error')
      const txData = await txRes.json()
      const catData = await catRes.json()
      const accData = accRes.ok ? await accRes.json() : { accounts: [] }
      setTransactions(txData.transactions || [])
      setCategories(catData.categories || [])
      setAccounts(accData.accounts || [])
      setDbConnected(true)
    } catch {
      setDbConnected(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories],
  )
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories],
  )
  const transferCategories = useMemo(
    () => categories.filter((c) => c.type === 'transfer'),
    [categories],
  )
  const investmentCategories = useMemo(
    () => categories.filter((c) => c.type === 'investment'),
    [categories],
  )
  const accountNames = useMemo(
    () =>
      Array.from(
        new Set(transactions.map((t) => t.accountName).filter(Boolean) as string[]),
      ).sort(),
    [transactions],
  )

  // ---- Inline category edit ----
  const handleCategoryChange = useCallback(
    async (id: string, categoryId: string) => {
      const cat = categories.find((c) => c.id === categoryId)
      const tx = transactions.find((t) => t.id === id)
      // The transaction type follows the category type; a transfer category also
      // marks it as internal so the P&L excludes it.
      const newType = cat?.type ?? tx?.type ?? 'expense'
      const isInternal = cat?.type === 'transfer' && cat?.name === 'Internal Transfer'
      // Optimistic update.
      setTransactions((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                categoryId,
                categoryName: cat?.name ?? t.categoryName,
                categoryColor: cat?.color ?? t.categoryColor,
                type: newType,
                isInternalTransfer: isInternal,
              }
            : t,
        ),
      )
      try {
        await fetch(`/api/transactions/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categoryId, type: newType, isInternalTransfer: isInternal }),
        })
        // Self-learning: teach the merchant -> category mapping so the next
        // statement auto-categorises this merchant correctly.
        if (tx?.description) {
          fetch('/api/merchant-mappings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: tx.description, categoryId }),
          }).catch(() => {})
        }
      } catch {
        // Best-effort; a reload will reflect server truth.
      }
    },
    [categories, transactions],
  )

  // Copy an existing transaction into the manual add form. Nothing is saved
  // until "Add transaction" — every field stays editable first.
  const startDuplicate = useCallback((tx: Transaction) => {
    setAddForm({
      date: tx.date.slice(0, 10),
      description: tx.description,
      amount: String(Math.abs(tx.amountLocal)),
      currency: tx.currency,
      accountId: tx.accountId ?? '',
      categoryId: tx.categoryId ?? '',
    })
    setDuplicatedFrom(tx.description || 'an existing transaction')
    setShowAdd(true)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const closeAddForm = useCallback(() => {
    setShowAdd(false)
    setAddForm(emptyAddForm())
    setDuplicatedFrom(null)
  }, [])

  const saveDescription = useCallback(async (id: string, value: string) => {
    const v = value.trim()
    setEditingDesc(null)
    setTransactions((prev) => prev.map((t) => (t.id === id ? { ...t, description: v } : t)))
    try {
      await fetch(`/api/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: v }),
      })
    } catch {
      /* best-effort */
    }
  }, [])

  // ---- Filtered data ----
  const filteredData = useMemo(() => {
    return transactions.filter((tx) => {
      if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) {
        return false
      }
      if (catFilters.size && !catFilters.has(tx.categoryName)) return false
      if (acctFilters.size && (!tx.accountName || !acctFilters.has(tx.accountName))) return false
      if (monthFilter !== 'all') {
        const txMonth = parseISO(tx.date).getMonth()
        if (txMonth !== MONTHS.indexOf(monthFilter)) return false
      }
      if (yearFilter !== 'all') {
        if (String(parseISO(tx.date).getFullYear()) !== yearFilter) return false
      }
      if (typeFilter !== 'all' && tx.type !== typeFilter) return false
      return true
    })
  }, [transactions, search, catFilters, acctFilters, monthFilter, yearFilter, typeFilter])

  // Distinct years present in the data, for the year filter.
  const years = useMemo(
    () => Array.from(new Set(transactions.map((t) => parseISO(t.date).getFullYear()))).sort((a, b) => b - a),
    [transactions],
  )

  // Options for the multi-select filters.
  const catOptions = useMemo(
    () => [
      ...expenseCategories.map((c) => ({ value: c.name, label: c.name, group: 'Expenses' })),
      ...incomeCategories.map((c) => ({ value: c.name, label: c.name, group: 'Income' })),
      ...investmentCategories.map((c) => ({ value: c.name, label: c.name, group: 'Investments' })),
      ...transferCategories.map((c) => ({ value: c.name, label: c.name, group: 'Transfers' })),
    ],
    [expenseCategories, incomeCategories, investmentCategories, transferCategories],
  )
  const acctOptions = useMemo(() => accountNames.map((a) => ({ value: a, label: a })), [accountNames])

  // Recent transactions offered as templates in the manual-entry form. Capped so
  // the dropdown stays quick — it's searchable, and older ones can be duplicated
  // from their row in the table.
  const duplicateOptions = useMemo(
    () =>
      [...transactions]
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 300)
        .map((t) => ({
          value: t.id,
          label: `${format(parseISO(t.date), 'd MMM yy')} · ${t.description} · ${formatCurrency(Math.abs(t.amountLocal), t.currency)}`,
          group: t.accountName ?? 'No account',
        })),
    [transactions],
  )

  // Options for the inline per-row category dropdown (value = category id).
  const categorySelectOptions = useMemo(
    () => [
      ...expenseCategories.map((c) => ({ value: c.id, label: c.name, group: 'Expenses', color: c.color })),
      ...incomeCategories.map((c) => ({ value: c.id, label: c.name, group: 'Income', color: c.color })),
      ...investmentCategories.map((c) => ({ value: c.id, label: c.name, group: 'Investments', color: c.color })),
      ...transferCategories.map((c) => ({ value: c.id, label: c.name, group: 'Transfers', color: c.color })),
    ],
    [expenseCategories, incomeCategories, investmentCategories, transferCategories],
  )

  // ---- Columns ----
  const columns = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        sortable: true,
        className: 'w-[110px]',
        render: (tx: Transaction) => (
          <span className="whitespace-nowrap text-sm text-gray-600">
            {format(parseISO(tx.date), 'd MMM yyyy')}
          </span>
        ),
      },
      {
        key: 'description',
        header: 'Description',
        className: 'w-[240px] max-w-[240px]',
        render: (tx: Transaction) =>
          editingDesc === tx.id ? (
            <input
              autoFocus
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={() => saveDescription(tx.id, descDraft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveDescription(tx.id, descDraft)
                if (e.key === 'Escape') setEditingDesc(null)
              }}
              className="w-full rounded-md border border-blue-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          ) : (
            <button
              onClick={() => {
                setEditingDesc(tx.id)
                setDescDraft(tx.description)
              }}
              title="Click to edit"
              className="w-full truncate text-left text-sm font-medium text-gray-900 hover:text-blue-600"
            >
              {tx.description || <span className="italic text-gray-400">Add description…</span>}
            </button>
          ),
      },
      {
        key: 'accountName',
        header: 'Account',
        className: 'w-[160px]',
        render: (tx: Transaction) => (
          <span className="text-sm text-gray-700">{tx.accountName ?? '—'}</span>
        ),
      },
      {
        key: 'categoryName',
        header: 'Category',
        className: 'w-[230px] min-w-[230px]',
        render: (tx: Transaction) => (
          <Select
            ariaLabel="Category"
            value={tx.categoryId ?? ''}
            onChange={(v) => handleCategoryChange(tx.id, v)}
            options={categorySelectOptions}
            placeholder="Uncategorised"
            searchable
            panelWidth={240}
            buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-700 hover:border-gray-200 hover:bg-gray-50"
          />
        ),
      },
      {
        key: 'amountLocal',
        header: 'Amount (Local)',
        sortable: true,
        className: 'w-[140px] text-right',
        render: (tx: Transaction) => {
          const isNegative = tx.type === 'expense'
          return (
            <span
              className={`block text-right text-sm font-medium tabular-nums ${
                isNegative ? 'text-gray-900' : 'text-emerald-700'
              }`}
            >
              {isNegative ? '-' : '+'}
              {formatCurrency(Math.abs(tx.amountLocal), tx.currency)}
            </span>
          )
        },
      },
      {
        key: 'amountUsd',
        header: 'Amount (USD)',
        sortable: true,
        className: 'w-[130px] text-right',
        render: (tx: Transaction) => {
          const isNegative = tx.type === 'expense'
          return (
            <span
              className={`block text-right text-sm tabular-nums ${
                isNegative ? 'text-gray-500' : 'text-emerald-600'
              }`}
            >
              {isNegative ? '-' : '+'}
              {formatUSD(Math.abs(tx.amountUsd))}
            </span>
          )
        },
      },
      {
        key: 'type',
        header: 'Type',
        className: 'w-[100px]',
        render: (tx: Transaction) => {
          const styles: Record<string, string> = {
            income: 'bg-emerald-50 text-emerald-700',
            expense: 'bg-red-50 text-red-700',
            transfer: 'bg-blue-50 text-blue-700',
            investment: 'bg-indigo-50 text-indigo-700',
          }
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                styles[tx.type] ?? ''
              }`}
            >
              {tx.type}
            </span>
          )
        },
      },
      {
        key: 'duplicate',
        header: '',
        className: 'w-[44px]',
        render: (tx: Transaction) => (
          <button
            onClick={() => startDuplicate(tx)}
            title="Duplicate — copies this into the add form to edit before saving"
            aria-label={`Duplicate ${tx.description}`}
            className="rounded-md p-1.5 text-gray-300 transition-colors hover:bg-blue-50 hover:text-blue-600"
          >
            <Copy className="h-4 w-4" />
          </button>
        ),
      },
    ],
    [categorySelectOptions, handleCategoryChange, editingDesc, descDraft, saveDescription, startDuplicate],
  )

  const getRowClassName = (tx: Transaction) =>
    CURRENCY_ROW_CLASS[tx.accountCurrency ?? ''] ?? ''

  async function submitManual() {
    const amt = parseFloat(addForm.amount)
    if (!addForm.description.trim() || isNaN(amt) || amt === 0) return
    const cat = categories.find((c) => c.id === addForm.categoryId)
    const type = cat?.type ?? 'expense'
    setAdding(true)
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactions: [
            {
              accountId: addForm.accountId || null,
              date: addForm.date,
              description: addForm.description.trim(),
              amountLocal: Math.abs(amt),
              currency: addForm.currency,
              categoryId: addForm.categoryId || null,
              type,
            },
          ],
        }),
      })
      if (res.ok) {
        closeAddForm()
        await load()
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Transactions</h1>
          <p className="mt-1 text-sm text-gray-500">Transaction Explorer</p>
        </div>
        <button
          onClick={() => (showAdd ? closeAddForm() : setShowAdd(true))}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          + Add transaction
        </button>
      </div>

      {/* Manual add form — for spend that never came through a statement (e.g. a
          personal expense on a business card). Counts in the P&L like any other. */}
      {showAdd && (
        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
          {/* Start from a previous transaction — recurring entries (rent, a
              monthly transfer) are quicker to copy and tweak than to retype. */}
          <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-blue-100 pb-3">
            <Copy className="h-4 w-4 shrink-0 text-blue-400" />
            <span className="text-xs font-medium text-gray-600">Copy a previous transaction</span>
            <Select
              value=""
              onChange={(id) => {
                const tx = transactions.find((t) => t.id === id)
                if (tx) startDuplicate(tx)
              }}
              searchable
              placeholder="Search a transaction to duplicate…"
              ariaLabel="Copy a previous transaction"
              options={duplicateOptions}
              panelWidth={420}
              buttonClassName="inline-flex h-[34px] w-full max-w-md min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            />
            {duplicatedFrom && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700">
                Copied from “{duplicatedFrom}” — edit anything below, nothing is saved yet
              </span>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Date</label>
              <input
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div className="sm:col-span-1 lg:col-span-2">
              <label className="mb-1 block text-xs font-medium text-gray-600">Description</label>
              <input
                type="text"
                placeholder="e.g. Flights to London (personal, on business card)"
                value={addForm.description}
                onChange={(e) => setAddForm((f) => ({ ...f, description: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Amount</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  placeholder="12000"
                  value={addForm.amount}
                  onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                />
                <Select
                  value={addForm.currency}
                  onChange={(v) => setAddForm((f) => ({ ...f, currency: v }))}
                  ariaLabel="Currency"
                  options={['USD', 'GBP', 'AED', 'EUR'].map((c) => ({ value: c, label: c }))}
                  buttonClassName="inline-flex h-[38px] w-20 items-center justify-between gap-1 rounded-lg border border-gray-300 bg-white px-2 text-sm hover:bg-gray-50"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Category</label>
              <Select
                value={addForm.categoryId}
                onChange={(v) => setAddForm((f) => ({ ...f, categoryId: v }))}
                searchable
                placeholder="Choose a category"
                ariaLabel="Category"
                options={categorySelectOptions}
                buttonClassName="inline-flex h-[38px] w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Account</label>
              <Select
                value={addForm.accountId}
                onChange={(v) => setAddForm((f) => ({ ...f, accountId: v }))}
                ariaLabel="Account"
                options={[{ value: '', label: 'None (manual / off-statement)' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
                buttonClassName="inline-flex h-[38px] w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <button onClick={closeAddForm} className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button
              onClick={submitManual}
              disabled={adding || !addForm.description.trim() || !addForm.amount}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {adding ? 'Adding…' : 'Add transaction'}
            </button>
          </div>
        </div>
      )}

      {!dbConnected && !isLoading && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Couldn&apos;t reach the database. Import a statement to add transactions, or check your connection.
        </div>
      )}

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 shadow-sm outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
          />
        </div>

        <MultiSelect label="Categories" options={catOptions} selected={catFilters} onChange={setCatFilters} searchable />

        <MultiSelect label="Accounts" options={acctOptions} selected={acctFilters} onChange={setAcctFilters} />

        <Select
          ariaLabel="Filter by year"
          value={yearFilter}
          onChange={setYearFilter}
          options={[{ value: 'all', label: 'All Years' }, ...years.map((y) => ({ value: String(y), label: String(y) }))]}
        />

        <Select
          ariaLabel="Filter by month"
          value={monthFilter}
          onChange={setMonthFilter}
          options={[{ value: 'all', label: 'All Months' }, ...MONTHS.map((m) => ({ value: m, label: m }))]}
        />

        <Select
          ariaLabel="Filter by type"
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as typeof typeFilter)}
          options={[
            { value: 'all', label: 'All Types' },
            { value: 'income', label: 'Income' },
            { value: 'expense', label: 'Expense' },
            { value: 'investment', label: 'Investment' },
            { value: 'transfer', label: 'Transfer' },
          ]}
        />

      </div>

      {/* Results count */}
      <div className="mb-3 text-sm text-gray-500">
        {isLoading
          ? 'Loading…'
          : `${filteredData.length} transaction${filteredData.length !== 1 ? 's' : ''} found`}
      </div>

      {/* Data table */}
      <DataTable<Transaction & Record<string, unknown>>
        columns={columns as { key: string; header: string; render?: (item: Transaction & Record<string, unknown>) => React.ReactNode; sortable?: boolean; className?: string }[]}
        data={filteredData as (Transaction & Record<string, unknown>)[]}
        pageSize={20}
        emptyMessage={
          isLoading
            ? 'Loading…'
            : transactions.length > 0
              ? 'No transactions match these filters — try clearing them.'
              : 'No transactions yet — import a statement to get started.'
        }
        rowClassName={(item) => getRowClassName(item as unknown as Transaction)}
      />
    </div>
  )
}
