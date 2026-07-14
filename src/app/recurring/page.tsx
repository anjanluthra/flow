'use client'

import React, { useState, useEffect } from 'react'
import { Repeat, Calendar, TrendingUp, AlertTriangle, DollarSign } from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Recurring {
  merchant: string
  displayName: string
  categoryName: string | null
  categoryColor: string | null
  cadence: 'weekly' | 'monthly' | 'annual'
  typicalAmountUsd: number
  currency: string
  occurrences: number
  firstCharge: string
  lastCharge: string
  nextExpected: string
  monthlyCostUsd: number
  priceChangePct: number | null
}

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`
}

function fmtDate(d: string): string {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  })
}

const CADENCE_LABEL: Record<Recurring['cadence'], string> = {
  weekly: 'Weekly',
  monthly: 'Monthly',
  annual: 'Annual',
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function RecurringPage() {
  const [items, setItems] = useState<Recurring[]>([])
  const [totalMonthly, setTotalMonthly] = useState(0)
  const [totalAnnual, setTotalAnnual] = useState(0)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/recurring')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (cancelled) return
        setItems(d.recurring || [])
        setTotalMonthly(d.totalMonthlyUsd || 0)
        setTotalAnnual(d.totalAnnualUsd || 0)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const priceHikes = items.filter((i) => i.priceChangePct !== null && i.priceChangePct > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Recurring &amp; Subscriptions
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Detected automatically from your transaction history
          </p>
        </div>

        {/* Summary cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Recurring / month"
            value={fmt(totalMonthly)}
            subtitle={`${items.length} recurring charge${items.length !== 1 ? 's' : ''}`}
            icon={<Repeat className="h-5 w-5" />}
          />
          <Card
            title="Recurring / year"
            value={fmt(totalAnnual)}
            subtitle="annualised run-rate"
            icon={<Calendar className="h-5 w-5" />}
          />
          <Card
            title="Price increases"
            value={String(priceHikes.length)}
            subtitle="charges that have gone up"
            icon={<TrendingUp className="h-5 w-5 text-amber-500" />}
          />
          <Card
            title="Biggest"
            value={items[0] ? fmt(items[0].monthlyCostUsd) : '—'}
            subtitle={items[0] ? `${items[0].displayName}/mo` : 'no data yet'}
            icon={<DollarSign className="h-5 w-5" />}
          />
        </div>

        {/* Price-increase alert */}
        {priceHikes.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" />
              {priceHikes.length} recurring charge{priceHikes.length !== 1 ? 's have' : ' has'} increased in price
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {priceHikes.map((h) => (
                <span
                  key={h.merchant}
                  className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200"
                >
                  {h.displayName} +{h.priceChangePct}%
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                  <th className="px-4 py-3 font-medium text-gray-500">Merchant</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Category</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Cadence</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Typical</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Per month</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-500">Seen</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Last</th>
                  <th className="px-4 py-3 font-medium text-gray-500">Next due</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                      Loading…
                    </td>
                  </tr>
                ) : items.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-10 text-center text-gray-400">
                      No recurring charges detected yet — import a few months of statements and
                      they&apos;ll surface here.
                    </td>
                  </tr>
                ) : (
                  items.map((r) => (
                    <tr key={r.merchant} className="hover:bg-gray-50/50">
                      <td className="whitespace-nowrap px-4 py-3 font-medium capitalize text-gray-900">
                        {r.merchant}
                      </td>
                      <td className="px-4 py-3">
                        {r.categoryName ? (
                          <span className="inline-flex items-center gap-1.5 text-gray-600">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: r.categoryColor ?? '#94A3B8' }}
                            />
                            {r.categoryName}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          {CADENCE_LABEL[r.cadence]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {fmt(r.typicalAmountUsd)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-gray-900">
                        {fmt(r.monthlyCostUsd)}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums text-gray-500">
                        {r.occurrences}×
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {fmtDate(r.lastCharge)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                        {fmtDate(r.nextExpected)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {r.priceChangePct === null ? (
                          <span className="text-gray-300">—</span>
                        ) : (
                          <span className={r.priceChangePct > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                            {r.priceChangePct > 0 ? '+' : ''}
                            {r.priceChangePct}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-4 text-xs text-gray-400">
          Detection is heuristic — it groups charges by merchant and looks for a regular cadence.
          One-off purchases from a repeat merchant may occasionally appear; treat this as a prompt to
          review, not gospel.
        </p>
      </div>
    </div>
  )
}
