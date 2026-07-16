'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { DollarSign, TrendingDown, TrendingUp, Wallet, Percent } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'

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
  investing: Line[]
  capitalEvents: CapitalEvent[]
  totals: {
    incomeByMonth: Record<string, Amt>
    expenseByMonth: Record<string, Amt>
    investingByMonth: Record<string, Amt>
    netByMonth: Record<string, Amt>
    netCashByMonth: Record<string, Amt>
    incomeTotal: Amt
    expenseTotal: Amt
    investingTotal: Amt
    net: Amt
    netCash: Amt
    savingsRate: number
    capital: { proceeds: Amt; costs: Amt; net: Amt }
  }
}

interface CapitalEvent {
  id: string
  name: string
  kind: string
  txnCount: number
  proceeds: Amt
  costs: Amt
  net: Amt
}

const KIND_LABEL: Record<string, string> = {
  asset_sale: 'Asset sale',
  inheritance: 'Inheritance',
  gift: 'Gift',
  other: 'One-off',
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
  // Operating (default) strips out capital events; Total folds them back in.
  const [view, setView] = useState<'operating' | 'total'>('operating')

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

  // Operating figures come straight from the P&L; the "total" figures fold the
  // non-operating capital events (asset sales & their costs) back in.
  const hasCapital = (pnl?.capitalEvents?.length ?? 0) > 0
  const capProceeds = pick(t?.capital.proceeds, currency)
  const capCosts = pick(t?.capital.costs, currency)
  const capNet = pick(t?.capital.net, currency)
  const opIncome = pick(t?.incomeTotal, currency)
  const opExpense = pick(t?.expenseTotal, currency)
  const opNet = pick(t?.net, currency)
  const opInvested = pick(t?.investingTotal, currency)
  const opSaved = pick(t?.netCash, currency)
  const totalIncome = opIncome + capProceeds
  const totalExpense = opExpense + capCosts
  const totalNet = opNet + capNet
  const totalSaved = opSaved + capNet
  const showTotal = view === 'total'

  // Drill-down: clicking a P&L cell opens the underlying transactions.
  const [drill, setDrill] = useState<{ category: string; from: string; to: string; label: string; eventId?: string } | null>(null)
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
  const openEventDrill = useCallback(
    (ev: CapitalEvent) => {
      setDrill({
        category: ev.name,
        eventId: ev.id,
        from,
        to,
        label: `${KIND_LABEL[ev.kind] ?? 'One-off'} · ${ev.name}`,
      })
    },
    [from, to],
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Monthly Cash Flow</h1>
          <p className="mt-1 text-sm text-gray-500">Income, expenses &amp; investing activities</p>
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
            <Select
              value={String(year)}
              onChange={(v) => setYear(Number(v))}
              options={YEARS.map((y) => ({ value: String(y), label: String(y) }))}
              ariaLabel="Year"
            />
          )}

          {mode === 'month' && (
            <Select
              value={String(month)}
              onChange={(v) => setMonth(Number(v))}
              options={MONTHS.map((m, i) => ({ value: String(i), label: m }))}
              ariaLabel="Month"
            />
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

          <div className="ml-auto flex flex-wrap items-center gap-3">
            {/* Operating vs Total (folds asset sales back in). Only meaningful
                when there are capital events in the range. */}
            {hasCapital && (
              <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm" title="Operating strips out asset sales; Total includes them">
                {(['operating', 'total'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                      view === v ? 'bg-violet-600 text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}

            {/* Currency toggle */}
            <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
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
          </div>

          {isLoading && <span className="animate-pulse text-xs text-blue-500">Loading…</span>}
        </div>

        {/* Summary cards — the headline follows the Operating/Total toggle; when
            there are asset sales, the counterpart figure is shown underneath so
            both numbers are always visible. */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Card
            title="Income"
            value={fmt(showTotal ? totalIncome : opIncome)}
            subtitle={hasCapital ? (showTotal ? `${fmt(opIncome)} operating` : `${fmt(totalIncome)} with asset sales`) : 'for the period'}
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
          />
          <Card
            title="Expenses"
            value={fmt(showTotal ? totalExpense : opExpense)}
            subtitle={hasCapital ? (showTotal ? `${fmt(opExpense)} operating` : `${fmt(totalExpense)} with sale costs`) : 'for the period'}
            icon={<TrendingDown className="h-5 w-5 text-red-500" />}
          />
          <Card
            title={showTotal ? 'Net (Total)' : 'Net Operating'}
            value={fmt(showTotal ? totalNet : opNet)}
            subtitle={hasCapital ? (showTotal ? `${fmt(opNet)} operating` : `${fmt(totalNet)} with asset sales`) : 'income − expenses'}
            icon={<Wallet className="h-5 w-5 text-blue-500" />}
          />
          <Card title="Invested" value={fmt(opInvested)} subtitle="capital deployed" icon={<TrendingUp className="h-5 w-5 text-indigo-500" />} />
          <Card
            title="Saved"
            value={fmt(showTotal ? totalSaved : opSaved)}
            subtitle={hasCapital && showTotal ? `${fmt(opSaved)} operating` : 'operating − investing'}
            icon={<Percent className="h-5 w-5 text-purple-500" />}
          />
        </div>

        {/* P&L statement */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="sticky left-0 z-20 bg-gray-50 px-4 py-3 font-medium text-gray-500">Category</th>
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
                {!pnl || (pnl.income.length === 0 && pnl.expense.length === 0 && pnl.investing.length === 0 && pnl.capitalEvents.length === 0) ? (
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

                    <TotalRow label={pnl.investing.length > 0 ? 'Net Operating' : 'Net Cash Flow'} byMonth={t!.netByMonth} total={t!.net} months={months} showMonthCols={showMonthCols} tone="net" currency={currency} fmt={fmt} />

                    {pnl.investing.length > 0 && (
                      <>
                        <SectionRow label="Investing" span={months.length} showMonthCols={showMonthCols} tone="investing" />
                        {pnl.investing.map((l) => (
                          <LineRow key={`v-${l.category}`} line={l} months={months} showMonthCols={showMonthCols} currency={currency} fmt={fmt} onDrill={openDrill} />
                        ))}
                        <TotalRow label="Total Invested" byMonth={t!.investingByMonth} total={t!.investingTotal} months={months} showMonthCols={showMonthCols} tone="investing" currency={currency} fmt={fmt} />

                        <TotalRow label="Net Cash Flow" byMonth={t!.netCashByMonth} total={t!.netCash} months={months} showMonthCols={showMonthCols} tone="netcash" currency={currency} fmt={fmt} />
                      </>
                    )}

                    {/* Non-operating: asset sales, inheritance, gifts. Each event
                        nets its proceeds against its own costs. Kept out of the
                        operating figures above and totalled back in below. */}
                    {hasCapital && (
                      <>
                        <SectionRow label="Asset sales & one-offs" span={months.length} showMonthCols={showMonthCols} tone="capital" />
                        {pnl.capitalEvents.map((e) => (
                          <EventRow key={`c-${e.id}`} event={e} months={months} showMonthCols={showMonthCols} currency={currency} fmt={fmt} onDrill={openEventDrill} />
                        ))}
                        <TotalRow
                          label="Total Cash Flow (incl. asset sales)"
                          byMonth={{}}
                          total={{ usd: t!.netCash.usd + t!.capital.net.usd, gbp: t!.netCash.gbp + t!.capital.net.gbp }}
                          months={months}
                          showMonthCols={showMonthCols}
                          tone="netcash"
                          currency={currency}
                          fmt={fmt}
                        />
                      </>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Figures shown in {currency}. GBP uses each transaction&rsquo;s recorded pound amount where
          available. Income and expenses form the operating section; cash put into the
          &ldquo;Investments&rdquo; category is shown separately as investing activity and subtracted to give
          Net Cash Flow. Internal transfers and credit-card payments are excluded (they net to zero).
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
  eventId: string | null
}

interface EventOption {
  id: string
  name: string
  kind: string
}

interface DrillCat {
  id: string
  name: string
  type: 'income' | 'expense' | 'transfer' | 'investment'
  color?: string
}

function DrillDrawer({
  drill,
  currency,
  onClose,
  onChanged,
}: {
  drill: { category: string; from: string; to: string; label: string; eventId?: string } | null
  currency: Currency
  onClose: () => void
  onChanged: () => void
}) {
  const [txns, setTxns] = useState<DrillTxn[]>([])
  const [loading, setLoading] = useState(false)
  const [cats, setCats] = useState<DrillCat[]>([])
  const [events, setEvents] = useState<EventOption[]>([])
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/categories')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setCats(d.categories || []))
      .catch(() => {})
  }, [])

  const reloadEvents = useCallback(() => {
    fetch('/api/events')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setEvents(d.events || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    reloadEvents()
  }, [reloadEvents])

  const loadTxns = useCallback(async () => {
    if (!drill) return
    setLoading(true)
    // An event drill lists everything assigned to the event; a category drill
    // lists that category's transactions in the range.
    const qs = drill.eventId
      ? new URLSearchParams({ eventId: drill.eventId, from: drill.from, to: drill.to, limit: '1000' })
      : new URLSearchParams({ categoryName: drill.category, from: drill.from, to: drill.to, limit: '1000' })
    try {
      const r = await fetch(`/api/transactions?${qs.toString()}`)
      if (!r.ok) throw new Error()
      const d = await r.json()
      const list: DrillTxn[] = d.transactions || []
      // A category drill mirrors an operating P&L line, which excludes anything
      // assigned to a capital event — so hide those here too; they surface in
      // the event's own drill instead.
      setTxns(drill.eventId ? list : list.filter((tx) => !tx.eventId))
    } catch {
      setTxns([])
    } finally {
      setLoading(false)
    }
  }, [drill])

  useEffect(() => {
    if (!drill) {
      setTxns([])
      return
    }
    setTxns([])
    loadTxns()
  }, [drill, loadTxns])

  const expenseCats = cats.filter((c) => c.type === 'expense')
  const incomeCats = cats.filter((c) => c.type === 'income')
  const transferCats = cats.filter((c) => c.type === 'transfer')
  const investmentCats = cats.filter((c) => c.type === 'investment')

  // Assign (or clear, with null) the capital event a transaction belongs to.
  async function assignEvent(tx: DrillTxn, eventId: string | null) {
    if ((tx.eventId ?? null) === eventId) return
    setSavingId(tx.id)
    try {
      await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      })
      onChanged() // refresh the P&L behind the drawer
      await loadTxns()
      reloadEvents()
    } finally {
      setSavingId(null)
    }
  }

  async function createEventAndAssign(tx: DrillTxn) {
    const name = window.prompt('New event name (e.g. House sale, Car sale, Inheritance)')
    if (!name || !name.trim()) return
    setSavingId(tx.id)
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), kind: 'asset_sale' }),
      })
      const d = await res.json()
      if (d.event?.id) {
        await fetch(`/api/transactions/${tx.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventId: d.event.id }),
        })
        onChanged()
        await loadTxns()
        reloadEvents()
      }
    } finally {
      setSavingId(null)
    }
  }

  async function reclassify(tx: DrillTxn, newName: string) {
    if (!drill || newName === tx.categoryName) return
    const cat = cats.find((c) => c.name === newName)
    if (!cat) return
    setSavingId(tx.id)
    // In a category drill the row is leaving this list, so drop it for a snappy
    // feel; in an event drill it stays (only its category changes), so we just
    // reload below.
    if (!drill.eventId) setTxns((prev) => prev.filter((t) => t.id !== tx.id))
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
      if (drill.eventId) await loadTxns()
    } catch {
      // Put it back if the save failed.
      if (!drill.eventId) setTxns((prev) => [tx, ...prev])
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
                    <Select
                      value={tx.categoryName}
                      onChange={(v) => reclassify(tx, v)}
                      searchable
                      ariaLabel="Reclassify"
                      buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 hover:bg-gray-50"
                      options={[
                        ...expenseCats.map((c) => ({ value: c.name, label: c.name, group: 'Expenses', color: c.color })),
                        ...incomeCats.map((c) => ({ value: c.name, label: c.name, group: 'Income', color: c.color })),
                        ...investmentCats.map((c) => ({ value: c.name, label: c.name, group: 'Investments', color: c.color })),
                        ...transferCats.map((c) => ({ value: c.name, label: c.name, group: 'Transfers', color: c.color })),
                      ]}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="shrink-0 text-[11px] uppercase tracking-wide text-gray-300">Event</span>
                    <Select
                      value={tx.eventId ?? ''}
                      onChange={(v) => assignEvent(tx, v || null)}
                      ariaLabel="Assign to a capital event"
                      buttonClassName="inline-flex h-8 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-700 hover:bg-gray-50"
                      options={[
                        { value: '', label: 'Operating (no event)' },
                        ...events.map((e) => ({ value: e.id, label: `${e.name} · ${(KIND_LABEL[e.kind] ?? 'One-off').toLowerCase()}`, group: 'Events' })),
                      ]}
                      actions={[{ label: '＋ New event…', onSelect: () => createEventAndAssign(tx) }]}
                    />
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

function SectionRow({ label, span, showMonthCols, tone }: { label: string; span: number; showMonthCols: boolean; tone: 'income' | 'expense' | 'investing' | 'capital' }) {
  const color =
    tone === 'income'
      ? 'text-emerald-600'
      : tone === 'investing'
        ? 'text-indigo-600'
        : tone === 'capital'
          ? 'text-violet-600'
          : 'text-rose-600'
  return (
    <tr className="bg-gray-50">
      <td className={`sticky left-0 z-10 bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wider ${color}`}>
        {label}
      </td>
      <td colSpan={(showMonthCols ? span : 0) + 1} className="bg-gray-50" />
    </tr>
  )
}

// A capital event row — no monthly breakdown (events are period totals), so the
// month columns show a dot and the net lands in the Total column, drillable to
// the underlying transactions.
function EventRow({
  event,
  months,
  showMonthCols,
  currency,
  fmt,
  onDrill,
}: {
  event: CapitalEvent
  months: string[]
  showMonthCols: boolean
  currency: Currency
  fmt: (n: number) => string
  onDrill: (event: CapitalEvent) => void
}) {
  const net = pick(event.net, currency)
  return (
    <tr className="hover:bg-gray-50/50">
      <td className="sticky left-0 z-10 bg-white px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-violet-400" />
          <span className="text-gray-700">{event.name}</span>
          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-600">
            {KIND_LABEL[event.kind] ?? 'One-off'}
          </span>
        </div>
      </td>
      {showMonthCols && months.map((ym) => (
        <td key={ym} className="px-4 py-2.5 text-right text-gray-300">·</td>
      ))}
      <td className="px-4 py-2.5 text-right font-medium tabular-nums text-gray-900">
        <button
          onClick={() => onDrill(event)}
          className="rounded px-1 font-medium tabular-nums text-gray-900 hover:bg-blue-50 hover:text-blue-700 hover:underline"
          title="See transactions"
        >
          {fmt(net)}
        </button>
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
  tone: 'income' | 'expense' | 'net' | 'investing' | 'netcash'
  currency: Currency
  fmt: (n: number) => string
}) {
  const totalVal = pick(total, currency)
  const color =
    tone === 'net' || tone === 'netcash'
      ? totalVal >= 0 ? 'text-emerald-700' : 'text-rose-700'
      : tone === 'income' ? 'text-emerald-700' : tone === 'investing' ? 'text-indigo-700' : 'text-rose-700'
  const bg = tone === 'net' || tone === 'netcash' ? 'bg-blue-50/70 border-t-2 border-gray-300' : 'bg-gray-50/70'
  // Solid background for the frozen first cell so scrolled numbers can't show through.
  const stickyBg = tone === 'net' || tone === 'netcash' ? 'bg-blue-50 border-t-2 border-gray-300' : 'bg-gray-50'
  return (
    <tr className={`font-semibold ${bg}`}>
      <td className={`sticky left-0 z-10 px-4 py-2.5 ${stickyBg} ${color}`}>{label}</td>
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
