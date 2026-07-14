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
import { PiggyBank, DollarSign, Percent, ArrowRight, Landmark, TrendingUp } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface SnapshotSummary {
  date: string
  totalNetWorth: number
  personalNetWorth: number
  corporateCash: number
}

interface PnLTotals {
  incomeTotal: number
  expenseTotal: number
  net: number
  savingsRate: number
}

const YEARS = [2024, 2025, 2026]
const MOVE_DATE = '2024-07-01'

function fmt(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}$${abs}`
}
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1_000_000).toFixed(2)}m`
  if (Math.abs(n) >= 1000) return `${n < 0 ? '-' : ''}$${(Math.abs(n) / 1000).toFixed(0)}k`
  return fmt(n)
}
function monthLabel(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
function taxYearLabel(startYear: number): string {
  return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`
}

export default function HomePage() {
  const [snapshots, setSnapshots] = useState<SnapshotSummary[]>([])
  const [byYear, setByYear] = useState<Record<number, PnLTotals>>({})
  const [sinceMove, setSinceMove] = useState<PnLTotals | null>(null)
  const [ukDays, setUkDays] = useState<Record<string, number>>({})
  const [heroPos, setHeroPos] = useState('50% 50%')

  useEffect(() => {
    fetch('/api/couple-photo?meta=1&slot=hero')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => d.position && setHeroPos(d.position))
      .catch(() => {})

    fetch('/api/snapshots')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSnapshots(d.snapshots || []))
      .catch(() => {})

    const today = new Date().toISOString().slice(0, 10)
    Promise.all(
      YEARS.map((y) =>
        fetch(`/api/pnl?from=${y}-01-01&to=${y}-12-31`)
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((d) => [y, d.totals as PnLTotals] as const)
          .catch(() => [y, null] as const),
      ),
    ).then((entries) => {
      const map: Record<number, PnLTotals> = {}
      for (const [y, t] of entries) if (t) map[y] = t
      setByYear(map)
    })

    fetch(`/api/pnl?from=${MOVE_DATE}&to=${today}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setSinceMove(d.totals))
      .catch(() => {})

    fetch('/api/tax')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setUkDays(d.tracker?.ukDays || {}))
      .catch(() => {})
  }, [])

  const latest = snapshots[0]
  const previous = snapshots[1]
  const nwChange =
    latest && previous && previous.totalNetWorth !== 0
      ? ((latest.totalNetWorth - previous.totalNetWorth) / Math.abs(previous.totalNetWorth)) * 100
      : undefined

  const history = useMemo(
    () => [...snapshots].reverse().map((s) => ({ month: monthLabel(s.date), value: Math.round(s.totalNetWorth) })),
    [snapshots],
  )

  // Totals across all tracked years.
  const totals = useMemo(() => {
    const inc = Object.values(byYear).reduce((s, t) => s + t.incomeTotal, 0)
    const exp = Object.values(byYear).reduce((s, t) => s + t.expenseTotal, 0)
    return { inc, exp, net: inc - exp, rate: inc > 0 ? ((inc - exp) / inc) * 100 : 0 }
  }, [byYear])

  const thisYear = new Date().getFullYear()
  const cur = byYear[thisYear]
  const spendPctOfIncome = cur && cur.incomeTotal > 0 ? (cur.expenseTotal / cur.incomeTotal) * 100 : null

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
            <div
              className="absolute inset-0 bg-cover opacity-60"
              style={{ backgroundImage: "url('/api/couple-photo?slot=hero')", backgroundPosition: heroPos }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/40 to-transparent" />
            <div className="relative flex flex-col justify-end px-6 py-10 sm:px-10 sm:py-14">
              <p className="text-sm font-medium text-blue-100">{greeting}, Anjan &amp; Kate</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-white sm:text-3xl">
                {latest ? fmt(latest.totalNetWorth) : 'Your money at a glance'}
              </h1>
              <p className="mt-1 text-sm text-white/80">
                {latest
                  ? `Net worth${nwChange !== undefined ? ` · ${nwChange >= 0 ? '+' : ''}${nwChange.toFixed(1)}% vs last snapshot` : ''}`
                  : 'Save a snapshot on the Balance Sheet to get started'}
              </p>
            </div>
          </div>
        </div>

        {/* Headline stats */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Net Worth"
            value={latest ? fmt(latest.totalNetWorth) : '—'}
            change={nwChange}
            subtitle={latest ? `Personal ${fmtCompact(latest.personalNetWorth)} · Corp ${fmtCompact(latest.corporateCash)}` : 'No snapshot yet'}
            icon={<PiggyBank className="h-5 w-5 text-blue-500" />}
          />
          <Card
            title="Income since UAE move"
            value={sinceMove ? fmt(sinceMove.incomeTotal) : '—'}
            subtitle="since July 2024"
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
          />
          <Card
            title="Total Savings Rate"
            value={`${totals.rate.toFixed(1)}%`}
            subtitle={`Saved ${fmtCompact(totals.net)} of ${fmtCompact(totals.inc)}`}
            icon={<Percent className="h-5 w-5 text-purple-500" />}
          />
          <Card
            title={`${thisYear} Spend vs Income`}
            value={spendPctOfIncome !== null ? `${spendPctOfIncome.toFixed(0)}%` : '—'}
            subtitle={cur ? `${fmt(cur.expenseTotal)} of ${fmt(cur.incomeTotal)}` : 'no data yet'}
            icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
          />
        </div>

        {/* By year */}
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">By year</h2>
            <p className="text-xs text-gray-400">Income, spending and savings each calendar year (USD). UK days are for the tax year starting that year.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Year</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Income</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Expenses</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Savings</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Savings rate</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">UK days</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {YEARS.map((y) => {
                  const t = byYear[y]
                  const days = ukDays[taxYearLabel(y)]
                  return (
                    <tr key={y} className={y === thisYear ? 'bg-blue-50/30' : undefined}>
                      <td className="px-6 py-3 font-medium text-gray-900">
                        {y}
                        {y === thisYear && <span className="ml-2 text-xs text-blue-500">current</span>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-emerald-700">{t ? fmt(t.incomeTotal) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-rose-600">{t ? fmt(t.expenseTotal) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">{t ? fmt(t.net) : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-600">{t ? `${t.savingsRate.toFixed(0)}%` : '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-400">
                        {days != null ? days : <Link href="/tax" className="text-blue-500 hover:underline">add</Link>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {Object.keys(byYear).length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold text-gray-900">
                    <td className="px-6 py-3">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.inc)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.exp)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.net)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{totals.rate.toFixed(0)}%</td>
                    <td className="px-4 py-3" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Net worth progression */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Net Worth Progression</h2>
              <Link href="/networth" className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700">
                Balance Sheet <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {history.length >= 2 ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={history} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v: number) => fmtCompact(v)} tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                  <Tooltip formatter={(value) => fmt(Number(value))} />
                  <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2.5} dot={{ fill: '#3B82F6', r: 3, strokeWidth: 2, stroke: '#fff' }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">
                Save at least two net worth snapshots to see your progression.
              </div>
            )}
          </div>

          {/* Tax watch */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Landmark className="h-4 w-4 text-rose-500" />
                <h2 className="text-base font-semibold text-gray-900">Tax watch</h2>
              </div>
              <Link href="/tax" className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700">
                Open <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="space-y-2.5 text-sm text-gray-700">
              <li className="flex gap-2"><span className="text-rose-500">•</span> Stay non-UK-resident until ~July 2029 (5-year rule).</li>
              <li className="flex gap-2"><span className="text-rose-500">•</span> Keep UK days under 91 per tax year (≤30 working).</li>
              <li className="flex gap-2"><span className="text-rose-500">•</span> UK dividends taken abroad are taxable if you return before then.</li>
              <li className="flex gap-2"><span className="text-rose-500">•</span> Time any UK/Dubai company sale for after you’re safely non-resident.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
