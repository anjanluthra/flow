'use client'

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  Target,
  Settings2,
  Trash2,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { convertToUSD, DEFAULT_FX_RATES } from '@/lib/currency'

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
  // True when this date has a full per-account balance sheet; false for
  // total-only historical markers (older checkpoints).
  detailed?: boolean
  lines?: { group: string; label: string; amountUsd: number }[]
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
  { accountId: '', account: 'FAB Elite Card Debt', holder: 'Joint', country: 'AE', assetClass: 'Debt', liquidity: 'T1', currency: 'AED', localBalance: -30000, usdValue: -8169, yield: 0, annualCashFlow: 0, isCorporate: false },
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
  { accountId: '', account: 'Corporate Cash Balance', holder: 'Joint', country: 'AE', assetClass: 'Cash', liquidity: 'T2', currency: 'USD', localBalance: 437000, usdValue: 437000, yield: 0, annualCashFlow: 0, isCorporate: true },
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

const NET_WORTH_TARGET = 2_000_000

// Display label → DB enum (for saving account-detail edits)
const HOLDER_TO_ENUM: Record<string, string> = { Anjan: 'anjan', Kate: 'kate', Joint: 'joint' }
const ASSET_CLASS_TO_ENUM: Record<string, string> = {
  Cash: 'cash',
  Equities: 'equities',
  'Private Equity': 'private_equity',
  'Private Debt': 'private_debt',
  Crypto: 'crypto',
  Car: 'car',
  Debt: 'debt',
}
const LIQUIDITY_TO_ENUM: Record<string, string> = {
  T1: 't1_instant',
  T2: 't2_days',
  'T2.5': 't2_5_locked',
  T3: 't3_locked_years',
}

const COUNTRY_OPTIONS = ['AE', 'GB', 'US', 'JE', 'IN', 'CH', 'SG']
const CURRENCY_OPTIONS = ['AED', 'USD', 'GBP', 'INR', 'EUR', 'CHF']
const HOLDER_OPTIONS: Account['holder'][] = ['Anjan', 'Kate', 'Joint']
const ASSET_CLASS_OPTIONS: Account['assetClass'][] = ['Cash', 'Equities', 'Private Equity', 'Private Debt', 'Crypto', 'Car', 'Debt']
const LIQUIDITY_OPTIONS: Account['liquidity'][] = ['T1', 'T2', 'T2.5', 'T3']

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
  // Yield % and annual cash flow edits, keyed by row index (same as editValues).
  const [yieldValues, setYieldValues] = useState<Record<string, string>>({})
  const [cashflowValues, setCashflowValues] = useState<Record<string, string>>({})
  const [saveDate, setSaveDate] = useState(todayStr())
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // ---- Account-detail editing (country/holder/currency/class/liquidity) ----
  const [editingDetails, setEditingDetails] = useState(false)
  const [detailEdits, setDetailEdits] = useState<Record<string, Partial<Account>>>({})
  const [savingDetails, setSavingDetails] = useState(false)

  // ---- FX state ----
  const [fxRates, setFxRates] = useState<Record<string, number> | null>(null)
  const [fxSource, setFxSource] = useState<string>('fallback')
  const [viewCurrency, setViewCurrency] = useState<'USD' | 'GBP' | 'AED'>('USD')

  // ---- Chart drill-down: click a liquidity tier / asset class to list its
  // underlying accounts in a side drawer (like the Cash Flow drill-down). ----
  const [drill, setDrill] = useState<{ kind: 'liquidity' | 'asset'; key: string; label: string } | null>(null)
  const openLiquidityDrill = (tier: string) =>
    setDrill({ kind: 'liquidity', key: tier, label: LIQUIDITY_LABELS[tier] ?? tier })
  const openAssetDrill = (name: string) => setDrill({ kind: 'asset', key: name, label: name })

  // ---- Fetch live FX rates on mount ----
  useEffect(() => {
    fetch('/api/fx')
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data?.rates) {
          setFxRates(data.rates)
          setFxSource(data.source)
        }
      })
      .catch(() => {
        // Static defaults remain in effect.
      })
  }, [])

  // Display conversion: values are stored in USD; other views divide by the
  // live USD-per-unit rate for the chosen currency.
  const gbpUsdRate = fxRates?.GBP_USD ?? DEFAULT_FX_RATES.GBP_USD
  const aedUsdRate = fxRates?.AED_USD ?? DEFAULT_FX_RATES.AED_USD
  const fmtView = useCallback(
    (usd: number): string => {
      const value =
        viewCurrency === 'GBP' ? usd / gbpUsdRate : viewCurrency === 'AED' ? usd / aedUsdRate : usd
      const rounded = Math.round(value)
      const symbol = viewCurrency === 'GBP' ? '£' : viewCurrency === 'AED' ? 'AED ' : '$'
      if (rounded < 0) return `-${symbol}${Math.abs(rounded).toLocaleString('en-US')}`
      return `${symbol}${rounded.toLocaleString('en-US')}`
    },
    [viewCurrency, gbpUsdRate, aedUsdRate],
  )

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
    // Once connected, only ever show real saved snapshots — never the
    // synthetic spreadsheet projection, which is misleading as "history".
    if (isDbConnected) {
      return [...snapshotDates]
        .reverse()
        .map((s) => ({
          month: formatMonthLabel(s.date),
          value: Math.round(s.totalNetWorth),
        }))
    }
    return FALLBACK_HISTORY
  }, [snapshotDates, isDbConnected])

  // ---- Selected snapshot summary + whether it's a full balance sheet ----
  const selectedSummary = useMemo(
    () => snapshotDates.find((s) => s.date === selectedDate) ?? null,
    [snapshotDates, selectedDate],
  )
  // A "marker" is an older historical checkpoint that stores only a total net
  // worth (no per-account breakdown). For those we show a condensed view rather
  // than the full — and misleading — account table / allocation / liquidity.
  const isMarker = !!selectedDate && !!selectedSummary && selectedSummary.detailed === false

  // ---- Date navigation ----
  const currentDateIndex = useMemo(() => {
    if (!selectedDate) return -1
    return snapshotDates.findIndex((s) => s.date === selectedDate)
  }, [selectedDate, snapshotDates])

  // ---- Computed: % change vs the previous (older) snapshot ----
  const netWorthChange = useMemo<number | undefined>(() => {
    if (currentDateIndex < 0) return undefined
    const curr = snapshotDates[currentDateIndex]
    const prev = snapshotDates[currentDateIndex + 1]
    if (!curr || !prev || prev.totalNetWorth === 0) return undefined
    return (
      ((curr.totalNetWorth - prev.totalNetWorth) /
        Math.abs(prev.totalNetWorth)) *
      100
    )
  }, [currentDateIndex, snapshotDates])

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

  // ---- Delete a saved snapshot / history data point ----
  async function deleteSnapshot() {
    if (!selectedDate || !isDbConnected) return
    const label = formatDateLabel(selectedDate)
    if (
      !window.confirm(
        `Delete the ${label} snapshot?\n\nThis removes that single data point from your net worth history. It can't be undone.`,
      )
    )
      return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/snapshots?date=${selectedDate}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      const remaining = snapshotDates.filter((s) => s.date !== selectedDate)
      setSelectedDate(remaining[0]?.date ?? null)
      if (remaining.length === 0) setAccounts(FALLBACK_ACCOUNTS)
      await fetchSnapshotDates()
    } catch (err) {
      console.error('Failed to delete snapshot:', err)
      window.alert('Could not delete that snapshot. Please try again.')
    } finally {
      setIsDeleting(false)
    }
  }

  // ---- Account-detail editing ----
  function startEditingDetails() {
    setDetailEdits({})
    setEditingDetails(true)
  }

  function cancelEditingDetails() {
    setEditingDetails(false)
    setDetailEdits({})
  }

  function setDetail(accountId: string, patch: Partial<Account>) {
    setDetailEdits((prev) => ({ ...prev, [accountId]: { ...prev[accountId], ...patch } }))
  }

  async function saveDetails() {
    if (!isDbConnected) {
      setEditingDetails(false)
      return
    }
    setSavingDetails(true)
    try {
      const ids = Object.keys(detailEdits).filter((id) => id)
      await Promise.all(
        ids.map((id) => {
          const e = detailEdits[id]
          const payload: Record<string, unknown> = { id }
          if (e.holder) payload.holder = HOLDER_TO_ENUM[e.holder]
          if (e.country) payload.country = e.country
          if (e.currency) payload.currency = e.currency
          if (e.assetClass) payload.assetClass = ASSET_CLASS_TO_ENUM[e.assetClass]
          if (e.liquidity) payload.liquidityTier = LIQUIDITY_TO_ENUM[e.liquidity]
          return fetch('/api/accounts', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        }),
      )
      // Reflect the edits locally, then refresh the current snapshot from DB.
      setAccounts((prev) =>
        prev.map((a) => (detailEdits[a.accountId] ? { ...a, ...detailEdits[a.accountId] } : a)),
      )
      setEditingDetails(false)
      setDetailEdits({})
    } catch {
      /* keep local edits visible */
      setEditingDetails(false)
    } finally {
      setSavingDetails(false)
    }
  }

  // Effective value for a cell during detail editing.
  const cellVal = <K extends keyof Account>(a: Account, key: K): Account[K] =>
    (detailEdits[a.accountId]?.[key] as Account[K]) ?? a[key]

  // ---- Edit handlers ----
  // Accounts shown before entering edit mode, so Cancel can restore the view.
  const preEditAccountsRef = useRef<Account[] | null>(null)

  // Map DB enum values to the display labels used in this table.
  const HOLDER_FROM_ENUM: Record<string, Account['holder']> = { anjan: 'Anjan', kate: 'Kate', joint: 'Joint' }
  const ASSET_FROM_ENUM: Record<string, Account['assetClass']> = {
    cash: 'Cash', equities: 'Equities', private_equity: 'Private Equity',
    private_debt: 'Private Debt', crypto: 'Crypto', car: 'Car', debt: 'Debt',
  }
  const LIQ_FROM_ENUM: Record<string, Account['liquidity']> = {
    t1_instant: 'T1', t2_days: 'T2', t2_5_locked: 'T2.5', t3_locked_years: 'T3',
  }

  async function startEditing() {
    preEditAccountsRef.current = accounts
    let merged = accounts
    // Pull in every active account so newly-added ones (with no balance yet)
    // show up here and can be given a balance.
    try {
      const res = await fetch('/api/accounts')
      const data = await res.json()
      const have = new Set(accounts.map((a) => a.accountId))
      const extras: Account[] = (data.accounts || [])
        .filter((a: { id: string }) => a.id && !have.has(a.id))
        .map((a: { id: string; name: string; holder: string; country: string; assetClass: string; liquidityTier: string; currency: string; isCorporate: boolean }) => ({
          accountId: a.id,
          account: a.name,
          holder: HOLDER_FROM_ENUM[a.holder] ?? 'Joint',
          country: a.country,
          assetClass: ASSET_FROM_ENUM[a.assetClass] ?? 'Cash',
          liquidity: LIQ_FROM_ENUM[a.liquidityTier] ?? 'T1',
          currency: a.currency,
          localBalance: 0,
          usdValue: 0,
          yield: 0,
          annualCashFlow: 0,
          isCorporate: a.isCorporate,
        }))
      if (extras.length) merged = [...accounts, ...extras]
    } catch {
      /* keep the accounts we already have */
    }
    setAccounts(merged)
    const vals: Record<string, string> = {}
    const yields: Record<string, string> = {}
    const cashflows: Record<string, string> = {}
    merged.forEach((a, i) => {
      vals[i] = a.localBalance.toString()
      yields[i] = a.yield ? a.yield.toString() : ''
      cashflows[i] = a.annualCashFlow ? a.annualCashFlow.toString() : ''
    })
    setEditValues(vals)
    setYieldValues(yields)
    setCashflowValues(cashflows)
    setSaveDate(todayStr())
    setIsEditing(true)
  }

  function cancelEditing() {
    setIsEditing(false)
    setEditValues({})
    setYieldValues({})
    setCashflowValues({})
    if (preEditAccountsRef.current) setAccounts(preEditAccountsRef.current)
  }

  // Derive the annual cash flow from a row's balance and yield %, so entering
  // a rate auto-fills the cash flow column (the user can still override it).
  function recalcCashflow(i: number, a: Account, yieldStr: string, localStr: string) {
    const y = parseFloat(yieldStr)
    if (isNaN(y)) return
    const local = parseFloat(localStr)
    const usd = isNaN(local)
      ? a.usdValue
      : Math.round(convertToUSD(local, a.currency, fxRates ?? undefined))
    const cf = Math.round((usd * y) / 100)
    setCashflowValues((prev) => ({ ...prev, [i]: cf ? cf.toString() : '' }))
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
        const parsed = raw === undefined ? NaN : parseFloat(raw)
        const localBalance = isNaN(parsed) ? a.localBalance : parsed
        const usdValue = isNaN(parsed)
          ? a.usdValue
          : Math.round(convertToUSD(parsed, a.currency, fxRates ?? undefined))

        const rawYield = yieldValues[i]
        const parsedYield = rawYield === undefined ? NaN : parseFloat(rawYield)
        const yieldPct = rawYield === '' ? 0 : isNaN(parsedYield) ? a.yield : parsedYield

        const rawCf = cashflowValues[i]
        const parsedCf = rawCf === undefined ? NaN : parseFloat(rawCf)
        const annualCashFlow = rawCf === '' ? 0 : isNaN(parsedCf) ? a.annualCashFlow : parsedCf

        return { ...a, localBalance, usdValue, yield: yieldPct, annualCashFlow }
      })

      // Only save accounts that were already on the sheet or that you gave a
      // balance to — so newly-pulled-in accounts left at 0 don't clutter it.
      const preEdit = new Set((preEditAccountsRef.current ?? []).map((a) => a.accountId))
      const balances = updatedAccounts
        .filter((a) => preEdit.has(a.accountId) || a.localBalance !== 0)
        .map((a) => ({
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
      setYieldValues({})
      setCashflowValues({})
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
        const parsed = raw === undefined ? NaN : parseFloat(raw)
        const localBalance = isNaN(parsed) ? a.localBalance : parsed
        const usdValue = isNaN(parsed)
          ? a.usdValue
          : Math.round(convertToUSD(parsed, a.currency, fxRates ?? undefined))

        const rawYield = yieldValues[i]
        const parsedYield = rawYield === undefined ? NaN : parseFloat(rawYield)
        const yieldPct = rawYield === '' ? 0 : isNaN(parsedYield) ? a.yield : parsedYield

        const rawCf = cashflowValues[i]
        const parsedCf = rawCf === undefined ? NaN : parseFloat(rawCf)
        const annualCashFlow = rawCf === '' ? 0 : isNaN(parsedCf) ? a.annualCashFlow : parsedCf

        return { ...a, localBalance, usdValue, yield: yieldPct, annualCashFlow }
      })
    )
    setIsEditing(false)
    setEditValues({})
    setYieldValues({})
    setCashflowValues({})
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

  function renderAccountRow(a: Account, i: number, corporate: boolean) {
    return (
      <tr
        key={a.accountId || a.account}
        className={
          corporate
            ? 'bg-amber-50/40 transition-colors hover:bg-amber-50/70'
            : 'transition-colors hover:bg-gray-50/50'
        }
      >
        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">{a.account}</td>

        {/* Holder */}
        <td className="px-4 py-3">
          {editingDetails ? (
            <Select
              value={cellVal(a, 'holder')}
              onChange={(v) => setDetail(a.accountId, { holder: v as Account['holder'] })}
              options={HOLDER_OPTIONS.map((v) => ({ value: v, label: v }))}
              buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 hover:bg-gray-50"
            />
          ) : (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${HOLDER_STYLES[a.holder]}`}>
              {a.holder}
            </span>
          )}
        </td>

        {/* Country */}
        <td className="px-4 py-3 text-center">
          {editingDetails ? (
            <Select
              value={cellVal(a, 'country')}
              onChange={(v) => setDetail(a.accountId, { country: v })}
              options={COUNTRY_OPTIONS.map((v) => ({ value: v, label: v }))}
              buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 hover:bg-gray-50"
            />
          ) : (
            <span className="text-sm" title={a.country}>
              {COUNTRY_FLAGS[a.country] || a.country}{' '}
              <span className="text-xs text-gray-400">{a.country}</span>
            </span>
          )}
        </td>

        {/* Asset class */}
        <td className={`px-4 py-3 font-medium ${ASSET_CLASS_STYLES[a.assetClass]}`}>
          {editingDetails ? (
            <Select
              value={cellVal(a, 'assetClass')}
              onChange={(v) => setDetail(a.accountId, { assetClass: v as Account['assetClass'] })}
              options={ASSET_CLASS_OPTIONS.map((v) => ({ value: v, label: v }))}
              buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 hover:bg-gray-50"
            />
          ) : (
            a.assetClass
          )}
        </td>

        {/* Liquidity */}
        <td className="px-4 py-3 text-center">
          {editingDetails ? (
            <Select
              value={cellVal(a, 'liquidity')}
              onChange={(v) => setDetail(a.accountId, { liquidity: v as Account['liquidity'] })}
              options={LIQUIDITY_OPTIONS.map((v) => ({ value: v, label: v }))}
              buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 hover:bg-gray-50"
            />
          ) : (
            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${LIQUIDITY_STYLES[a.liquidity]}`}>
              {a.liquidity}
            </span>
          )}
        </td>

        {/* Currency */}
        <td className="px-4 py-3 text-center text-gray-500">
          {editingDetails ? (
            <Select
              value={cellVal(a, 'currency')}
              onChange={(v) => setDetail(a.accountId, { currency: v })}
              options={CURRENCY_OPTIONS.map((v) => ({ value: v, label: v }))}
              buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-300 bg-white px-2 text-xs text-gray-900 hover:bg-gray-50"
            />
          ) : (
            a.currency
          )}
        </td>

        {/* Local balance */}
        <td className="px-4 py-3 text-right tabular-nums">
          {isEditing ? (
            <input
              type="text"
              value={editValues[i] ?? a.localBalance.toString()}
              onChange={(e) => {
                const v = e.target.value
                setEditValues((prev) => ({ ...prev, [i]: v }))
                recalcCashflow(i, a, yieldValues[i] ?? '', v)
              }}
              className="w-28 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            <span className={a.localBalance < 0 ? 'text-red-600' : 'text-gray-900'}>
              {fmtLocal(a.localBalance, a.currency)}
            </span>
          )}
        </td>

        {/* Converted value */}
        <td className={`px-4 py-3 text-right tabular-nums font-medium ${a.usdValue < 0 ? 'text-red-600' : 'text-gray-900'}`}>
          {fmtView(a.usdValue)}
        </td>

        {/* Yield */}
        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
          {isEditing ? (
            <div className="inline-flex items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={yieldValues[i] ?? ''}
                onChange={(e) => {
                  const v = e.target.value
                  setYieldValues((prev) => ({ ...prev, [i]: v }))
                  recalcCashflow(i, a, v, editValues[i] ?? a.localBalance.toString())
                }}
                className="w-16 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <span className="text-gray-400">%</span>
            </div>
          ) : (
            a.yield > 0 ? `${a.yield.toFixed(2)}%` : '—'
          )}
        </td>

        {/* Annual cash flow */}
        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
          {isEditing ? (
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={cashflowValues[i] ?? ''}
              onChange={(e) => setCashflowValues((prev) => ({ ...prev, [i]: e.target.value }))}
              className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          ) : (
            a.annualCashFlow > 0 ? fmtView(a.annualCashFlow) : '—'
          )}
        </td>
      </tr>
    )
  }

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
          {/* Currency view toggle */}
          <div className="flex overflow-hidden rounded-lg border border-gray-200">
            {(['USD', 'GBP', 'AED'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setViewCurrency(c)}
                className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewCurrency === c
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-500 hover:bg-gray-50'
                }`}
              >
                {c === 'USD' ? '$ USD' : c === 'GBP' ? '£ GBP' : 'AED'}
              </button>
            ))}
          </div>
          <span
            className={`text-[10px] font-medium uppercase tracking-wide ${
              fxSource === 'fallback' ? 'text-amber-500' : 'text-emerald-600'
            }`}
            title={
              fxSource === 'fallback'
                ? 'Live rates unavailable — using static fallback rates'
                : 'Converted with live daily FX rates'
            }
          >
            {fxSource === 'fallback' ? 'static fx' : 'live fx'}
          </span>

          <div className="h-6 w-px bg-gray-200" />

          <Calendar className="h-4 w-4 text-gray-400" />

          {snapshotDates.length > 0 ? (
            <>
              <Select
                value={selectedDate || ''}
                onChange={setSelectedDate}
                options={snapshotDates.map((s) => ({
                  value: s.date,
                  label: formatDateLabel(s.date) + (s.date === snapshotDates[0].date ? ' (Latest)' : ''),
                }))}
                searchable
                align="left"
              />

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

              {!isEditing && !editingDetails && selectedDate && (
                <button
                  onClick={deleteSnapshot}
                  disabled={isDeleting}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-40"
                  title="Delete this snapshot / data point"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {isDeleting ? 'Deleting…' : 'Delete'}
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
        {/* Condensed view — historical markers (total only)                 */}
        {/* ---------------------------------------------------------------- */}
        {isMarker && selectedSummary && (
          <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
                  Total Net Worth
                </p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {fmtView(selectedSummary.totalNetWorth)}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  as of {formatDateLabel(selectedSummary.date)}
                  {netWorthChange !== undefined && (
                    <span
                      className={`ml-2 font-medium ${
                        netWorthChange >= 0 ? 'text-emerald-600' : 'text-red-600'
                      }`}
                    >
                      {netWorthChange >= 0 ? '▲' : '▼'} {Math.abs(netWorthChange).toFixed(1)}% vs previous
                    </span>
                  )}
                </p>
              </div>
              {(selectedSummary.personalNetWorth > 0 || selectedSummary.corporateCash > 0) && (
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2">
                    <p className="text-xs font-medium text-gray-500">Personal</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {fmtView(selectedSummary.personalNetWorth)}
                    </p>
                  </div>
                  <div className="rounded-lg border border-gray-100 bg-gray-50 px-4 py-2">
                    <p className="text-xs font-medium text-gray-500">Corporate</p>
                    <p className="text-sm font-semibold text-gray-900">
                      {fmtView(selectedSummary.corporateCash)}
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs text-amber-700">
                Historical checkpoint — only the total net worth was recorded for this date, so the
                per-account breakdown, allocation and liquidity aren&apos;t available. Jump to the latest
                snapshot for the full balance sheet.
              </p>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Detailed view — full balance sheet (per-account snapshots)       */}
        {/* ---------------------------------------------------------------- */}
        {!isMarker && (
          <>
        {/* ---------------------------------------------------------------- */}
        {/* Summary Cards                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Total Net Worth"
            value={fmtView(totalNetWorth)}
            change={netWorthChange}
            subtitle={`Personal ${fmtView(personalNetWorth)} + Corporate ${fmtView(corporateCash)}`}
            icon={<DollarSign className="h-5 w-5" />}
          />
          <Card
            title="Liquid Assets (T1+T2)"
            value={fmtView(liquidAssets)}
            subtitle="Instant + short-term"
            icon={<Wallet className="h-5 w-5" />}
          />
          <Card
            title="Locked Assets (T2.5+T3)"
            value={fmtView(lockedAssets)}
            subtitle="Pensions & locked"
            icon={<Lock className="h-5 w-5" />}
          />
          <Card
            title="Total Debt"
            value={fmtView(totalDebt)}
            subtitle="Credit card balance"
            icon={<CreditCard className="h-5 w-5" />}
          />
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* $2M Net Worth Target                                             */}
        {/* ---------------------------------------------------------------- */}
        {(() => {
          const pct = Math.max(0, Math.min(100, (totalNetWorth / NET_WORTH_TARGET) * 100))
          const remaining = Math.max(0, NET_WORTH_TARGET - totalNetWorth)
          const reached = totalNetWorth >= NET_WORTH_TARGET
          return (
            <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Target className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Net Worth Target</h2>
                    <p className="text-xs text-gray-500">Goal: {fmtView(NET_WORTH_TARGET)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{pct.toFixed(1)}%</p>
                  <p className="text-xs text-gray-500">
                    {reached ? 'Target reached 🎉' : `${fmtView(remaining)} to go`}
                  </p>
                </div>
              </div>
              <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-gray-400">
                <span>{fmtView(totalNetWorth)} now</span>
                <span>{fmtView(NET_WORTH_TARGET)}</span>
              </div>
            </div>
          )
        })()}

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
                  outerRadius="80%"
                  innerRadius="45%"
                  dataKey="value"
                  labelLine={false}
                  stroke="#fff"
                  strokeWidth={2}
                  onClick={(data) => {
                    const name = (data as unknown as { name?: string })?.name
                    if (name) openAssetDrill(String(name))
                  }}
                  className="cursor-pointer"
                >
                  {allocationData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} className="cursor-pointer" />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
              {allocationData.map((d) => (
                <button
                  key={d.name}
                  onClick={() => openAssetDrill(d.name)}
                  className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900"
                  title={`See ${d.name} accounts`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: d.color }}
                  />
                  {d.name}: {d.pct}
                </button>
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
                <Bar
                  dataKey="value"
                  radius={[0, 6, 6, 0]}
                  barSize={32}
                  className="cursor-pointer"
                  onClick={(data) => {
                    const d = data as unknown as { tier?: string; payload?: { tier?: string } }
                    const tier = d?.tier ?? d?.payload?.tier
                    if (tier) openLiquidityDrill(String(tier))
                  }}
                >
                  {liquidityData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} className="cursor-pointer" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {liquidityData.map((d) => (
                <button
                  key={d.tier}
                  onClick={() => openLiquidityDrill(d.tier)}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-100"
                  title={`See ${d.label} accounts`}
                >
                  <p className="text-xs font-medium text-gray-500">
                    {d.label}
                  </p>
                  <p className="text-sm font-semibold text-gray-900">
                    {fmt(d.value)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>

          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Net Worth History Line Chart (shown for every snapshot)          */}
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
                dot={{ fill: '#3B82F6', r: 4, strokeWidth: 2, stroke: '#fff' }}
                activeDot={{ r: 6, fill: '#3B82F6', stroke: '#fff', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Account Table (detailed snapshots only)                          */}
        {/* ---------------------------------------------------------------- */}
        {!isMarker && (
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
              ) : editingDetails ? (
                <>
                  <span className="text-xs text-gray-500">
                    Editing account details — change country, holder, currency, class or liquidity.
                  </span>
                  <button
                    onClick={saveDetails}
                    disabled={savingDetails}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {savingDetails ? 'Saving...' : 'Save Details'}
                  </button>
                  <button
                    onClick={cancelEditingDetails}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <X className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={startEditing}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Update Balances
                  </button>
                  <button
                    onClick={startEditingDetails}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Edit Details
                  </button>
                </>
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
                    {viewCurrency} Value
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
                {personalWithIdx.map(({ account: a, idx: i }) => renderAccountRow(a, i, false))}

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
                    {fmtView(personalNetWorth)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-700">
                    &mdash;
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-blue-900">
                    {fmtView(personalYield)}
                  </td>
                </tr>

                {/* ---- Corporate Cash ---- */}
                {corporateWithIdx.map(({ account: a, idx: i }) => renderAccountRow(a, i, true))}
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
                    {fmtView(totalNetWorth)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-600">
                    &mdash;
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-gray-900">
                    {fmtView(totalYield)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Chart drill-down drawer — accounts within a tier / asset class    */}
        {/* ---------------------------------------------------------------- */}
        {drill && (() => {
          const list = accounts
            .filter((a) => (drill.kind === 'liquidity' ? a.liquidity === drill.key : a.assetClass === drill.key))
            .sort((a, b) => b.usdValue - a.usdValue)
          const total = list.reduce((s, a) => s + a.usdValue, 0)
          return (
            <div className="fixed inset-0 z-50 flex justify-end">
              <div className="absolute inset-0 bg-black/20" onClick={() => setDrill(null)} />
              <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
                <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{drill.label}</h3>
                    <p className="text-xs text-gray-500">
                      {drill.kind === 'liquidity' ? 'Liquidity tier' : 'Asset class'} · {list.length} account
                      {list.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setDrill(null)}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-baseline justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
                  <span className="text-xs font-medium uppercase tracking-wider text-gray-400">Total</span>
                  <span className="text-lg font-bold text-gray-900">{fmtView(total)}</span>
                </div>
                <div className="flex-1 overflow-y-auto">
                  {list.length === 0 ? (
                    <div className="py-16 text-center text-sm text-gray-400">No accounts here.</div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {list.map((a) => (
                        <div key={a.accountId || a.account} className="flex items-baseline justify-between gap-3 px-5 py-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-900" title={a.account}>
                              {a.account}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {a.holder} · {a.assetClass} · {a.country}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={`text-sm font-semibold tabular-nums ${a.usdValue < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                              {fmtView(a.usdValue)}
                            </p>
                            <p className="text-xs tabular-nums text-gray-400">{fmtLocal(a.localBalance, a.currency)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}
