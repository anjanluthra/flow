'use client'

import React, { useState } from 'react'
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
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  PiggyBank,
  Percent,
  BarChart3,
} from 'lucide-react'
import { Card } from '@/components/ui/Card'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MonthlyDatum {
  month: string
  dining: number
  groceries: number
  health: number
  car: number
  bills: number
  shopping: number
  subscriptions: number
  entertainment: number
  travel: number
  other: number
}

interface CategoryRow {
  name: string
  amount: number
  color: string
  percentage: number
}

type Holder = 'All' | 'Anjan' | 'Kate' | 'Joint'

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const monthlyData: MonthlyDatum[] = [
  { month: 'Jan', dining: 420, groceries: 680, health: 150, car: 320, bills: 1200, shopping: 450, subscriptions: 120, entertainment: 200, travel: 0, other: 380 },
  { month: 'Feb', dining: 380, groceries: 720, health: 80, car: 280, bills: 1200, shopping: 320, subscriptions: 120, entertainment: 150, travel: 1200, other: 350 },
  { month: 'Mar', dining: 510, groceries: 650, health: 220, car: 340, bills: 1200, shopping: 580, subscriptions: 120, entertainment: 310, travel: 0, other: 290 },
  { month: 'Apr', dining: 390, groceries: 710, health: 90, car: 300, bills: 1200, shopping: 270, subscriptions: 120, entertainment: 180, travel: 800, other: 420 },
  { month: 'May', dining: 460, groceries: 690, health: 140, car: 350, bills: 1200, shopping: 390, subscriptions: 130, entertainment: 250, travel: 0, other: 310 },
  { month: 'Jun', dining: 440, groceries: 700, health: 160, car: 310, bills: 1200, shopping: 480, subscriptions: 130, entertainment: 220, travel: 500, other: 360 },
]

const categoryBreakdown: CategoryRow[] = [
  { name: 'Bills & Utilities', amount: 1200, color: '#64748B', percentage: 22.7 },
  { name: 'Groceries', amount: 700, color: '#84CC16', percentage: 13.3 },
  { name: 'Travel', amount: 500, color: '#A855F7', percentage: 9.5 },
  { name: 'Shopping', amount: 480, color: '#3B82F6', percentage: 9.1 },
  { name: 'Dining & Coffee', amount: 440, color: '#F97316', percentage: 8.3 },
  { name: 'Other', amount: 360, color: '#6B7280', percentage: 6.8 },
  { name: 'Car & Transport', amount: 310, color: '#EF4444', percentage: 5.9 },
  { name: 'Entertainment', amount: 220, color: '#EC4899', percentage: 4.2 },
  { name: 'Health & Fitness', amount: 160, color: '#14B8A6', percentage: 3.0 },
  { name: 'Subscriptions', amount: 130, color: '#8B5CF6', percentage: 2.5 },
]

const incomeBreakdown: CategoryRow[] = [
  { name: 'Salary', amount: 7500, color: '#10B981', percentage: 88.8 },
  { name: 'Bank Interest', amount: 450, color: '#059669', percentage: 5.3 },
  { name: 'Dividends', amount: 350, color: '#0D9488', percentage: 4.1 },
  { name: 'Cashback', amount: 150, color: '#0891B2', percentage: 1.8 },
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

const YEARS = [2023, 2024, 2025, 2026] as const

const HOLDERS: Holder[] = ['All', 'Anjan', 'Kate', 'Joint']

const CATEGORY_COLORS: Record<string, string> = {
  dining: '#F97316',
  groceries: '#84CC16',
  health: '#14B8A6',
  car: '#EF4444',
  bills: '#64748B',
  shopping: '#3B82F6',
  subscriptions: '#8B5CF6',
  entertainment: '#EC4899',
  travel: '#A855F7',
  other: '#6B7280',
}

const CATEGORY_LABELS: Record<string, string> = {
  dining: 'Dining & Coffee',
  groceries: 'Groceries',
  health: 'Health & Fitness',
  car: 'Car & Transport',
  bills: 'Bills & Utilities',
  shopping: 'Shopping',
  subscriptions: 'Subscriptions',
  entertainment: 'Entertainment',
  travel: 'Travel',
  other: 'Other',
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

interface TooltipPayloadEntry {
  name: string
  value: number
  color: string
  dataKey: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: TooltipPayloadEntry[]
  label?: string
}

function CustomBarTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const total = payload.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
      <p className="mb-2 text-sm font-semibold text-gray-900">{label}</p>
      <div className="space-y-1">
        {payload
          .filter((entry) => entry.value > 0)
          .sort((a, b) => b.value - a.value)
          .map((entry) => (
            <div key={entry.dataKey} className="flex items-center justify-between gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-gray-600">
                  {CATEGORY_LABELS[entry.dataKey] ?? entry.name}
                </span>
              </div>
              <span className="font-medium text-gray-900">
                ${entry.value.toLocaleString()}
              </span>
            </div>
          ))}
      </div>
      <div className="mt-2 border-t border-gray-100 pt-2">
        <div className="flex items-center justify-between text-sm font-semibold text-gray-900">
          <span>Total</span>
          <span>${total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category table component
// ---------------------------------------------------------------------------

function CategoryTable({
  title,
  rows,
}: {
  title: string
  rows: CategoryRow[]
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-base font-semibold text-gray-900">{title}</h3>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.name} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span className="text-sm text-gray-700">{row.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-gray-900">
                ${row.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span className="w-12 text-right text-xs text-gray-400">
                {row.percentage}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth())
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear())
  const [holder, setHolder] = useState<Holder>('All')

  return (
    <div className="min-h-screen bg-gray-50 font-[Inter,sans-serif]">
      <div className="mx-auto max-w-7xl px-6 py-10">
        {/* ----------------------------------------------------------------- */}
        {/* Page header                                                        */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Profit &amp; Loss Overview
          </p>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Filters bar                                                        */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-8 flex flex-wrap items-center gap-4">
          {/* Month selector */}
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

          {/* Year selector */}
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

          {/* Holder pills */}
          <div className="flex gap-2">
            {HOLDERS.map((h) => (
              <button
                key={h}
                onClick={() => setHolder(h)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  holder === h
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-100'
                }`}
              >
                {h}
              </button>
            ))}
          </div>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Summary cards                                                      */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            title="Total Income"
            value="$8,450.00"
            change={3.2}
            subtitle="vs last month"
            icon={<DollarSign className="h-5 w-5 text-green-500" />}
          />
          <Card
            title="Total Spending"
            value="$5,280.00"
            change={-1.5}
            subtitle="vs last month"
            icon={<TrendingDown className="h-5 w-5 text-red-500" />}
          />
          <Card
            title="Net Savings"
            value="$3,170.00"
            subtitle="income minus spending"
            icon={<PiggyBank className="h-5 w-5 text-blue-500" />}
          />
          <Card
            title="Savings Rate"
            value="37.5%"
            subtitle="of total income"
            icon={<Percent className="h-5 w-5 text-purple-500" />}
          />
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Spending bar chart                                                 */}
        {/* ----------------------------------------------------------------- */}
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <BarChart3 className="h-5 w-5 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">
              Monthly Spending Breakdown
            </h2>
          </div>

          <ResponsiveContainer width="100%" height={400}>
            <BarChart
              data={monthlyData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#E5E7EB"
              />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: '#6B7280' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 13, fill: '#6B7280' }}
                tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
              />
              <Tooltip content={<CustomBarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => (
                  <span className="text-xs text-gray-600">
                    {CATEGORY_LABELS[value] ?? value}
                  </span>
                )}
                wrapperStyle={{ paddingTop: 16 }}
              />
              {Object.keys(CATEGORY_COLORS).map((key) => (
                <Bar
                  key={key}
                  dataKey={key}
                  stackId="spending"
                  fill={CATEGORY_COLORS[key]}
                  radius={key === 'other' ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Category breakdown tables                                          */}
        {/* ----------------------------------------------------------------- */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CategoryTable title="Spending by Category" rows={categoryBreakdown} />
          <CategoryTable title="Income by Source" rows={incomeBreakdown} />
        </div>
      </div>
    </div>
  )
}
