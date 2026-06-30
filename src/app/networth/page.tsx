'use client'

import React, { useState } from 'react'
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  TrendingUp,
  Wallet,
  Lock,
  CreditCard,
  Edit3,
  Save,
  X,
  DollarSign,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Account {
  account: string
  holder: 'Anjan' | 'Kate' | 'Joint'
  country: string
  assetClass: 'Cash' | 'Equities' | 'Debt'
  liquidity: 'T1' | 'T2' | 'T2.5' | 'T3'
  currency: string
  localBalance: number
  usdValue: number
  yield: number
  annualCashFlow: number
}

interface AllocationSlice {
  name: string
  value: number
  pct: string
  color: string
}

interface NetWorthSnapshot {
  month: string
  value: number
}

interface LiquidityTier {
  tier: string
  label: string
  value: number
  color: string
}

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const initialAccounts: Account[] = [
  {
    account: 'FAB Current Account',
    holder: 'Joint',
    country: 'AE',
    assetClass: 'Cash',
    liquidity: 'T1',
    currency: 'AED',
    localBalance: 85000,
    usdValue: 23139,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'FAB iSavings',
    holder: 'Joint',
    country: 'AE',
    assetClass: 'Cash',
    liquidity: 'T2',
    currency: 'AED',
    localBalance: 120000,
    usdValue: 32668,
    yield: 4.5,
    annualCashFlow: 1470,
  },
  {
    account: 'Wio Personal (Anjan)',
    holder: 'Anjan',
    country: 'AE',
    assetClass: 'Cash',
    liquidity: 'T1',
    currency: 'AED',
    localBalance: 15000,
    usdValue: 4084,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'Wio Personal (Kate)',
    holder: 'Kate',
    country: 'AE',
    assetClass: 'Cash',
    liquidity: 'T1',
    currency: 'AED',
    localBalance: 8500,
    usdValue: 2314,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'Barclaycard Credit Card',
    holder: 'Anjan',
    country: 'GB',
    assetClass: 'Debt',
    liquidity: 'T1',
    currency: 'GBP',
    localBalance: -2418,
    usdValue: -3199,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'Monzo Joint',
    holder: 'Joint',
    country: 'GB',
    assetClass: 'Cash',
    liquidity: 'T1',
    currency: 'GBP',
    localBalance: 4200,
    usdValue: 5557,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'Revolut',
    holder: 'Anjan',
    country: 'GB',
    assetClass: 'Cash',
    liquidity: 'T1',
    currency: 'GBP',
    localBalance: 2800,
    usdValue: 3705,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'Santander/NS&I',
    holder: 'Anjan',
    country: 'GB',
    assetClass: 'Cash',
    liquidity: 'T2',
    currency: 'GBP',
    localBalance: 22000,
    usdValue: 29108,
    yield: 3.25,
    annualCashFlow: 946,
  },
  {
    account: 'HSBC Jersey',
    holder: 'Joint',
    country: 'JE',
    assetClass: 'Cash',
    liquidity: 'T2',
    currency: 'USD',
    localBalance: 45000,
    usdValue: 45000,
    yield: 4.85,
    annualCashFlow: 2183,
  },
  {
    account: 'IBKR',
    holder: 'Joint',
    country: 'US',
    assetClass: 'Equities',
    liquidity: 'T2',
    currency: 'USD',
    localBalance: 185400,
    usdValue: 185400,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'Hargreaves S&P Pension',
    holder: 'Anjan',
    country: 'GB',
    assetClass: 'Equities',
    liquidity: 'T3',
    currency: 'GBP',
    localBalance: 52000,
    usdValue: 68801,
    yield: 0,
    annualCashFlow: 0,
  },
  {
    account: 'Hargreaves Schroder Pension',
    holder: 'Anjan',
    country: 'GB',
    assetClass: 'Equities',
    liquidity: 'T3',
    currency: 'GBP',
    localBalance: 23500,
    usdValue: 31093,
    yield: 0,
    annualCashFlow: 0,
  },
]

const allocationData: AllocationSlice[] = [
  { name: 'Cash', value: 98500, pct: '20.2%', color: '#3B82F6' },
  { name: 'Equities', value: 285400, pct: '58.6%', color: '#10B981' },
  { name: 'Private Equity', value: 45000, pct: '9.2%', color: '#8B5CF6' },
  { name: 'Private Debt', value: 25000, pct: '5.1%', color: '#F59E0B' },
  { name: 'Crypto', value: 18350, pct: '3.8%', color: '#EC4899' },
  { name: 'Car', value: 35000, pct: '7.2%', color: '#6366F1' },
  { name: 'Debt', value: 3200, pct: '-0.7%', color: '#EF4444' },
]

const netWorthHistory: NetWorthSnapshot[] = [
  { month: 'Jul 2023', value: 410000 },
  { month: 'Aug 2023', value: 415500 },
  { month: 'Sep 2023', value: 408200 },
  { month: 'Oct 2023', value: 420800 },
  { month: 'Nov 2023', value: 435100 },
  { month: 'Dec 2023', value: 442000 },
  { month: 'Jan 2024', value: 448500 },
  { month: 'Feb 2024', value: 455200 },
  { month: 'Mar 2024', value: 462800 },
  { month: 'Apr 2024', value: 470100 },
  { month: 'May 2024', value: 478900 },
  { month: 'Jun 2024', value: 487250 },
]

const liquidityData: LiquidityTier[] = [
  { tier: 'T1', label: 'T1 Instant', value: 38799, color: '#22C55E' },
  { tier: 'T2', label: 'T2 Days', value: 292176, color: '#F59E0B' },
  { tier: 'T2.5', label: 'T2.5 Locked', value: 0, color: '#F97316' },
  { tier: 'T3', label: 'T3 Locked Years', value: 99894, color: '#EF4444' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number): string {
  if (n < 0) return `-$${Math.abs(n).toLocaleString('en-US')}`
  return `$${n.toLocaleString('en-US')}`
}

function fmtLocal(n: number, currency: string): string {
  const abs = Math.abs(n).toLocaleString('en-US')
  const sign = n < 0 ? '-' : ''
  return `${sign}${currency} ${abs}`
}

function fmtCompact(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}k`
  return `$${n.toLocaleString('en-US')}`
}

const COUNTRY_FLAGS: Record<string, string> = {
  AE: '\u{1F1E6}\u{1F1EA}',
  GB: '\u{1F1EC}\u{1F1E7}',
  US: '\u{1F1FA}\u{1F1F8}',
  JE: '\u{1F1EF}\u{1F1EA}',
}

const HOLDER_STYLES: Record<string, string> = {
  Anjan:
    'bg-blue-50 text-blue-700 border border-blue-200',
  Kate: 'bg-pink-50 text-pink-700 border border-pink-200',
  Joint:
    'bg-purple-50 text-purple-700 border border-purple-200',
}

const ASSET_CLASS_STYLES: Record<string, string> = {
  Cash: 'text-blue-600',
  Equities: 'text-emerald-600',
  Debt: 'text-red-600',
}

const LIQUIDITY_STYLES: Record<string, string> = {
  T1: 'bg-green-50 text-green-700 border border-green-200',
  T2: 'bg-amber-50 text-amber-700 border border-amber-200',
  'T2.5': 'bg-orange-50 text-orange-700 border border-orange-200',
  T3: 'bg-red-50 text-red-700 border border-red-200',
}

// ---------------------------------------------------------------------------
// Custom Recharts Tooltips
// ---------------------------------------------------------------------------

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number; payload: AllocationSlice }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-sm font-semibold text-gray-900">{d.name}</p>
      <p className="text-sm text-gray-600">
        {fmt(d.value)} &middot; {d.payload.pct}
      </p>
    </div>
  )
}

function LineTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{fmt(payload[0].value)}</p>
    </div>
  )
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-lg">
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{fmt(payload[0].value)}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Custom Pie Label
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderPieLabel(props: any) {
  const { cx, cy, midAngle, outerRadius, name, pct } = props as {
    cx: number; cy: number; midAngle: number; outerRadius: number; name: string; pct: string
  }

  const RADIAN = Math.PI / 180
  const radius = outerRadius + 28
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? 'start' : 'end'}
      dominantBaseline="central"
      className="text-xs"
    >
      {name} ({pct})
    </text>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NetWorthPage() {
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts)
  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})

  // ---- Computed totals ----
  const totalNetWorth = accounts.reduce((s, a) => s + a.usdValue, 0)
  const liquidAssets = accounts
    .filter((a) => a.liquidity === 'T1' || a.liquidity === 'T2')
    .reduce((s, a) => s + a.usdValue, 0)
  const lockedAssets = accounts
    .filter((a) => a.liquidity === 'T2.5' || a.liquidity === 'T3')
    .reduce((s, a) => s + a.usdValue, 0)
  const totalDebt = accounts
    .filter((a) => a.assetClass === 'Debt')
    .reduce((s, a) => s + a.usdValue, 0)
  const totalYield = accounts.reduce((s, a) => s + a.annualCashFlow, 0)
  const totalLocalBalance = accounts.reduce((s, a) => s + a.localBalance, 0)

  // ---- Edit handlers ----
  function startEditing() {
    const vals: Record<string, string> = {}
    accounts.forEach((a, i) => {
      vals[i] = a.localBalance.toString()
    })
    setEditValues(vals)
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setEditValues({})
  }

  function saveEdits() {
    setAccounts((prev) =>
      prev.map((a, i) => {
        const raw = editValues[i]
        if (raw === undefined) return a
        const parsed = parseFloat(raw)
        if (isNaN(parsed)) return a
        // In a real app, we'd re-compute usdValue from the new local balance and the FX rate.
        // For the mock, we approximate by scaling the existing ratio.
        const ratio = a.localBalance !== 0 ? a.usdValue / a.localBalance : 1
        return {
          ...a,
          localBalance: parsed,
          usdValue: Math.round(parsed * ratio),
        }
      })
    )
    setIsEditing(false)
    setEditValues({})
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ---------------------------------------------------------------- */}
        {/* Page Header                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Net Worth
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Balance Sheet &amp; Asset Tracker
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Summary Cards                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Total Net Worth"
            value={fmt(totalNetWorth)}
            change={2.3}
            subtitle="vs last month"
            icon={<DollarSign className="h-5 w-5" />}
          />
          <Card
            title="Liquid Assets (T1+T2)"
            value={fmt(liquidAssets)}
            subtitle="Instant + short-term"
            icon={<Wallet className="h-5 w-5" />}
          />
          <Card
            title="Locked Assets (T2.5+T3)"
            value={fmt(lockedAssets)}
            subtitle="Pensions & locked"
            icon={<Lock className="h-5 w-5" />}
          />
          <Card
            title="Total Debt"
            value={fmt(totalDebt)}
            subtitle="Credit card balance"
            icon={<CreditCard className="h-5 w-5" />}
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Asset Allocation Pie + Liquidity Bar  (2-col)                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Pie Chart */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Asset Allocation
            </h2>
            <ResponsiveContainer width="100%" height={340}>
              <PieChart>
                <Pie
                  data={allocationData}
                  cx="50%"
                  cy="50%"
                  outerRadius={110}
                  innerRadius={55}
                  dataKey="value"
                  label={renderPieLabel}
                  labelLine={false}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {allocationData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Legend */}
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {allocationData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  {d.name}: {d.pct}
                </div>
              ))}
            </div>
          </div>

          {/* Liquidity Breakdown Bar */}
          <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Liquidity Breakdown
            </h2>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart
                data={liquidityData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(v: number) => fmtCompact(v)}
                  tick={{ fontSize: 12, fill: '#6B7280' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#374151' }}
                  axisLine={false}
                  tickLine={false}
                  width={120}
                />
                <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={32}>
                  {liquidityData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {/* Tier summary cards */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              {liquidityData.map((d) => (
                <div
                  key={d.tier}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <p className="text-xs font-medium text-gray-500">{d.label}</p>
                  <p className="text-sm font-semibold text-gray-900">{fmt(d.value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Account Table                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Account Balances
            </h2>
            <div className="flex items-center gap-2">
              {isEditing ? (
                <>
                  <button
                    onClick={saveEdits}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Save
                  </button>
                  <button
                    onClick={cancelEditing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Update Balances
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Account
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Holder
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">
                    Country
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-500">
                    Asset Class
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">
                    Liquidity
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">
                    Currency
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">
                    Local Balance
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">
                    USD Value
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">
                    Yield %
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">
                    Annual Cash Flow
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((a, i) => (
                  <tr
                    key={a.account}
                    className="transition-colors hover:bg-gray-50/50"
                  >
                    {/* Account Name */}
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      {a.account}
                    </td>

                    {/* Holder Badge */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${HOLDER_STYLES[a.holder]}`}
                      >
                        {a.holder}
                      </span>
                    </td>

                    {/* Country */}
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm" title={a.country}>
                        {COUNTRY_FLAGS[a.country] || a.country}{' '}
                        <span className="text-xs text-gray-400">
                          {a.country}
                        </span>
                      </span>
                    </td>

                    {/* Asset Class */}
                    <td
                      className={`px-4 py-3 font-medium ${ASSET_CLASS_STYLES[a.assetClass]}`}
                    >
                      {a.assetClass}
                    </td>

                    {/* Liquidity Tier */}
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LIQUIDITY_STYLES[a.liquidity]}`}
                      >
                        {a.liquidity}
                      </span>
                    </td>

                    {/* Currency */}
                    <td className="px-4 py-3 text-center text-gray-500">
                      {a.currency}
                    </td>

                    {/* Local Balance (editable) */}
                    <td className="px-4 py-3 text-right tabular-nums">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editValues[i] ?? a.localBalance.toString()}
                          onChange={(e) =>
                            setEditValues((prev) => ({
                              ...prev,
                              [i]: e.target.value,
                            }))
                          }
                          className="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      ) : (
                        <span
                          className={
                            a.localBalance < 0
                              ? 'text-red-600'
                              : 'text-gray-900'
                          }
                        >
                          {fmtLocal(a.localBalance, a.currency)}
                        </span>
                      )}
                    </td>

                    {/* USD Value */}
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        a.usdValue < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {fmt(a.usdValue)}
                    </td>

                    {/* Yield */}
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {a.yield > 0 ? `${a.yield.toFixed(2)}%` : '—'}
                    </td>

                    {/* Annual Cash Flow */}
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {a.annualCashFlow > 0 ? fmt(a.annualCashFlow) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Totals Row */}
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-50/80">
                  <td className="px-4 py-3 font-bold text-gray-900">
                    Total
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                    &mdash;
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                    {fmt(totalNetWorth)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-600">
                    &mdash;
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                    {fmt(totalYield)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Net Worth History Line Chart                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-gray-900">
            Net Worth History
          </h2>
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={netWorthHistory}
              margin={{ top: 5, right: 20, left: 20, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => fmtCompact(v)}
                tick={{ fontSize: 12, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
                domain={['auto', 'auto']}
              />
              <Tooltip content={<LineTooltip />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="#3B82F6"
                strokeWidth={2.5}
                dot={{ fill: '#3B82F6', r: 4, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
