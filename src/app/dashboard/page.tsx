'use client'

import React, { useState, useEffect } from 'react'
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
import { DollarSign, TrendingDown, PiggyBank, Percent, BarChart3 } from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryTotal {
  name: string
  color: string
  amount: number
}

interface Summary {
  year: number
  month: number
  current: {
    income: number
    spending: number
    net: number
    savingsRate: number
    byCategory: CategoryTotal[]
    byIncome: CategoryTotal[]
  }
  change: { income?: number; spending?: number }
  trend: { month: number; income: number; expense: number }[]
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const YEARS = [2024, 2025, 2026]

function fmtUsd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

// ---------------------------------------------------------------------------
// Trend tooltip
// ---------------------------------------------------------------------------

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; dataKey: string; color: string }>
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
      <p className="mb-1 text-sm font-semibold text-gray-900">{label}</p>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-sm">
          <span className="flex items-center gap-1.5 capitalize text-gray-600">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
            {entry.dataKey}
          </span>
          <span className="font-medium text-gray-900">{fmtUsd(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category table
// ---------------------------------------------------------------------------

function CategoryTable({ title, rows }: { title: string; rows: CategoryTotal[] }) {
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-gray-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-400">No data for this month.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.name} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} />
                <span className="text-sm text-gray-700">{row.name}</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-gray-900">{fmtUsd(row.amount)}</span>
                <span className="w-12 text-right text-xs text-gray-400">
                  {total > 0 ? `${((row.amount / total) * 100).toFixed(1)}%` : '0%'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth()) // 0-11
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [summary, setSummary] = useState<Summary | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const params = new URLSearchParams({
      year: String(selectedYear),
      month: String(selectedMonth + 1),
    })

    fetch(`/api/summary?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setSummary(data)
      })
      .catch(() => {
        if (!cancelled) setSummary(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedMonth, selectedYear])

  const c = summary?.current
  const trendData = (summary?.trend ?? []).map((t) => ({
    month: MONTH_ABBR[t.month - 1],
    income: t.income,
    expense: t.expense,
  }))

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">Profit &amp; Loss Overview</p>
        </div>

        {/* Filters */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          {isLoading && <span className="animate-pulse text-xs text-blue-500">Loading…</span>}
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Total Income"
            value={fmtUsd(c?.income ?? 0)}
            change={summary?.change.income}
            subtitle="vs last month"
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
          />
          <Card
            title="Total Spending"
            value={fmtUsd(c?.spending ?? 0)}
            change={summary?.change.spending}
            subtitle="vs last month"
            icon={<TrendingDown className="h-5 w-5 text-red-500" />}
          />
          <Card
            title="Net Savings"
            value={fmtUsd(c?.net ?? 0)}
            subtitle="income minus spending"
            icon={<PiggyBank className="h-5 w-5 text-blue-500" />}
          />
          <Card
            title="Savings Rate"
            value={`${(c?.savingsRate ?? 0).toFixed(1)}%`}
            subtitle="of total income"
            icon={<Percent className="h-5 w-5 text-purple-500" />}
          />
        </div>

        {/* Income vs Expense trend */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">
              Income vs Spending — {selectedYear}
            </h2>
          </div>

          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={trendData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 13, fill: '#6B7280' }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: '#6B7280' }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16 }} />
              <Bar dataKey="income" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="expense" fill="#EF4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Category breakdowns */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CategoryTable title="Spending by Category" rows={c?.byCategory ?? []} />
          <CategoryTable title="Income by Source" rows={c?.byIncome ?? []} />
        </div>
      </div>
    </div>
  )
}
