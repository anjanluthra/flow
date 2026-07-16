'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { DollarSign, TrendingDown, PiggyBank, Percent, Save, Calendar } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonthRow {
  month: number
  actualIncome: number
  actualExpense: number
  hasActuals: boolean
  forecastIncome: number | null
  forecastExpense: number | null
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const YEARS = [2024, 2025, 2026, 2027]

function fmtUsd(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}$${abs}`
}

interface Edit {
  income: string
  expense: string
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AnnualPage() {
  const now = new Date()
  const [year, setYear] = useState<number>(now.getFullYear())
  const [months, setMonths] = useState<MonthRow[]>([])
  const [edits, setEdits] = useState<Record<number, Edit>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')

  const loadForecast = useCallback(async () => {
    setIsLoading(true)
    const params = new URLSearchParams({ year: String(year) })
    try {
      const res = await fetch(`/api/forecast?${params.toString()}`)
      const data = await res.json()
      const rows: MonthRow[] = data.months || []
      setMonths(rows)

      // Seed forecast inputs: use saved forecasts, else the average of months
      // that already have actuals — a sensible starting projection to tweak.
      const actualMonths = rows.filter((r) => r.hasActuals)
      const avgIncome =
        actualMonths.length > 0
          ? Math.round(actualMonths.reduce((s, r) => s + r.actualIncome, 0) / actualMonths.length)
          : 0
      const avgExpense =
        actualMonths.length > 0
          ? Math.round(actualMonths.reduce((s, r) => s + r.actualExpense, 0) / actualMonths.length)
          : 0

      const seeded: Record<number, Edit> = {}
      for (const r of rows) {
        seeded[r.month] = {
          income: String(r.forecastIncome ?? avgIncome),
          expense: String(r.forecastExpense ?? avgExpense),
        }
      }
      setEdits(seeded)
    } catch {
      setMonths([])
    } finally {
      setIsLoading(false)
    }
  }, [year])

  useEffect(() => {
    loadForecast()
  }, [loadForecast])

  const num = (v: string | undefined) => {
    const n = parseFloat(v ?? '')
    return isNaN(n) ? 0 : n
  }

  // Projected = actuals for elapsed months, forecast for the rest.
  const projected = useMemo(() => {
    let income = 0
    let expense = 0
    let actualIncome = 0
    let actualExpense = 0
    for (const r of months) {
      if (r.hasActuals) {
        income += r.actualIncome
        expense += r.actualExpense
        actualIncome += r.actualIncome
        actualExpense += r.actualExpense
      } else {
        income += num(edits[r.month]?.income)
        expense += num(edits[r.month]?.expense)
      }
    }
    const net = income - expense
    const savingsRate = income > 0 ? (net / income) * 100 : 0
    return { income, expense, net, savingsRate, actualIncome, actualExpense }
  }, [months, edits])

  const chartData = useMemo(
    () =>
      months.map((r) => ({
        month: MONTH_ABBR[r.month - 1],
        income: r.hasActuals ? r.actualIncome : num(edits[r.month]?.income),
        expense: r.hasActuals ? r.actualExpense : num(edits[r.month]?.expense),
        forecast: !r.hasActuals,
      })),
    [months, edits],
  )

  const handleSave = async () => {
    setIsSaving(true)
    setSaveStatus('idle')
    try {
      // Only persist forecast months (elapsed months are driven by actuals).
      const toSave = months.filter((r) => !r.hasActuals)
      const results = await Promise.all(
        toSave.map((r) =>
          fetch('/api/forecast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              year,
              month: r.month,
              forecastIncome: num(edits[r.month]?.income),
              forecastExpense: num(edits[r.month]?.expense),
            }),
          }).then((res) => res.ok),
        ),
      )
      const allOk = results.every(Boolean)
      setSaveStatus(allOk ? 'saved' : 'error')
      await loadForecast()
    } catch {
      setSaveStatus('error')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Annual &amp; Forecast</h1>
          <p className="mt-1 text-sm text-gray-500">
            Actuals for elapsed months + your forecast for the rest — full-year totals for planning.
          </p>
        </div>

        {/* Controls */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-400" />
            <Select
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
              ariaLabel="Year"
            />
          </div>

          <button
            onClick={handleSave}
            disabled={isSaving}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {isSaving ? 'Saving…' : 'Save Forecast'}
          </button>

          {saveStatus === 'saved' && !isSaving && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
          {saveStatus === 'error' && !isSaving && <span className="text-xs font-medium text-red-600">Couldn&rsquo;t save — try again</span>}
          {isLoading && <span className="animate-pulse text-xs text-blue-500">Loading…</span>}
        </div>

        {/* Projected full-year cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title={`${year} Income (proj.)`}
            value={fmtUsd(projected.income)}
            subtitle={`Actual ${fmtUsd(projected.actualIncome)} + forecast`}
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
          />
          <Card
            title={`${year} Spending (proj.)`}
            value={fmtUsd(projected.expense)}
            subtitle={`Actual ${fmtUsd(projected.actualExpense)} + forecast`}
            icon={<TrendingDown className="h-5 w-5 text-red-500" />}
          />
          <Card
            title={`${year} Net Savings (proj.)`}
            value={fmtUsd(projected.net)}
            subtitle="income minus spending"
            icon={<PiggyBank className="h-5 w-5 text-blue-500" />}
          />
          <Card
            title="Savings Rate (proj.)"
            value={`${projected.savingsRate.toFixed(1)}%`}
            subtitle="of projected income"
            icon={<Percent className="h-5 w-5 text-purple-500" />}
          />
        </div>

        {/* Chart */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Income vs Spending — {year}
            <span className="ml-2 text-sm font-normal text-gray-400">
              (faded months are forecast)
            </span>
          </h2>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#6B7280' }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: '#6B7280' }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(value) => fmtUsd(Number(value))}
                cursor={{ fill: 'rgba(0,0,0,0.04)' }}
              />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16 }} />
              <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Month-by-month table */}
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Month-by-Month</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Elapsed months show actuals (locked). Forecast months are editable — tweak them to plan
              vacations and one-off spend.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Month</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Source</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Income</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Spending</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {months.map((r) => {
                  const income = r.hasActuals ? r.actualIncome : num(edits[r.month]?.income)
                  const expense = r.hasActuals ? r.actualExpense : num(edits[r.month]?.expense)
                  const net = income - expense
                  return (
                    <tr key={r.month} className={r.hasActuals ? '' : 'bg-blue-50/30'}>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{MONTH_ABBR[r.month - 1]} {year}</td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            r.hasActuals ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}
                        >
                          {r.hasActuals ? 'Actual' : 'Forecast'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {r.hasActuals ? (
                          <span className="text-emerald-700">{fmtUsd(income)}</span>
                        ) : (
                          <input
                            type="text"
                            value={edits[r.month]?.income ?? ''}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.month]: { income: e.target.value, expense: prev[r.month]?.expense ?? '0' },
                              }))
                            }
                            className="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {r.hasActuals ? (
                          <span className="text-gray-900">{fmtUsd(expense)}</span>
                        ) : (
                          <input
                            type="text"
                            value={edits[r.month]?.expense ?? ''}
                            onChange={(e) =>
                              setEdits((prev) => ({
                                ...prev,
                                [r.month]: { income: prev[r.month]?.income ?? '0', expense: e.target.value },
                              }))
                            }
                            className="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium tabular-nums ${net < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {fmtUsd(net)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold text-gray-900">
                  <td className="px-4 py-3">{year} Total (proj.)</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(projected.income)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmtUsd(projected.expense)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${projected.net < 0 ? 'text-red-600' : ''}`}>
                    {fmtUsd(projected.net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
