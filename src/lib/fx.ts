import { query } from '@/lib/db'
import { DEFAULT_FX_RATES } from '@/lib/currency'

// ---------------------------------------------------------------------------
// Live FX rates (server-side)
//
// Strategy: rates are cached per-day in the fx_rates table. On the first
// request of the day we fetch live rates from open.er-api.com (keyless, 160+
// currencies, refreshed daily) and upsert them. If the live fetch fails we
// fall back to the most recent cached rates, then to the static defaults —
// so a conversion always succeeds.
// ---------------------------------------------------------------------------

/** Currencies we actively track. Extend as new accounts appear. */
const TRACKED = ['AED', 'GBP', 'EUR', 'INR']

export interface FxResult {
  /** Map of `${FROM}_USD` -> rate (multiply local by this to get USD). */
  rates: Record<string, number>
  date: string
  source: 'live' | 'cache' | 'fallback'
}

async function readCachedRates(todayOnly: boolean): Promise<Record<string, number>> {
  const result = await query(
    todayOnly
      ? `SELECT from_currency, rate FROM fx_rates
         WHERE to_currency = 'USD' AND effective_date = CURRENT_DATE`
      : `SELECT DISTINCT ON (from_currency) from_currency, rate
         FROM fx_rates
         WHERE to_currency = 'USD'
         ORDER BY from_currency, effective_date DESC`,
  )
  const rates: Record<string, number> = { USD_USD: 1 }
  for (const row of result.rows) {
    rates[`${row.from_currency}_USD`] = parseFloat(row.rate)
  }
  return rates
}

function hasTracked(rates: Record<string, number>): boolean {
  return TRACKED.every((c) => rates[`${c}_USD`] !== undefined)
}

async function fetchLiveRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD', {
      // Rates refresh daily; don't let Next cache a failed/stale body longer.
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    if (data?.result !== 'success' || !data?.rates) return null

    // API returns units of currency per 1 USD; we store USD per 1 unit.
    const rates: Record<string, number> = { USD_USD: 1 }
    for (const c of TRACKED) {
      const perUsd = data.rates[c]
      if (typeof perUsd === 'number' && perUsd > 0) {
        rates[`${c}_USD`] = 1 / perUsd
      }
    }
    return hasTracked(rates) ? rates : null
  } catch {
    return null
  }
}

async function cacheRates(rates: Record<string, number>): Promise<void> {
  for (const [key, rate] of Object.entries(rates)) {
    const from = key.replace('_USD', '')
    if (from === 'USD') continue
    await query(
      `INSERT INTO fx_rates (from_currency, to_currency, rate, effective_date)
       VALUES ($1, 'USD', $2, CURRENT_DATE)
       ON CONFLICT (from_currency, to_currency, effective_date)
       DO UPDATE SET rate = EXCLUDED.rate`,
      [from, rate],
    )
  }
}

/**
 * Get today's USD conversion rates, fetching live and caching if needed.
 */
export async function getUsdRates(): Promise<FxResult> {
  const today = new Date().toISOString().split('T')[0]

  // 1. Today's cached rates.
  try {
    const cached = await readCachedRates(true)
    if (hasTracked(cached)) {
      return { rates: cached, date: today, source: 'cache' }
    }
  } catch {
    // DB unavailable — try live below.
  }

  // 2. Live fetch + cache.
  const live = await fetchLiveRates()
  if (live) {
    try {
      await cacheRates(live)
    } catch {
      // Caching is best-effort.
    }
    return { rates: live, date: today, source: 'live' }
  }

  // 3. Most recent cached rates from any prior day.
  try {
    const stale = await readCachedRates(false)
    if (hasTracked(stale)) {
      return { rates: stale, date: today, source: 'cache' }
    }
  } catch {
    // fall through
  }

  // 4. Static defaults — conversions always succeed.
  return { rates: { ...DEFAULT_FX_RATES }, date: today, source: 'fallback' }
}
