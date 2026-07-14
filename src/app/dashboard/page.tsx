'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { DollarSign, TrendingDown, Wallet, Percent } from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Line {
  category: string
  color: string
  monthly: Record<string, number>
  total: number
}

interface PnL {
  from: string
  to: string
  months: string[]
  income: Line[]
  expense: Line[]
  totals: {
    incomeByMonth: Record<string, number>
    expenseByMonth: Record<string, number>
    netByMonth: Record<string, number>
    incomeTotal: number
    expenseTotal: number
    net: number
    savingsRate: number
  }
}

type Mode = 'year' | 'month' | 'custom'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const YEARS = [2024, 2025, 2026, 2027]

function fmt(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}$${abs}`
}

function monthHeader(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${String(y).slice(2)}`
}

function lastDay(year: number, month1: number): string {
  const d = new Date(Date.UTC(year, month1, 0)) // month1 is 1-12; day 0 -> last of prev
  return `${year}-${String(month1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CashFlowPage() {
  const now = new Date()
  const [mode, setMode] = useState<Mode>('year')
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth()) // 0-11
  const [customFrom, setCustomFrom] = useState(`${now.getFullYear()}-01-01`)
  const [customTo, setCustomTo] = useState(now.toISOString().slice(0, 10))
  const [pnl, setPnl] = useState<PnL | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const months = pnl?.months ?? []
  const showMonthCols = months.length > 1
  const t = pnl?.totals

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
          {/* Segmented mode toggle */}
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

          {isLoading && <span className="animate-pulse text-xs text-blue-500">Loading…</span>}
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Income" value={fmt(t?.incomeTotal ?? 0)} subtitle="for the period" icon={<DollarSign className="h-5 w-5 text-green-500" />} />
          <Card title="Expenses" value={fmt(t?.expenseTotal ?? 0)} subtitle="for the period" icon={<TrendingDown className="h-5 w-5 text-red-500" />} />
          <Card title="Net" value={fmt(t?.net ?? 0)} subtitle="income − expenses" icon={<Wallet className="h-5 w-5 text-blue-500" />} />
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
                    {/* Income */}
                    <SectionRow label="Income" span={months.length} showMonthCols={showMonthCols} tone="income" />
                    {pnl.income.map((l) => (
                      <LineRow key={`i-${l.category}`} line={l} months={months} showMonthCols={showMonthCols} />
                    ))}
                    <TotalRow label="Total Income" byMonth={t!.incomeByMonth} total={t!.incomeTotal} months={months} showMonthCols={showMonthCols} tone="income" />

                    {/* Expenses */}
                    <SectionRow label="Expenses" span={months.length} showMonthCols={showMonthCols} tone="expense" />
                    {pnl.expense.map((l) => (
                      <LineRow key={`e-${l.category}`} line={l} months={months} showMonthCols={showMonthCols} />
                    ))}
                    <TotalRow label="Total Expenses" byMonth={t!.expenseByMonth} total={t!.expenseTotal} months={months} showMonthCols={showMonthCols} tone="expense" />

                    {/* Net */}
                    <TotalRow label="Net Cash Flow" byMonth={t!.netByMonth} total={t!.net} months={months} showMonthCols={showMonthCols} tone="net" />
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          All figures in USD. Internal transfers and investments are excluded from the P&amp;L.
        </p>
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

function LineRow({ line, months, showMonthCols }: { line: Line; months: string[]; showMonthCols: boolean }) {
  return (
    <tr className="hover:bg-gray-50/50">
      <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
          <span className="text-gray-700">{line.category}</span>
        </div>
      </td>
      {showMonthCols &&
        months.map((ym) => (
          <td key={ym} className="px-4 py-2.5 text-right tabular-nums text-gray-500">
            {line.monthly[ym] ? fmt(line.monthly[ym]) : '·'}
          </td>
        ))}
      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">{fmt(line.total)}</td>
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
}: {
  label: string
  byMonth: Record<string, number>
  total: number
  months: string[]
  showMonthCols: boolean
  tone: 'income' | 'expense' | 'net'
}) {
  const color =
    tone === 'net'
      ? total >= 0 ? 'text-emerald-700' : 'text-rose-700'
      : tone === 'income' ? 'text-emerald-700' : 'text-rose-700'
  const bg = tone === 'net' ? 'bg-blue-50/70 border-t-2 border-gray-300' : 'bg-gray-50/70'
  return (
    <tr className={`font-semibold ${bg}`}>
      <td className={`sticky left-0 z-10 px-4 py-2.5 ${bg} ${color}`}>{label}</td>
      {showMonthCols &&
        months.map((ym) => (
          <td key={ym} className={`px-4 py-2.5 text-right tabular-nums ${color}`}>
            {byMonth[ym] ? fmt(byMonth[ym]) : '·'}
          </td>
        ))}
      <td className={`px-4 py-2.5 text-right tabular-nums ${color}`}>{fmt(total)}</td>
    </tr>
  )
}
