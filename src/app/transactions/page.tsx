'use client'

import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { Search, ChevronDown, Check } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { DataTable } from '@/components/ui/DataTable'
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
  type: 'income' | 'expense' | 'transfer'
  isBusinessExpense: boolean
  isInternalTransfer: boolean
  holder: 'anjan' | 'kate' | 'joint'
}

interface Category {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
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

// ────────────────────────────────────────────────
// Multi-select filter popup
// ────────────────────────────────────────────────

interface MSOption {
  value: string
  label: string
  group?: string
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
}: {
  label: string
  options: MSOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }

  const summary =
    selected.size === 0
      ? `All ${label}`
      : selected.size === 1
        ? options.find((o) => o.value === [...selected][0])?.label ?? `1 ${label.slice(0, -1)}`
        : `${selected.size} ${label}`

  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const groups = filtered.reduce<string[]>((acc, o) => {
    const g = o.group ?? ''
    if (!acc.includes(g)) acc.push(g)
    return acc
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm shadow-sm transition-colors ${
          selected.size ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {summary}
        <ChevronDown className={`h-4 w-4 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1.5 w-64 rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</span>
            {selected.size > 0 && (
              <button onClick={() => onChange(new Set())} className="text-xs font-medium text-blue-600 hover:underline">
                Clear
              </button>
            )}
          </div>
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            />
          )}
          <div className="max-h-72 overflow-y-auto">
            {groups.map((g) => (
              <div key={g}>
                {g && <p className="px-1 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g}</p>}
                {filtered
                  .filter((o) => (o.group ?? '') === g)
                  .map((o) => {
                    const on = selected.has(o.value)
                    return (
                      <button
                        key={o.value}
                        onClick={() => toggle(o.value)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <span
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                            on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'
                          }`}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{o.label}</span>
                      </button>
                    )
                  })}
              </div>
            ))}
            {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-gray-400">No matches</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────

export default function TransactionsPage() {
  // Data state
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [dbConnected, setDbConnected] = useState(true)

  // Filter state
  const [search, setSearch] = useState('')
  const [catFilters, setCatFilters] = useState<Set<string>>(new Set())
  const [acctFilters, setAcctFilters] = useState<Set<string>>(new Set())
  const [monthFilter, setMonthFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')

  // Inline description editing
  const [editingDesc, setEditingDesc] = useState<string | null>(null)
  const [descDraft, setDescDraft] = useState('')

  // ---- Fetch data on mount ----
  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      try {
        const [txRes, catRes] = await Promise.all([
          fetch('/api/transactions'),
          fetch('/api/categories'),
        ])
        if (!txRes.ok || !catRes.ok) throw new Error('API error')
        const txData = await txRes.json()
        const catData = await catRes.json()
        if (cancelled) return
        setTransactions(txData.transactions || [])
        setCategories(catData.categories || [])
        setDbConnected(true)
      } catch {
        if (!cancelled) setDbConnected(false)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

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
      ...transferCategories.map((c) => ({ value: c.name, label: c.name, group: 'Transfers' })),
    ],
    [expenseCategories, incomeCategories, transferCategories],
  )
  const acctOptions = useMemo(() => accountNames.map((a) => ({ value: a, label: a })), [accountNames])

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
        className: 'min-w-[200px]',
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
        className: 'w-[200px]',
        render: (tx: Transaction) => (
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: tx.categoryColor }}
            />
            <select
              value={tx.categoryId ?? ''}
              onChange={(e) => handleCategoryChange(tx.id, e.target.value)}
              className="w-full rounded-md border border-transparent bg-transparent py-0.5 text-sm text-gray-700 hover:border-gray-200 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
            >
              <option value="" disabled>
                Uncategorised
              </option>
              <optgroup label="Expenses">
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Income">
                {incomeCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              {transferCategories.length > 0 && (
                <optgroup label="Transfers & Investments">
                  {transferCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
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
    ],
    [expenseCategories, incomeCategories, transferCategories, handleCategoryChange, editingDesc, descDraft, saveDescription],
  )

  const getRowClassName = (tx: Transaction) =>
    CURRENCY_ROW_CLASS[tx.accountCurrency ?? ''] ?? ''

  const pillClass = (active: boolean) =>
    active
      ? 'bg-gray-900 text-white shadow-sm'
      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'

  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Transactions</h1>
        <p className="mt-1 text-sm text-gray-500">Transaction Explorer</p>
      </div>

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

        <select
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
        >
          <option value="all">All Years</option>
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </select>

        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
        >
          <option value="all">All Months</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <div className="h-6 w-px bg-gray-200" />

        <div className="flex gap-1">
          {(['all', 'income', 'expense'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${pillClass(typeFilter === t)}`}
            >
              {t === 'all' ? 'All Types' : t}
            </button>
          ))}
        </div>

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
          isLoading ? 'Loading…' : 'No transactions yet — import a statement to get started.'
        }
        rowClassName={(item) => getRowClassName(item as unknown as Transaction)}
      />
    </div>
  )
}
