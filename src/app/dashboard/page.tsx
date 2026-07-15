'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { DollarSign, TrendingDown, Wallet, Percent } from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Amt {
  usd: number
  gbp: number
}

interface Line {
  category: string
  color: string
  monthly: Record<string, Amt>
  total: Amt
}

interface PnL {
  from: string
  to: string
  months: string[]
  gbpRate: number
  income: Line[]
  expense: Line[]
  totals: {
    incomeByMonth: Record<string, Amt>
    expenseByMonth: Record<string, Amt>
    netByMonth: Record<string, Amt>
    incomeTotal: Amt
    expenseTotal: Amt
    net: Amt
    savingsRate: number
  }
}

type Mode = 'year' | 'month' | 'custom'
type Currency = 'USD' | 'GBP'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const YEARS = [2024, 2025, 2026, 2027]

function fmtMoney(n: number, currency: Currency): string {
  const sym = currency === 'GBP' ? '£' : '$'
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}${sym}${abs}`
}

const pick = (a: Amt | undefined, c: Currency): number => (!a ? 0 : c === 'GBP' ? a.gbp : a.usd)

function monthHeader(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${String(y).slice(2)}`
}

function lastDay(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1, 0))
  return `${year}-${String(month1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CashFlowPage() {
  const now = new Date()
  const [mode, setMode] = useState<Mode>('year')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [customFrom, setCustomFrom] = useState(`${now.getFullYear()}-01-01`)
  const [customTo, setCustomTo] = useState(now.toISOString().slice(0, 10))
  const [pnl, setPnl] = useState<PnL | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currency, setCurrency] = useState<Currency>('USD')

  const { from, to } = useMemo(() => {
    if (mode === 'year') return { from: `${year}-01-01`, to: `${year}-12-31` }
    if (mode === 'month') {
      return { from: `${year}-${String(month + 1).padStart(2, '0')}-01`, to: lastDay(year, month + 1) }
    }
    return { from: customFrom, to: customTo }
  }, [mode, year, month, customFrom, customTo])

  const load = useCallback(async () => {
    if (!from || !to || from > to) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/pnl?from=${from}&to=${to}`)
      const data = await res.json()
      setPnl(res.ok ? data : null)
    } catch {
      setPnl(null)
    } finally {
      setIsLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    load()
  }, [load])

  const fmt = useCallback((n: number) => fmtMoney(n, currency), [currency])

  const months = pnl?.months ?? []
  const showMonthCols = months.length > 1
  const t = pnl?.totals

  // Drill-down: clicking a P&L cell opens the underlying transactions.
  const [drill, setDrill] = useState<{ category: string; from: string; to: string; label: string } | null>(null)
  const openDrill = useCallback(
    (category: string, ym: string | null) => {
      if (ym) {
        const [yy, mm] = ym.split('-').map(Number)
        setDrill({ category, from: `${ym}-01`, to: lastDay(yy, mm), label: `${category} · ${monthHeader(ym)}` })
      } else {
        setDrill({ category, from, to, label: `${category} · total` })
      }
    },
    [from, to],
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Monthly Cash Flow</h1>
          <p className="mt-1 text-sm text-gray-500">Profit &amp; loss statement</p>
        </div>

        {/* Period controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
            {(['year', 'month', 'custom'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  mode === m ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {m === 'custom' ? 'Custom range' : m}
              </button>
            ))}
          </div>

          {mode !== 'custom' && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          {mode === 'month' && (
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>
          )}

          {mode === 'custom' && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
              />
              <span className="text-sm text-gray-400">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          )}

          {/* Currency toggle */}
          <div className="ml-auto inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
            {(['USD', 'GBP'] as Currency[]).map((c) => (
              <button
                key={c}
                onClick={() => setCurrency(c)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  currency === c ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {c === 'USD' ? '$ USD' : '£ GBP'}
              </button>
            ))}
          </div>

          {isLoading && <span className="animate-pulse text-xs text-blue-500">Loading…</span>}
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Income" value={fmt(pick(t?.incomeTotal, currency))} subtitle="for the period" icon={<DollarSign className="h-5 w-5 text-green-500" />} />
          <Card title="Expenses" value={fmt(pick(t?.expenseTotal, currency))} subtitle="for the period" icon={<TrendingDown className="h-5 w-5 text-red-500" />} />
          <Card title="Net" value={fmt(pick(t?.net, currency))} subtitle="income − expenses" icon={<Wallet className="h-5 w-5 text-blue-500" />} />
          <Card title="Savings Rate" value={`${(t?.savingsRate ?? 0).toFixed(1)}%`} subtitle="net / income" icon={<Percent className="h-5 w-5 text-purple-500" />} />
        </div>

        {/* P&L statement */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                  <th className="sticky left-0 z-10 bg-gray-50/60 px-4 py-3 font-medium text-gray-500">Category</th>
                  {showMonthCols &&
                    months.map((ym) => (
                      <th key={ym} className="px-4 py-3 text-right font-medium text-gray-500 whitespace-nowrap">
                        {monthHeader(ym)}
                      </th>
                    ))}
                  <th className="px-4 py-3 text-right font-semibold text-gray-600">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {!pnl || (pnl.income.length === 0 && pnl.expense.length === 0) ? (
                  <tr>
                    <td colSpan={months.length + 2} className="px-4 py-12 text-center text-gray-400">
                      {isLoading ? 'Loading…' : 'No transactions in this period.'}
                    </td>
                  </tr>
                ) : (
                  <>
                    <SectionRow label="Income" span={months.length} showMonthCols={showMonthCols} tone="income" />
                    {pnl.income.map((l) => (
                      <LineRow key={`i-${l.category}`} line={l} months={months} showMonthCols={showMonthCols} currency={currency} fmt={fmt} onDrill={openDrill} />
                    ))}
                    <TotalRow label="Total Income" byMonth={t!.incomeByMonth} total={t!.incomeTotal} months={months} showMonthCols={showMonthCols} tone="income" currency={currency} fmt={fmt} />

                    <SectionRow label="Expenses" span={months.length} showMonthCols={showMonthCols} tone="expense" />
                    {pnl.expense.map((l) => (
                      <LineRow key={`e-${l.category}`} line={l} months={months} showMonthCols={showMonthCols} currency={currency} fmt={fmt} onDrill={openDrill} />
                    ))}
                    <TotalRow label="Total Expenses" byMonth={t!.expenseByMonth} total={t!.expenseTotal} months={months} showMonthCols={showMonthCols} tone="expense" currency={currency} fmt={fmt} />

                    <TotalRow label="Net Cash Flow" byMonth={t!.netByMonth} total={t!.net} months={months} showMonthCols={showMonthCols} tone="net" currency={currency} fmt={fmt} />
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Figures shown in {currency}. GBP uses each transaction&rsquo;s recorded pound amount where
          available. Internal transfers and investments are excluded from the P&amp;L.
        </p>
      </div>
      <DrillDrawer drill={drill} currency={currency} onClose={() => setDrill(null)} onChanged={load} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Drill-down drawer — transactions behind a clicked P&L cell
// ---------------------------------------------------------------------------

interface DrillTxn {
  id: string
  date: string
  description: string
  amountUsd: number
  amountLocal: number
  currency: string
  accountName: string | null
  categoryName: string
}

interface DrillCat {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer'
}

function DrillDrawer({
  drill,
  currency,
  onClose,
  onChanged,
}: {
  drill: { category: string; from: string; to: string; label: string } | null
  currency: Currency
  onClose: () => void
  onChanged: () => void
}) {
  const [txns, setTxns] = useState<DrillTxn[]>([])
  const [loading, setLoading] = useState(false)
  const [cats, setCats] = useState<DrillCat[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCats(d.categories || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!drill) return
    let cancelled = false
    setLoading(true)
    setTxns([])
    const qs = new URLSearchParams({ categoryName: drill.category, from: drill.from, to: drill.to, limit: '1000' })
    fetch(`/api/transactions?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!cancelled) setTxns(d.transactions || [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [drill])

  const expenseCats = cats.filter((c) => c.type === 'expense')
  const incomeCats = cats.filter((c) => c.type === 'income')
  const transferCats = cats.filter((c) => c.type === 'transfer')

  async function reclassify(tx: DrillTxn, newName: string) {
    if (!drill || newName === drill.category) return
    const cat = cats.find((c) => c.name === newName)
    if (!cat) return
    setSavingId(tx.id)
    // Optimistically drop the row from this category's list (it's moving out).
    setTxns((prev) => prev.filter((t) => t.id !== tx.id))
    try {
      await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: cat.id, type: cat.type }),
      })
      // Teach the bookkeeper from this correction.
      fetch('/api/merchant-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: tx.description, categoryId: cat.id }),
      }).catch(() => {})
      onChanged() // refresh the P&L behind the drawer
    } catch {
      // Put it back if the save failed.
      setTxns((prev) => [tx, ...prev])
    } finally {
      setSavingId(null)
    }
  }

  if (!drill) return null

  const amt = (tx: DrillTxn) => (currency === 'GBP' && tx.currency === 'GBP' ? tx.amountLocal : tx.amountUsd)
  const total = txns.reduce((s, tx) => s + amt(tx), 0)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{drill.category}</h3>
            <p className="text-xs text-gray-500">{drill.label.replace(`${drill.category} · `, '')} · {txns.length} transaction{txns.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Close">
            ✕
          </button>
        </div>
        <div className="flex items-baseline justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Total</span>
          <span className="text-lg font-bold text-gray-900">{fmtMoney(total, currency)}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-transparent" />
              Loading…
            </div>
          ) : txns.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No transactions here.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {txns.map((tx) => (
                <div key={tx.id} className={`px-5 py-3 ${savingId === tx.id ? 'opacity-50' : ''}`}>
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900" title={tx.description}>{tx.description}</p>
                    <span className={`shrink-0 font-mono text-sm ${amt(tx) < 0 ? 'text-rose-600' : 'text-gray-900'}`}>
                      {fmtMoney(amt(tx), currency)}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="shrink-0 text-xs text-gray-400">{fmtDate(tx.date)}</span>
                    <select
                      value={drill.category}
                      onChange={(e) => reclassify(tx, e.target.value)}
                      className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      title="Reclassify"
                    >
                      <optgroup label="Expenses">
                        {expenseCats.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                      </optgroup>
                      <optgroup label="Income">
                        {incomeCats.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                      </optgroup>
                      {transferCats.length > 0 && (
                        <optgroup label="Transfers">
                          {transferCats.map((c) => (<option key={c.id} value={c.name}>{c.name}</option>))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function SectionRow({ label, span, showMonthCols, tone }: { label: string; span: number; showMonthCols: boolean; tone: 'income' | 'expense' }) {
  return (
    <tr className="bg-gray-50/80">
      <td
        colSpan={(showMonthCols ? span : 0) + 2}
        className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
          tone === 'income' ? 'text-emerald-600' : 'text-rose-600'
        }`}
      >
        {label}
      </td>
    </tr>
  )
}

function LineRow({
  line,
  months,
  showMonthCols,
  currency,
  fmt,
  onDrill,
}: {
  line: Line
  months: string[]
  showMonthCols: boolean
  currency: Currency
  fmt: (n: number) => string
  onDrill: (category: string, ym: string | null) => void
}) {
  return (
    <tr className="hover:bg-gray-50/50">
      <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
          <span className="text-gray-700">{line.category}</span>
        </div>
      </td>
      {showMonthCols &&
        months.map((ym) => {
          const v = pick(line.monthly[ym], currency)
          return (
            <td key={ym} className="px-4 py-2.5 text-right tabular-nums text-gray-500">
              {v ? (
                <button
                  onClick={() => onDrill(line.category, ym)}
                  className="rounded px-1 tabular-nums text-gray-600 hover:bg-blue-50 hover:text-blue-700 hover:underline"
                  title="See transactions"
                >
                  {fmt(v)}
                </button>
              ) : (
                '·'
              )}
            </td>
          )
        })}
      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
        {pick(line.total, currency) ? (
          <button
            onClick={() => onDrill(line.category, null)}
            className="rounded px-1 font-medium tabular-nums text-gray-900 hover:bg-blue-50 hover:text-blue-700 hover:underline"
            title="See transactions"
          >
            {fmt(pick(line.total, currency))}
          </button>
        ) : (
          fmt(pick(line.total, currency))
        )}
      </td>
    </tr>
  )
}

function TotalRow({
  label,
  byMonth,
  total,
  months,
  showMonthCols,
  tone,
  currency,
  fmt,
}: {
  label: string
  byMonth: Record<string, Amt>
  total: Amt
  months: string[]
  showMonthCols: boolean
  tone: 'income' | 'expense' | 'net'
  currency: Currency
  fmt: (n: number) => string
}) {
  const totalVal = pick(total, currency)
  const color =
    tone === 'net'
      ? totalVal >= 0 ? 'text-emerald-700' : 'text-rose-700'
      : tone === 'income' ? 'text-emerald-700' : 'text-rose-700'
  const bg = tone === 'net' ? 'bg-blue-50/70 border-t-2 border-gray-300' : 'bg-gray-50/70'
  return (
    <tr className={`font-semibold ${bg}`}>
      <td className={`sticky left-0 z-10 px-4 py-2.5 ${bg} ${color}`}>{label}</td>
      {showMonthCols &&
        months.map((ym) => {
          const v = pick(byMonth[ym], currency)
          return (
            <td key={ym} className={`px-4 py-2.5 text-right tabular-nums ${color}`}>
              {v ? fmt(v) : '·'}
            </td>
          )
        })}
      <td className={`px-4 py-2.5 text-right tabular-nums ${color}`}>{fmt(totalVal)}</td>
    </tr>
  )
}
