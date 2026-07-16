'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, Percent, Banknote, ArrowRight } from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types — positions are derived from the Net Worth balance sheet.
// ---------------------------------------------------------------------------

interface Position {
  id: string
  name: string
  accountName: string | null
  assetClass: string
  currency: string
  balanceLocal: number | null
  currentValueUsd: number
  annualCashflowUsd: number
  yieldPct: number | null
  snapshotDate: string | null
}

const ASSET_CLASS_COLORS: Record<string, string> = {
  Equities: '#10B981',
  'Private Equity': '#8B5CF6',
  'Private Debt': '#F59E0B',
  Crypto: '#EC4899',
  Cash: '#3B82F6',
}

function fmt(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString('en-US')
  return `${n < 0 ? '-' : ''}$${abs}`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvestingPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/investments')
      const data = await res.json()
      setPositions(data.investments || [])
    } catch {
      setPositions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    const value = positions.reduce((s, p) => s + p.currentValueUsd, 0)
    const cashflow = positions.reduce((s, p) => s + p.annualCashflowUsd, 0)
    return {
      value,
      cashflow,
      yieldPct: value > 0 ? (cashflow / value) * 100 : null,
      count: positions.length,
    }
  }, [positions])

  const lastUpdated = useMemo(() => {
    const dates = positions.map((p) => p.snapshotDate).filter(Boolean) as string[]
    if (!dates.length) return null
    return dates.sort().slice(-1)[0]
  }, [positions])

  const allocation = useMemo(() => {
    const byClass: Record<string, number> = {}
    for (const p of positions) {
      byClass[p.assetClass] = (byClass[p.assetClass] || 0) + p.currentValueUsd
    }
    return Object.entries(byClass)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        color: ASSET_CLASS_COLORS[name] || '#94A3B8',
      }))
  }, [positions])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Portfolio</h1>
            <p className="mt-1 text-sm text-gray-500">
              Your investable assets, straight from the Net Worth balance sheet
              {lastUpdated ? ` · updated ${fmtDate(lastUpdated)}` : ''}
            </p>
          </div>
          <Link
            href="/networth"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Update on Balance Sheet
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Portfolio Value"
            value={fmt(totals.value)}
            subtitle={`${totals.count} holding${totals.count === 1 ? '' : 's'}`}
            icon={<DollarSign className="h-5 w-5" />}
          />
          <Card
            title="Annual Cash Flow"
            value={fmt(totals.cashflow)}
            subtitle="dividends, interest & distributions"
            icon={<Banknote className="h-5 w-5" />}
          />
          <Card
            title="Portfolio Yield"
            value={totals.yieldPct !== null ? `${totals.yieldPct.toFixed(2)}%` : '—'}
            subtitle="cash flow / current value"
            icon={<Percent className="h-5 w-5" />}
          />
          <Card
            title="Largest Class"
            value={allocation[0]?.name ?? '—'}
            subtitle={allocation[0] ? fmt(allocation[0].value) : 'no holdings yet'}
            icon={<TrendingUp className="h-5 w-5" />}
          />
        </div>

        {/* Positions table */}
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Holdings</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Account</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Class</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Current Value</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Annual Cash Flow</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Yield %</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">% of Portfolio</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : positions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                      No investable holdings yet — add equities, crypto or private assets on the{' '}
                      <Link href="/networth" className="text-blue-600 hover:underline">
                        Net Worth balance sheet
                      </Link>
                      .
                    </td>
                  </tr>
                ) : (
                  positions.map((p) => {
                    const share = totals.value > 0 ? (p.currentValueUsd / totals.value) * 100 : 0
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50">
                        <td className="whitespace-nowrap px-4 py-3">
                          <span className="font-medium text-gray-900">{p.name}</span>
                          {p.accountName && (
                            <span className="ml-2 text-xs text-gray-400">{p.accountName}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${ASSET_CLASS_COLORS[p.assetClass] || '#94A3B8'}18`,
                              color: ASSET_CLASS_COLORS[p.assetClass] || '#64748B',
                            }}
                          >
                            {p.assetClass}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {fmt(p.currentValueUsd)}
                          {p.balanceLocal != null && p.currency !== 'USD' && (
                            <span className="ml-1 text-xs text-gray-400">
                              {Number(p.balanceLocal).toLocaleString('en-US')} {p.currency}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {p.annualCashflowUsd > 0 ? fmt(p.annualCashflowUsd) : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {p.yieldPct !== null && p.yieldPct > 0 ? `${p.yieldPct.toFixed(2)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                          {share.toFixed(1)}%
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
              {positions.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold text-gray-900">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.value)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.cashflow)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totals.yieldPct !== null ? `${totals.yieldPct.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Allocation */}
        {allocation.length > 0 && (
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:w-1/2">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Allocation by Asset Class</h2>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={allocation}
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  innerRadius={45}
                  dataKey="value"
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {allocation.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => fmt(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {allocation.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                  {d.name}: {fmt(d.value)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
