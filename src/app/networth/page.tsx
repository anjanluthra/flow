'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
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
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Account {
  accountId: string
  account: string
  holder: 'Anjan' | 'Kate' | 'Joint'
  country: string
  assetClass: 'Cash' | 'Equities' | 'Debt' | 'Private Equity' | 'Private Debt' | 'Crypto' | 'Car'
  liquidity: 'T1' | 'T2' | 'T2.5' | 'T3'
  currency: string
  localBalance: number
  usdValue: number
  yield: number
  annualCashFlow: number
  isCorporate: boolean
}

interface SnapshotSummary {
  date: string
  totalNetWorth: number
  personalNetWorth: number
  corporateCash: number
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
// Fallback data (from Net Worth Model 2026 spreadsheet)
// Used when database isn't connected or no snapshots exist yet
// ---------------------------------------------------------------------------

const FALLBACK_ACCOUNTS: Account[] = [
  { accountId: '', account: 'FAB iSavings Account', holder: 'Joint', country: 'AE', assetClass: 'Cash', liquidity: 'T1', currency: 'AED', localBalance: 1933546.05, usdValue: 526493, yield: 3.5, annualCashFlow: 18427, isCorporate: false },
  { accountId: '', account: 'FAB Current Account', holder: 'Joint', country: 'AE', assetClass: 'Cash', liquidity: 'T1', currency: 'AED', localBalance: 100050.19, usdValue: 27243, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'FAB 3% FD', holder: 'Joint', country: 'AE', assetClass: 'Cash', liquidity: 'T2.5', currency: 'AED', localBalance: 100000, usdValue: 27229, yield: 3.0, annualCashFlow: 817, isCorporate: false },
  { accountId: '', account: 'FAB Elite Card Debt', holder: 'Joint', country: 'AE', assetClass: 'Debt', liquidity: 'T1', currency: 'AED', localBalance: 30000, usdValue: 8169, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'HSBC Jersey', holder: 'Joint', country: 'JE', assetClass: 'Cash', liquidity: 'T2.5', currency: 'USD', localBalance: 299000, usdValue: 299000, yield: 4.5, annualCashFlow: 6728, isCorporate: false },
  { accountId: '', account: 'Hargreaves S&P Pension', holder: 'Anjan', country: 'US', assetClass: 'Equities', liquidity: 'T3', currency: 'GBP', localBalance: 21418, usdValue: 28336, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Axis FD', holder: 'Anjan', country: 'IN', assetClass: 'Cash', liquidity: 'T2.5', currency: 'USD', localBalance: 0, usdValue: 0, yield: 6.0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Wio Personal (Anjan)', holder: 'Anjan', country: 'AE', assetClass: 'Cash', liquidity: 'T1', currency: 'AED', localBalance: 27653, usdValue: 7530, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Wio Personal (Kate)', holder: 'Kate', country: 'AE', assetClass: 'Cash', liquidity: 'T1', currency: 'AED', localBalance: 5244, usdValue: 1428, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Hargreaves Schroder Pension', holder: 'Anjan', country: 'GB', assetClass: 'Equities', liquidity: 'T3', currency: 'GBP', localBalance: 38695, usdValue: 51194, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'IBKR S&P ISP', holder: 'Joint', country: 'US', assetClass: 'Equities', liquidity: 'T1', currency: 'USD', localBalance: 146986, usdValue: 146986, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Monzo Joint (UK)', holder: 'Joint', country: 'GB', assetClass: 'Cash', liquidity: 'T1', currency: 'GBP', localBalance: 15, usdValue: 20, yield: 2.5, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Revolut', holder: 'Anjan', country: 'GB', assetClass: 'Cash', liquidity: 'T1', currency: 'GBP', localBalance: 336, usdValue: 445, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Santander/NS&I (UK)', holder: 'Anjan', country: 'GB', assetClass: 'Cash', liquidity: 'T1', currency: 'GBP', localBalance: 1665, usdValue: 2203, yield: 4.0, annualCashFlow: 88, isCorporate: false },
  { accountId: '', account: 'Upvolt Equity', holder: 'Anjan', country: 'GB', assetClass: 'Private Equity', liquidity: 'T3', currency: 'GBP', localBalance: 31000, usdValue: 41013, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'UAE Car', holder: 'Anjan', country: 'AE', assetClass: 'Car', liquidity: 'T3', currency: 'AED', localBalance: 114500, usdValue: 31178, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Upvolt Debt', holder: 'Anjan', country: 'GB', assetClass: 'Private Debt', liquidity: 'T3', currency: 'USD', localBalance: 50000, usdValue: 50000, yield: 11.0, annualCashFlow: 5500, isCorporate: false },
  { accountId: '', account: 'Trump Meme Coin', holder: 'Anjan', country: 'US', assetClass: 'Crypto', liquidity: 'T2', currency: 'USD', localBalance: 500, usdValue: 500, yield: 0, annualCashFlow: 0, isCorporate: false },
  { accountId: '', account: 'Corporate Cash Balance', holder: 'Joint', country: 'GB', assetClass: 'Cash', liquidity: 'T2', currency: 'USD', localBalance: 437000, usdValue: 437000, yield: 0, annualCashFlow: 0, isCorporate: true },
]

const FALLBACK_HISTORY: NetWorthSnapshot[] = [
  { month: 'Sep 2024', value: 392000 },
  { month: 'Oct 2024', value: 453228 },
  { month: 'Nov 2024', value: 514457 },
  { month: 'Dec 2024', value: 575685 },
  { month: 'Jan 2025', value: 636914 },
  { month: 'Feb 2025', value: 698142 },
  { month: 'Mar 2025', value: 759371 },
  { month: 'Apr 2025', value: 820599 },
  { month: 'May 2025', value: 881828 },
  { month: 'Jun 2025', value: 943056 },
  { month: 'Jul 2025', value: 1004285 },
  { month: 'Aug 2025', value: 1065513 },
  { month: 'Sep 2025', value: 1126742 },
  { month: 'Oct 2025', value: 1187970 },
  { month: 'Nov 2025', value: 1249199 },
  { month: 'Dec 2025', value: 1310427 },
  { month: 'Jan 2026', value: 1371656 },
  { month: 'Feb 2026', value: 1432884 },
  { month: 'Mar 2026', value: 1494112 },
  { month: 'Apr 2026', value: 1555341 },
  { month: 'May 2026', value: 1616569 },
  { month: 'Jun 2026', value: 1677797 },
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

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatMonthLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function todayStr(): string {
  return new Date().toISOString().split('T')[0]
}

const COUNTRY_FLAGS: Record<string, string> = {
  AE: '\u{1F1E6}\u{1F1EA}',
  GB: '\u{1F1EC}\u{1F1E7}',
  US: '\u{1F1FA}\u{1F1F8}',
  JE: '\u{1F1EF}\u{1F1EA}',
  IN: '\u{1F1EE}\u{1F1F3}',
}

const HOLDER_STYLES: Record<string, string> = {
  Anjan: 'bg-blue-50 text-blue-700 border border-blue-200',
  Kate: 'bg-pink-50 text-pink-700 border border-pink-200',
  Joint: 'bg-purple-50 text-purple-700 border border-purple-200',
}

const ASSET_CLASS_STYLES: Record<string, string> = {
  Cash: 'text-blue-600',
  Equities: 'text-emerald-600',
  Debt: 'text-red-600',
  'Private Equity': 'text-violet-600',
  'Private Debt': 'text-amber-600',
  Crypto: 'text-pink-600',
  Car: 'text-indigo-600',
}

const ASSET_CLASS_COLORS: Record<string, string> = {
  Cash: '#3B82F6',
  Equities: '#10B981',
  'Private Equity': '#8B5CF6',
  'Private Debt': '#F59E0B',
  Car: '#6366F1',
  Crypto: '#EC4899',
  Debt: '#EF4444',
}

const LIQUIDITY_STYLES: Record<string, string> = {
  T1: 'bg-green-50 text-green-700 border border-green-200',
  T2: 'bg-amber-50 text-amber-700 border border-amber-200',
  'T2.5': 'bg-orange-50 text-orange-700 border border-orange-200',
  T3: 'bg-red-50 text-red-700 border border-red-200',
}

const LIQUIDITY_COLORS: Record<string, string> = {
  T1: '#22C55E',
  T2: '#F59E0B',
  'T2.5': '#F97316',
  T3: '#EF4444',
}

const LIQUIDITY_LABELS: Record<string, string> = {
  T1: 'T1 Instant',
  T2: 'T2 Days',
  'T2.5': 'T2.5 Locked',
  T3: 'T3 Locked Years',
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
  // ---- Data state ----
  const [accounts, setAccounts] = useState<Account[]>(FALLBACK_ACCOUNTS)
  const [snapshotDates, setSnapshotDates] = useState<SnapshotSummary[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [isDbConnected, setIsDbConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // ---- Edit state ----
  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, string>>({})
  const [saveDate, setSaveDate] = useState(todayStr())
  const [isSaving, setIsSaving] = useState(false)

  // ---- Fetch available snapshot dates on mount ----
  const fetchSnapshotDates = useCallback(async () => {
    try {
      const res = await fetch('/api/snapshots')
      if (!res.ok) throw new Error('API error')
      const data = await res.json()
      setSnapshotDates(data.snapshots || [])
      setIsDbConnected(true)

      // Auto-select the latest date if available
      if (data.snapshots?.length > 0) {
        setSelectedDate((prev) => prev || data.snapshots[0].date)
      }
    } catch {
      setIsDbConnected(false)
    }
  }, [])

  useEffect(() => {
    fetchSnapshotDates()
  }, [fetchSnapshotDates])

  // ---- Fetch snapshot data when a date is selected ----
  useEffect(() => {
    if (!selectedDate || !isDbConnected) return

    let cancelled = false
    setIsLoading(true)

    fetch(`/api/snapshots/${selectedDate}`)
      .then((res) => {
        if (!res.ok) throw new Error('API error')
        return res.json()
      })
      .then((data) => {
        if (cancelled) return
        if (data.accounts?.length > 0) {
          const hasData = data.accounts.some(
            (a: { balanceUsd: number }) => a.balanceUsd !== 0
          )
          if (hasData) {
            setAccounts(
              data.accounts.map(
                (a: {
                  accountId: string
                  name: string
                  holder: string
                  country: string
                  assetClass: string
                  liquidity: string
                  currency: string
                  balanceLocal: number
                  balanceUsd: number
                  yieldPercent: number
                  annualCashflow: number
                  isCorporate: boolean
                }) => ({
                  accountId: a.accountId,
                  account: a.name,
                  holder: a.holder as Account['holder'],
                  country: a.country,
                  assetClass: a.assetClass as Account['assetClass'],
                  liquidity: a.liquidity as Account['liquidity'],
                  currency: a.currency,
                  localBalance: a.balanceLocal,
                  usdValue: a.balanceUsd,
                  yield: a.yieldPercent,
                  annualCashFlow: a.annualCashflow,
                  isCorporate: a.isCorporate,
                })
              )
            )
          }
        }
      })
      .catch(() => {
        // Keep current data on error
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [selectedDate, isDbConnected])

  // ---- Computed: personal/corporate split ----
  const personalAccounts = useMemo(
    () => accounts.filter((a) => !a.isCorporate),
    [accounts]
  )
  const corporateAccounts = useMemo(
    () => accounts.filter((a) => a.isCorporate),
    [accounts]
  )
  const personalNetWorth = useMemo(
    () => personalAccounts.reduce((s, a) => s + a.usdValue, 0),
    [personalAccounts]
  )
  const corporateCash = useMemo(
    () => corporateAccounts.reduce((s, a) => s + a.usdValue, 0),
    [corporateAccounts]
  )
  const totalNetWorth = personalNetWorth + corporateCash

  const liquidAssets = useMemo(
    () =>
      accounts
        .filter((a) => a.liquidity === 'T1' || a.liquidity === 'T2')
        .reduce((s, a) => s + a.usdValue, 0),
    [accounts]
  )
  const lockedAssets = useMemo(
    () =>
      accounts
        .filter((a) => a.liquidity === 'T2.5' || a.liquidity === 'T3')
        .reduce((s, a) => s + a.usdValue, 0),
    [accounts]
  )
  const totalDebt = useMemo(
    () =>
      accounts
        .filter((a) => a.assetClass === 'Debt')
        .reduce((s, a) => s + a.usdValue, 0),
    [accounts]
  )
  const totalYield = useMemo(
    () => accounts.reduce((s, a) => s + a.annualCashFlow, 0),
    [accounts]
  )
  const personalYield = useMemo(
    () => personalAccounts.reduce((s, a) => s + a.annualCashFlow, 0),
    [personalAccounts]
  )

  // ---- Computed: allocation pie data ----
  const allocationData: AllocationSlice[] = useMemo(() => {
    const byClass: Record<string, number> = {}
    accounts.forEach((a) => {
      if (a.assetClass === 'Debt') return
      byClass[a.assetClass] = (byClass[a.assetClass] || 0) + a.usdValue
    })
    const totalAssets = Object.values(byClass).reduce((s, v) => s + v, 0)
    return Object.entries(byClass)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        pct:
          totalAssets > 0
            ? `${((value / totalAssets) * 100).toFixed(1)}%`
            : '0%',
        color: ASSET_CLASS_COLORS[name] || '#94A3B8',
      }))
  }, [accounts])

  // ---- Computed: liquidity bar data ----
  const liquidityData: LiquidityTier[] = useMemo(() => {
    const byTier: Record<string, number> = {}
    accounts.forEach((a) => {
      byTier[a.liquidity] = (byTier[a.liquidity] || 0) + a.usdValue
    })
    return ['T1', 'T2', 'T2.5', 'T3']
      .filter((t) => (byTier[t] || 0) > 0)
      .map((t) => ({
        tier: t,
        label: LIQUIDITY_LABELS[t] || t,
        value: Math.round(byTier[t] || 0),
        color: LIQUIDITY_COLORS[t] || '#94A3B8',
      }))
  }, [accounts])

  // ---- Computed: net worth history ----
  const netWorthHistory: NetWorthSnapshot[] = useMemo(() => {
    if (snapshotDates.length >= 2) {
      return [...snapshotDates]
        .reverse()
        .map((s) => ({
          month: formatMonthLabel(s.date),
          value: Math.round(s.totalNetWorth),
        }))
    }
    return FALLBACK_HISTORY
  }, [snapshotDates])

  // ---- Date navigation ----
  const currentDateIndex = useMemo(() => {
    if (!selectedDate) return -1
    return snapshotDates.findIndex((s) => s.date === selectedDate)
  }, [selectedDate, snapshotDates])

  function goToPrevDate() {
    if (currentDateIndex < snapshotDates.length - 1) {
      setSelectedDate(snapshotDates[currentDateIndex + 1].date)
    }
  }

  function goToNextDate() {
    if (currentDateIndex > 0) {
      setSelectedDate(snapshotDates[currentDateIndex - 1].date)
    }
  }

  function goToLatest() {
    if (snapshotDates.length > 0) {
      setSelectedDate(snapshotDates[0].date)
    } else {
      setSelectedDate(null)
      setAccounts(FALLBACK_ACCOUNTS)
    }
  }

  // ---- Edit handlers ----
  function startEditing() {
    const vals: Record<string, string> = {}
    accounts.forEach((a, i) => {
      vals[i] = a.localBalance.toString()
    })
    setEditValues(vals)
    setSaveDate(todayStr())
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setEditValues({})
  }

  async function saveSnapshot() {
    if (!isDbConnected) {
      applyEditsLocally()
      return
    }

    setIsSaving(true)
    try {
      const updatedAccounts = accounts.map((a, i) => {
        const raw = editValues[i]
        if (raw === undefined) return a
        const parsed = parseFloat(raw)
        if (isNaN(parsed)) return a
        const ratio =
          a.localBalance !== 0 ? a.usdValue / a.localBalance : 1
        return {
          ...a,
          localBalance: parsed,
          usdValue: Math.round(parsed * ratio),
        }
      })

      const balances = updatedAccounts.map((a) => ({
        accountId: a.accountId,
        balanceLocal: a.localBalance,
        balanceUsd: a.usdValue,
        yieldPercent: a.yield,
        annualCashflow: a.annualCashFlow,
      }))

      const res = await fetch('/api/snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: saveDate, balances }),
      })

      if (!res.ok) throw new Error('Save failed')

      setAccounts(updatedAccounts)
      setIsEditing(false)
      setEditValues({})
      await fetchSnapshotDates()
      setSelectedDate(saveDate)
    } catch (err) {
      console.error('Failed to save snapshot:', err)
      applyEditsLocally()
    } finally {
      setIsSaving(false)
    }
  }

  function applyEditsLocally() {
    setAccounts((prev) =>
      prev.map((a, i) => {
        const raw = editValues[i]
        if (raw === undefined) return a
        const parsed = parseFloat(raw)
        if (isNaN(parsed)) return a
        const ratio =
          a.localBalance !== 0 ? a.usdValue / a.localBalance : 1
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

  // ---- Index lists for the table ----
  const personalWithIdx = useMemo(
    () =>
      accounts
        .map((a, i) => ({ account: a, idx: i }))
        .filter(({ account }) => !account.isCorporate),
    [accounts]
  )
  const corporateWithIdx = useMemo(
    () =>
      accounts
        .map((a, i) => ({ account: a, idx: i }))
        .filter(({ account }) => account.isCorporate),
    [accounts]
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* ---------------------------------------------------------------- */}
        {/* Page Header                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Net Worth
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Balance Sheet &amp; Asset Tracker
          </p>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Date Navigation Bar                                              */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <Calendar className="h-4 w-4 text-gray-400" />

          {snapshotDates.length > 0 ? (
            <>
              <select
                value={selectedDate || ''}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {snapshotDates.map((s) => (
                  <option key={s.date} value={s.date}>
                    {formatDateLabel(s.date)}
                    {s.date === snapshotDates[0].date ? ' (Latest)' : ''}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-1">
                <button
                  onClick={goToPrevDate}
                  disabled={currentDateIndex >= snapshotDates.length - 1}
                  className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                  title="Older snapshot"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={goToNextDate}
                  disabled={currentDateIndex <= 0}
                  className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                  title="Newer snapshot"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {selectedDate !== snapshotDates[0]?.date && (
                <button
                  onClick={goToLatest}
                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                >
                  Jump to Latest
                </button>
              )}

              <span className="ml-auto text-xs text-gray-400">
                <Clock className="mr-1 inline h-3 w-3" />
                {snapshotDates.length} snapshot
                {snapshotDates.length !== 1 ? 's' : ''}
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-500">
              {isDbConnected
                ? 'No snapshots yet — save your first one below'
                : 'Showing spreadsheet data (database not connected)'}
            </span>
          )}

          {isLoading && (
            <span className="ml-2 animate-pulse text-xs text-blue-500">
              Loading...
            </span>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Summary Cards                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Total Net Worth"
            value={fmt(totalNetWorth)}
            change={2.3}
            subtitle={`Personal ${fmt(personalNetWorth)} + Corporate ${fmt(corporateCash)}`}
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
        {/* Asset Allocation Pie + Liquidity Bar                              */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {allocationData.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center gap-1.5 text-xs text-gray-600"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  {d.name}: {d.pct}
                </div>
              ))}
            </div>
          </div>

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
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#f0f0f0"
                  horizontal={false}
                />
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
                <Tooltip
                  content={<BarTooltip />}
                  cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={32}>
                  {liquidityData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {liquidityData.map((d) => (
                <div
                  key={d.tier}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <p className="text-xs font-medium text-gray-500">
                    {d.label}
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {fmt(d.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Account Table                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">
              Account Balances
              {selectedDate && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  as of {formatDateLabel(selectedDate)}
                </span>
              )}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {isEditing ? (
                <>
                  <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5">
                    <Calendar className="h-3.5 w-3.5 text-blue-600" />
                    <label className="text-xs font-medium text-blue-700">
                      Save as:
                    </label>
                    <input
                      type="date"
                      value={saveDate}
                      onChange={(e) => setSaveDate(e.target.value)}
                      className="rounded border border-blue-300 bg-white px-2 py-0.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={saveSnapshot}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSaving ? 'Saving...' : 'Save Snapshot'}
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
                {/* ---- Personal Accounts ---- */}
                {personalWithIdx.map(({ account: a, idx: i }) => (
                  <tr
                    key={a.accountId || a.account}
                    className="transition-colors hover:bg-gray-50/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      {a.account}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${HOLDER_STYLES[a.holder]}`}
                      >
                        {a.holder}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm" title={a.country}>
                        {COUNTRY_FLAGS[a.country] || a.country}{' '}
                        <span className="text-xs text-gray-400">
                          {a.country}
                        </span>
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${ASSET_CLASS_STYLES[a.assetClass]}`}
                    >
                      {a.assetClass}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LIQUIDITY_STYLES[a.liquidity]}`}
                      >
                        {a.liquidity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {a.currency}
                    </td>
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
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        a.usdValue < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {fmt(a.usdValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {a.yield > 0 ? `${a.yield.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {a.annualCashFlow > 0 ? fmt(a.annualCashFlow) : '—'}
                    </td>
                  </tr>
                ))}

                {/* ---- Personal Net Worth Subtotal ---- */}
                <tr className="border-t-2 border-blue-200 bg-blue-50/60">
                  <td className="px-4 py-3 font-bold text-blue-900">
                    Personal Net Worth
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-900">
                    &mdash;
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-900">
                    {fmt(personalNetWorth)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-700">
                    &mdash;
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-900">
                    {fmt(personalYield)}
                  </td>
                </tr>

                {/* ---- Corporate Cash ---- */}
                {corporateWithIdx.map(({ account: a, idx: i }) => (
                  <tr
                    key={a.accountId || a.account}
                    className="bg-amber-50/40 transition-colors hover:bg-amber-50/70"
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                      {a.account}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${HOLDER_STYLES[a.holder]}`}
                      >
                        {a.holder}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm" title={a.country}>
                        {COUNTRY_FLAGS[a.country] || a.country}{' '}
                        <span className="text-xs text-gray-400">
                          {a.country}
                        </span>
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${ASSET_CLASS_STYLES[a.assetClass]}`}
                    >
                      {a.assetClass}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LIQUIDITY_STYLES[a.liquidity]}`}
                      >
                        {a.liquidity}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500">
                      {a.currency}
                    </td>
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
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        a.usdValue < 0 ? 'text-red-600' : 'text-gray-900'
                      }`}
                    >
                      {fmt(a.usdValue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {a.yield > 0 ? `${a.yield.toFixed(2)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                      {a.annualCashFlow > 0 ? fmt(a.annualCashFlow) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* ---- Grand Total ---- */}
              <tfoot>
                <tr className="border-t-2 border-gray-300 bg-gray-100">
                  <td className="px-4 py-3 font-bold text-gray-900">
                    Total Net Worth
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
            {snapshotDates.length >= 2 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                from saved snapshots
              </span>
            )}
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
                dot={{
                  fill: '#3B82F6',
                  r: 4,
                  strokeWidth: 2,
                  stroke: '#fff',
                }}
                activeDot={{
                  r: 6,
                  fill: '#3B82F6',
                  stroke: '#fff',
                  strokeWidth: 2,
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
