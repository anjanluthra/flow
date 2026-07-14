'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, Percent, Banknote, Plus, Save, Trash2 } from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Investment {
  id: string
  name: string
  accountName: string | null
  assetClass: string
  currency: string
  units: number | null
  costBasisLocal: number
  costBasisUsd: number
  currentValueUsd: number
  annualCashflowUsd: number
  purchaseDate: string | null
  notes: string | null
}

interface EditRow {
  costBasisUsd: string
  currentValueUsd: string
  annualCashflowUsd: string
  purchaseDate: string
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

function yearsBetween(from: string, to: Date): number {
  const start = new Date(from + 'T00:00:00')
  return (to.getTime() - start.getTime()) / (365.25 * 24 * 3600 * 1000)
}

// ---------------------------------------------------------------------------
// Per-position metrics
// ---------------------------------------------------------------------------

function metrics(inv: Investment) {
  const gain = inv.currentValueUsd - inv.costBasisUsd
  const returnPct = inv.costBasisUsd > 0 ? (gain / inv.costBasisUsd) * 100 : null
  const yieldPct =
    inv.currentValueUsd > 0 ? (inv.annualCashflowUsd / inv.currentValueUsd) * 100 : null

  let annualizedPct: number | null = null
  if (inv.costBasisUsd > 0 && inv.purchaseDate && inv.currentValueUsd > 0) {
    const years = yearsBetween(inv.purchaseDate, new Date())
    if (years > 0.1) {
      annualizedPct = (Math.pow(inv.currentValueUsd / inv.costBasisUsd, 1 / years) - 1) * 100
    }
  }

  return { gain, returnPct, yieldPct, annualizedPct }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvestingPage() {
  const [investments, setInvestments] = useState<Investment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [edits, setEdits] = useState<Record<string, EditRow>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newClass, setNewClass] = useState('equities')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/investments')
      const data = await res.json()
      setInvestments(data.investments || [])
    } catch {
      setInvestments([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ---- Portfolio totals ----
  const totals = useMemo(() => {
    const cost = investments.reduce((s, i) => s + i.costBasisUsd, 0)
    const value = investments.reduce((s, i) => s + i.currentValueUsd, 0)
    const cashflow = investments.reduce((s, i) => s + i.annualCashflowUsd, 0)
    const gain = value - cost
    return {
      cost,
      value,
      cashflow,
      gain,
      returnPct: cost > 0 ? (gain / cost) * 100 : null,
      yieldPct: value > 0 ? (cashflow / value) * 100 : null,
    }
  }, [investments])

  const allocation = useMemo(() => {
    const byClass: Record<string, number> = {}
    for (const inv of investments) {
      byClass[inv.assetClass] = (byClass[inv.assetClass] || 0) + inv.currentValueUsd
    }
    return Object.entries(byClass)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({
        name,
        value: Math.round(value),
        color: ASSET_CLASS_COLORS[name] || '#94A3B8',
      }))
  }, [investments])

  // ---- Editing ----
  function startEditing() {
    const seeded: Record<string, EditRow> = {}
    for (const inv of investments) {
      seeded[inv.id] = {
        costBasisUsd: String(inv.costBasisUsd),
        currentValueUsd: String(inv.currentValueUsd),
        annualCashflowUsd: String(inv.annualCashflowUsd),
        purchaseDate: inv.purchaseDate ?? '',
      }
    }
    setEdits(seeded)
    setIsEditing(true)
  }

  async function saveEdits() {
    setIsSaving(true)
    try {
      const num = (v: string) => {
        const n = parseFloat(v)
        return isNaN(n) ? 0 : n
      }
      await Promise.all(
        investments.map((inv) => {
          const e = edits[inv.id]
          if (!e) return Promise.resolve()
          return fetch(`/api/investments/${inv.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              costBasisUsd: num(e.costBasisUsd),
              currentValueUsd: num(e.currentValueUsd),
              annualCashflowUsd: num(e.annualCashflowUsd),
              purchaseDate: e.purchaseDate || null,
            }),
          })
        }),
      )
      setIsEditing(false)
      await load()
    } finally {
      setIsSaving(false)
    }
  }

  async function addInvestment() {
    if (!newName.trim()) return
    await fetch('/api/investments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), assetClass: newClass }),
    })
    setNewName('')
    setShowAdd(false)
    await load()
  }

  async function removeInvestment(id: string) {
    await fetch(`/api/investments/${id}`, { method: 'DELETE' })
    await load()
  }

  const setEdit = (id: string, field: keyof EditRow, value: string) =>
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], [field]: value } }))

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Investing</h1>
            <p className="mt-1 text-sm text-gray-500">
              Positions, cost basis, returns &amp; cash flow
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isEditing ? (
              <>
                <button
                  onClick={saveEdits}
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Save className="h-3.5 w-3.5" />
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setIsEditing(false)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setShowAdd((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Position
                </button>
                <button
                  onClick={startEditing}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  Update Values
                </button>
              </>
            )}
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
            <input
              type="text"
              placeholder="Position name (e.g. IBKR VOO)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-64 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            />
            <select
              value={newClass}
              onChange={(e) => setNewClass(e.target.value)}
              className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="equities">Equities</option>
              <option value="private_equity">Private Equity</option>
              <option value="private_debt">Private Debt</option>
              <option value="crypto">Crypto</option>
              <option value="cash">Cash</option>
            </select>
            <button
              onClick={addInvestment}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Add
            </button>
          </div>
        )}

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Portfolio Value"
            value={fmt(totals.value)}
            subtitle={`Cost basis ${fmt(totals.cost)}`}
            icon={<DollarSign className="h-5 w-5" />}
          />
          <Card
            title="Total Return"
            value={fmt(totals.gain)}
            change={totals.returnPct ?? undefined}
            subtitle={totals.returnPct === null ? 'set cost bases to compute' : 'vs cost basis'}
            icon={<TrendingUp className="h-5 w-5" />}
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
        </div>

        {/* Positions table */}
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">Positions</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Position</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Class</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Purchased</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Cost Basis</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Current Value</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Return $</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Return %</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Ann. %</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Cash Flow</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Yield %</th>
                  {isEditing && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : investments.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-10 text-center text-gray-400">
                      No positions yet — run migration 005 or add one above.
                    </td>
                  </tr>
                ) : (
                  investments.map((inv) => {
                    const m = metrics(inv)
                    const e = edits[inv.id]
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50/50">
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-900">
                          {inv.name}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: `${ASSET_CLASS_COLORS[inv.assetClass] || '#94A3B8'}18`,
                              color: ASSET_CLASS_COLORS[inv.assetClass] || '#64748B',
                            }}
                          >
                            {inv.assetClass}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {isEditing ? (
                            <input
                              type="date"
                              value={e?.purchaseDate ?? ''}
                              onChange={(ev) => setEdit(inv.id, 'purchaseDate', ev.target.value)}
                              className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                            />
                          ) : (
                            inv.purchaseDate?.slice(0, 10) ?? '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {isEditing ? (
                            <input
                              type="text"
                              value={e?.costBasisUsd ?? ''}
                              onChange={(ev) => setEdit(inv.id, 'costBasisUsd', ev.target.value)}
                              className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                            />
                          ) : inv.costBasisUsd > 0 ? (
                            fmt(inv.costBasisUsd)
                          ) : (
                            <span className="text-amber-500">set</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">
                          {isEditing ? (
                            <input
                              type="text"
                              value={e?.currentValueUsd ?? ''}
                              onChange={(ev) => setEdit(inv.id, 'currentValueUsd', ev.target.value)}
                              className="w-24 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                            />
                          ) : (
                            fmt(inv.currentValueUsd)
                          )}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${
                            inv.costBasisUsd > 0
                              ? m.gain >= 0
                                ? 'text-emerald-600'
                                : 'text-red-600'
                              : 'text-gray-300'
                          }`}
                        >
                          {inv.costBasisUsd > 0 ? fmt(m.gain) : '—'}
                        </td>
                        <td
                          className={`px-4 py-3 text-right tabular-nums ${
                            m.returnPct === null
                              ? 'text-gray-300'
                              : m.returnPct >= 0
                                ? 'text-emerald-600'
                                : 'text-red-600'
                          }`}
                        >
                          {m.returnPct !== null ? `${m.returnPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {m.annualizedPct !== null ? `${m.annualizedPct.toFixed(1)}%` : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {isEditing ? (
                            <input
                              type="text"
                              value={e?.annualCashflowUsd ?? ''}
                              onChange={(ev) => setEdit(inv.id, 'annualCashflowUsd', ev.target.value)}
                              className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right text-sm"
                            />
                          ) : inv.annualCashflowUsd > 0 ? (
                            fmt(inv.annualCashflowUsd)
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {m.yieldPct !== null && m.yieldPct > 0 ? `${m.yieldPct.toFixed(2)}%` : '—'}
                        </td>
                        {isEditing && (
                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => removeInvestment(inv.id)}
                              title="Remove position"
                              className="rounded-md p-1 text-gray-300 hover:bg-red-50 hover:text-red-500"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    )
                  })
                )}
              </tbody>
              {investments.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-100 font-bold text-gray-900">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.value)}</td>
                    <td className={`px-4 py-3 text-right tabular-nums ${totals.gain >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {totals.cost > 0 ? fmt(totals.gain) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totals.returnPct !== null ? `${totals.returnPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3" />
                    <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.cashflow)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {totals.yieldPct !== null ? `${totals.yieldPct.toFixed(2)}%` : '—'}
                    </td>
                    {isEditing && <td className="px-4 py-3" />}
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
