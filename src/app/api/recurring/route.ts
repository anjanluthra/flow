import { NextResponse } from 'next/server'
import { getTransactions } from '@/lib/db'
import { deriveMerchantPattern } from '@/lib/categories'

// ---------------------------------------------------------------------------
// GET /api/recurring — detect recurring charges / subscriptions
//
// Groups expenses by merchant, then looks for a regular cadence (weekly /
// monthly / annual) across 2+ charges. Flags price increases so a Netflix-style
// creep is visible. Purely derived from existing transactions — no config.
// ---------------------------------------------------------------------------

interface Charge {
  date: string
  amountUsd: number
  amountLocal: number
  currency: string
}

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

const DAY = 24 * 3600 * 1000

function daysBetween(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / DAY,
  )
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function classifyCadence(gaps: number[]): Recurring['cadence'] | null {
  if (gaps.length === 0) return null
  const m = median(gaps)
  if (m >= 5 && m <= 9) return 'weekly'
  if (m >= 25 && m <= 35) return 'monthly'
  if (m >= 350 && m <= 380) return 'annual'
  return null
}

const CADENCE_DAYS: Record<Recurring['cadence'], number> = {
  weekly: 7,
  monthly: 30,
  annual: 365,
}
const MONTHLY_FACTOR: Record<Recurring['cadence'], number> = {
  weekly: 52 / 12,
  monthly: 1,
  annual: 1 / 12,
}

function addDays(date: string, days: number): string {
  return new Date(new Date(date + 'T00:00:00').getTime() + days * DAY)
    .toISOString()
    .split('T')[0]
}

export async function GET() {
  try {
    const result = await getTransactions({ type: 'expense', limit: 5000 })

    // Group by merchant pattern.
    const groups = new Map<
      string,
      { charges: Charge[]; categoryName: string | null; categoryColor: string | null; sample: string }
    >()

    for (const row of result.rows) {
      if (row.is_internal_transfer) continue
      const desc = String(row.description ?? '')
      const pattern = deriveMerchantPattern(desc)
      if (!pattern || pattern.length < 3) continue

      const g = groups.get(pattern) ?? {
        charges: [] as Charge[],
        categoryName: row.category_name ?? null,
        categoryColor: row.category_color ?? null,
        sample: desc,
      }
      g.charges.push({
        date: String(row.date).slice(0, 10),
        amountUsd: row.amount_usd !== null ? Math.abs(parseFloat(row.amount_usd)) : 0,
        amountLocal: Math.abs(parseFloat(row.amount_local)),
        currency: row.currency,
      })
      groups.set(pattern, g)
    }

    const recurring: Recurring[] = []

    for (const [pattern, g] of groups) {
      if (g.charges.length < 2) continue
      const charges = g.charges.sort((a, b) => a.date.localeCompare(b.date))

      const gaps: number[] = []
      for (let i = 1; i < charges.length; i++) {
        gaps.push(daysBetween(charges[i - 1].date, charges[i].date))
      }
      const cadence = classifyCadence(gaps)
      if (!cadence) continue

      const amounts = charges.map((c) => c.amountUsd)
      const typical = median(amounts)
      const first = charges[0]
      const last = charges[charges.length - 1]

      // Price change: median of the first third vs the last charge.
      const early = median(amounts.slice(0, Math.max(1, Math.floor(amounts.length / 3))))
      const priceChangePct =
        early > 0 ? ((last.amountUsd - early) / early) * 100 : null

      recurring.push({
        merchant: pattern,
        displayName: g.sample,
        categoryName: g.categoryName,
        categoryColor: g.categoryColor,
        cadence,
        typicalAmountUsd: Math.round(typical),
        currency: last.currency,
        occurrences: charges.length,
        firstCharge: first.date,
        lastCharge: last.date,
        nextExpected: addDays(last.date, CADENCE_DAYS[cadence]),
        monthlyCostUsd: Math.round(typical * MONTHLY_FACTOR[cadence]),
        priceChangePct:
          priceChangePct !== null && Math.abs(priceChangePct) >= 1
            ? Math.round(priceChangePct)
            : null,
      })
    }

    recurring.sort((a, b) => b.monthlyCostUsd - a.monthlyCostUsd)

    const totalMonthly = recurring.reduce((s, r) => s + r.monthlyCostUsd, 0)

    return NextResponse.json({
      recurring,
      totalMonthlyUsd: totalMonthly,
      totalAnnualUsd: totalMonthly * 12,
    })
  } catch (error) {
    console.error('Failed to detect recurring charges:', error)
    return NextResponse.json({ error: 'Failed to detect recurring charges' }, { status: 500 })
  }
}
