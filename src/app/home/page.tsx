'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import {
  PiggyBank,
  DollarSign,
  TrendingDown,
  Percent,
  ArrowRight,
  Wallet,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SnapshotSummary {
  date: string
  totalNetWorth: number
  personalNetWorth: number
  corporateCash: number
}

interface CategoryTotal {
  name: string
  color: string
  amount: number
}

interface Summary {
  current: {
    income: number
    spending: number
    net: number
    savingsRate: number
    byCategory: CategoryTotal[]
  }
  change: { income?: number; spending?: number }
}

function fmt(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}$${abs}`
}

function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}m`
  if (Math.abs(n) >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return fmt(n)
}

function monthLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)

  useEffect(() => {
    fetch('/api/snapshots')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSnapshots(d.snapshots || []))
      .catch(() => {})

    const now = new Date()
    fetch(`/api/summary?year=${now.getFullYear()}&month=${now.getMonth() + 1}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSummary(d))
      .catch(() => {})
  }, [])

  const latest = snapshots[0]
  const previous = snapshots[1]
  const nwChange =
    latest && previous && previous.totalNetWorth !== 0
      ? ((latest.totalNetWorth - previous.totalNetWorth) / Math.abs(previous.totalNetWorth)) * 100
      : undefined

  const history = useMemo(
    () =>
      [...snapshots].reverse().map((s) => ({
        month: monthLabel(s.date),
        value: Math.round(s.totalNetWorth),
      })),
    [snapshots],
  )

  const topSpending = summary?.current.byCategory.slice(0, 5) ?? []
  const monthName = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  })()

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {/* Hero */}
        <div className="mb-8 overflow-hidden rounded-2xl bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 shadow-sm">
          <div className="relative">
            {/* Photo (falls back to the gradient if the file isn't present) */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-60"
              style={{ backgroundImage: "url('/api/couple-photo?slot=hero')" }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-transparent" />
            <div className="relative flex flex-col justify-end px-6 py-10 sm:px-10 sm:py-14">
              <p className="text-sm font-medium text-blue-100">{greeting}, Anjan &amp; Kate</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {latest ? fmt(latest.totalNetWorth) : 'Your money at a glance'}
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {latest
                  ? `Total net worth${nwChange !== undefined ? ` · ${nwChange >= 0 ? '+' : ''}${nwChange.toFixed(1)}% vs last snapshot` : ''} — ${monthName}`
                  : `Here's where things stand — ${monthName}`}
              </p>
            </div>
          </div>
        </div>

        {/* Key stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Net Worth"
            value={latest ? fmt(latest.totalNetWorth) : '—'}
            change={nwChange}
            subtitle={
              latest
                ? `Personal ${fmtCompact(latest.personalNetWorth)} · Corp ${fmtCompact(latest.corporateCash)}`
                : 'Save a snapshot on the Net Worth page'
            }
            icon={<PiggyBank className="h-5 w-5 text-blue-500" />}
          />
          <Card
            title="Income This Month"
            value={fmt(summary?.current.income ?? 0)}
            change={summary?.change.income}
            subtitle="vs last month"
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
          />
          <Card
            title="Spending This Month"
            value={fmt(summary?.current.spending ?? 0)}
            change={summary?.change.spending}
            subtitle="vs last month"
            icon={<TrendingDown className="h-5 w-5 text-red-500" />}
          />
          <Card
            title="Savings Rate"
            value={`${(summary?.current.savingsRate ?? 0).toFixed(1)}%`}
            subtitle={`Net ${fmt(summary?.current.net ?? 0)} this month`}
            icon={<Percent className="h-5 w-5 text-purple-500" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Net worth trend */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Net Worth Trend</h2>
              <Link
                href="/networth"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Open Net Worth <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {history.length >= 2 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={history} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v: number) => fmtCompact(v)}
                    tick={{ fontSize: 12, fill: '#6B7280' }}
                    axisLine={false}
                    tickLine={false}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip formatter={(value) => fmt(Number(value))} />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#3B82F6"
                    strokeWidth={2.5}
                    dot={{ fill: '#3B82F6', r: 3, strokeWidth: 2, stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">
                Save at least two net worth snapshots to see your trend.
              </div>
            )}
          </div>

          {/* Top spending this month */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Top Spending</h2>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Cash Flow <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {topSpending.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
                <Wallet className="h-6 w-6 text-gray-300" />
                <p className="text-sm text-gray-400">
                  No transactions this month yet —{' '}
                  <Link href="/import" className="text-blue-600 hover:underline">
                    import a statement
                  </Link>
                  .
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {topSpending.map((row) => (
                  <div key={row.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="text-sm text-gray-700">{row.name}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{fmt(row.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            { href: '/import', label: 'Import a statement' },
            { href: '/networth', label: 'Update balances' },
            { href: '/annual', label: 'Plan the year' },
            { href: '/investing', label: 'Review investments' },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/40 hover:text-blue-700"
            >
              {l.label}
              <ArrowRight className="h-4 w-4 text-gray-300" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
