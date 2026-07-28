import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query } from '@/lib/db'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/admin/seed-current — persist the current balance sheet as a real
// snapshot dated 1 June 2026. This is the household's live/latest set of
// numbers (the detailed account table). It:
//   • ensures each net-worth account exists with the correct metadata
//     (holder, country, currency, asset class, liquidity, corporate flag —
//      e.g. Corporate Cash Balance is AE and corporate),
//   • ensures the Barclaycard credit card exists so its statements are filable,
//   • writes a balance_snapshots row per account for 2026-06-01.
// Idempotent: safe to run again (upserts by name and by (account, date)).
// Historic graph markers (net_worth_snapshots) are left untouched.
// ---------------------------------------------------------------------------

const SNAPSHOT_DATE = '2026-06-01'

interface Row {
  name: string
  institution: string
  country: string
  currency: string
  holder: 'anjan' | 'kate' | 'joint'
  assetClass: 'cash' | 'equities' | 'private_equity' | 'private_debt' | 'crypto' | 'car' | 'debt'
  liquidity: 't1_instant' | 't2_days' | 't2_5_locked' | 't3_locked_years'
  isCorporate: boolean
  local: number
  usd: number
  yieldPct: number
  annualCashflow: number
}

// The current balance sheet (as of 1 June 2026).
const CURRENT: Row[] = [
  { name: 'FAB iSavings Account', institution: 'FAB', country: 'AE', currency: 'AED', holder: 'joint', assetClass: 'cash', liquidity: 't1_instant', isCorporate: false, local: 1933546.05, usd: 526493, yieldPct: 3.5, annualCashflow: 18427 },
  { name: 'FAB Current Account', institution: 'FAB', country: 'AE', currency: 'AED', holder: 'joint', assetClass: 'cash', liquidity: 't1_instant', isCorporate: false, local: 100050.19, usd: 27243, yieldPct: 0, annualCashflow: 0 },
  { name: 'FAB 3% FD', institution: 'FAB', country: 'AE', currency: 'AED', holder: 'joint', assetClass: 'cash', liquidity: 't2_5_locked', isCorporate: false, local: 100000, usd: 27229, yieldPct: 3.0, annualCashflow: 817 },
  { name: 'FAB Elite Card Debt', institution: 'FAB', country: 'AE', currency: 'AED', holder: 'joint', assetClass: 'debt', liquidity: 't1_instant', isCorporate: false, local: -30000, usd: -8169, yieldPct: 0, annualCashflow: 0 },
  { name: 'HSBC Jersey', institution: 'HSBC', country: 'JE', currency: 'USD', holder: 'joint', assetClass: 'cash', liquidity: 't2_5_locked', isCorporate: false, local: 299000, usd: 299000, yieldPct: 4.5, annualCashflow: 6728 },
  { name: 'Hargreaves S&P Pension', institution: 'Hargreaves Lansdown', country: 'US', currency: 'GBP', holder: 'anjan', assetClass: 'equities', liquidity: 't3_locked_years', isCorporate: false, local: 21418, usd: 28336, yieldPct: 0, annualCashflow: 0 },
  { name: 'Axis FD', institution: 'Axis', country: 'IN', currency: 'USD', holder: 'anjan', assetClass: 'cash', liquidity: 't2_5_locked', isCorporate: false, local: 0, usd: 0, yieldPct: 6.0, annualCashflow: 0 },
  { name: 'Wio Personal (Anjan)', institution: 'Wio', country: 'AE', currency: 'AED', holder: 'anjan', assetClass: 'cash', liquidity: 't1_instant', isCorporate: false, local: 27653, usd: 7530, yieldPct: 0, annualCashflow: 0 },
  { name: 'Wio Personal (Kate)', institution: 'Wio', country: 'AE', currency: 'AED', holder: 'kate', assetClass: 'cash', liquidity: 't1_instant', isCorporate: false, local: 5244, usd: 1428, yieldPct: 0, annualCashflow: 0 },
  { name: 'Hargreaves Schroder Pension', institution: 'Hargreaves Lansdown', country: 'GB', currency: 'GBP', holder: 'anjan', assetClass: 'equities', liquidity: 't3_locked_years', isCorporate: false, local: 38695, usd: 51194, yieldPct: 0, annualCashflow: 0 },
  { name: 'IBKR S&P ISP', institution: 'Interactive Brokers', country: 'US', currency: 'USD', holder: 'joint', assetClass: 'equities', liquidity: 't1_instant', isCorporate: false, local: 146986, usd: 146986, yieldPct: 0, annualCashflow: 0 },
  { name: 'Monzo Joint (UK)', institution: 'Monzo', country: 'GB', currency: 'GBP', holder: 'joint', assetClass: 'cash', liquidity: 't1_instant', isCorporate: false, local: 15, usd: 20, yieldPct: 2.5, annualCashflow: 0 },
  { name: 'Revolut', institution: 'Revolut', country: 'GB', currency: 'GBP', holder: 'anjan', assetClass: 'cash', liquidity: 't1_instant', isCorporate: false, local: 336, usd: 445, yieldPct: 0, annualCashflow: 0 },
  { name: 'Santander/NS&I (UK)', institution: 'Santander', country: 'GB', currency: 'GBP', holder: 'anjan', assetClass: 'cash', liquidity: 't1_instant', isCorporate: false, local: 1665, usd: 2203, yieldPct: 4.0, annualCashflow: 88 },
  { name: 'Upvolt Equity', institution: 'Upvolt', country: 'GB', currency: 'GBP', holder: 'anjan', assetClass: 'private_equity', liquidity: 't3_locked_years', isCorporate: false, local: 31000, usd: 41013, yieldPct: 0, annualCashflow: 0 },
  { name: 'UAE Car', institution: '—', country: 'AE', currency: 'AED', holder: 'anjan', assetClass: 'car', liquidity: 't3_locked_years', isCorporate: false, local: 114500, usd: 31178, yieldPct: 0, annualCashflow: 0 },
  { name: 'Upvolt Debt', institution: 'Upvolt', country: 'GB', currency: 'USD', holder: 'anjan', assetClass: 'private_debt', liquidity: 't3_locked_years', isCorporate: false, local: 50000, usd: 50000, yieldPct: 11.0, annualCashflow: 5500 },
  { name: 'Trump Meme Coin', institution: '—', country: 'US', currency: 'USD', holder: 'anjan', assetClass: 'crypto', liquidity: 't2_days', isCorporate: false, local: 500, usd: 500, yieldPct: 0, annualCashflow: 0 },
  // Corporate cash = Indexed FP&A consolidated *end-of-2026 closing cash forecast*
  // (Dec 2026 close), pulled from the Indexed FP&A dashboard on 2026-07-28.
  { name: 'Corporate Cash Balance', institution: 'Indexed', country: 'AE', currency: 'USD', holder: 'joint', assetClass: 'cash', liquidity: 't2_days', isCorporate: true, local: 482248, usd: 482248, yieldPct: 0, annualCashflow: 0 },
]

// Transaction accounts to ensure exist (so their statements are filable) but
// which don't carry a net-worth balance line.
const ENSURE_ONLY: Array<Pick<Row, 'name' | 'institution' | 'country' | 'currency' | 'holder' | 'assetClass' | 'liquidity'>> = [
  { name: 'Barclaycard Credit Card', institution: 'Barclays', country: 'GB', currency: 'GBP', holder: 'anjan', assetClass: 'debt', liquidity: 't1_instant' },
]

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    // Discover valid account_type enum labels so we can create accounts safely.
    let typeLabels: string[] = []
    try {
      const t = await query(
        `SELECT e.enumlabel AS label
         FROM pg_enum e JOIN pg_type ty ON e.enumtypid = ty.oid
         WHERE ty.typname = 'account_type' ORDER BY e.enumsortorder`,
      )
      typeLabels = t.rows.map((r) => String(r.label))
    } catch {
      /* fall back below */
    }
    const has = (v: string) => typeLabels.includes(v)
    const pickType = (assetClass: string): string => {
      const pref: Record<string, string[]> = {
        cash: ['savings', 'checking'],
        debt: ['credit'],
        equities: ['investment', 'brokerage'],
        private_equity: ['investment', 'brokerage'],
        private_debt: ['investment', 'brokerage'],
        car: ['asset', 'other'],
        crypto: ['crypto', 'investment'],
      }
      for (const c of pref[assetClass] || []) if (has(c)) return c
      if (has('other')) return 'other'
      if (has('savings')) return 'savings'
      return typeLabels[0] || 'savings'
    }

    const ensureAccount = async (r: {
      name: string; institution: string; country: string; currency: string
      holder: string; assetClass: string; liquidity: string; isCorporate?: boolean
    }) => {
      const type = pickType(r.assetClass)
      await query(
        `INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier, is_corporate, is_active)
         SELECT $1, $2, $3, $4, $5::account_type, $6::holder_type, $7::asset_class_type, $8::liquidity_tier_type, $9, true
         WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = $1)`,
        [r.name, r.institution, r.country, r.currency, type, r.holder, r.assetClass, r.liquidity, r.isCorporate ?? false],
      )
      // Keep metadata canonical (fixes e.g. Corporate Cash Balance -> AE/corporate).
      await query(
        `UPDATE accounts
         SET country = $2, currency = $3, holder = $4::holder_type,
             asset_class = $5::asset_class_type, liquidity_tier = $6::liquidity_tier_type,
             is_corporate = $7, is_active = true
         WHERE name = $1`,
        [r.name, r.country, r.currency, r.holder, r.assetClass, r.liquidity, r.isCorporate ?? false],
      )
    }

    for (const r of CURRENT) await ensureAccount(r)
    for (const r of ENSURE_ONLY) await ensureAccount(r)

    // Map names -> ids.
    const accs = await query(`SELECT id, name FROM accounts`)
    const idByName = new Map<string, string>(accs.rows.map((r) => [r.name, r.id]))

    // Write the 1 Jun 2026 balance snapshot for the net-worth accounts.
    let written = 0
    for (const r of CURRENT) {
      const id = idByName.get(r.name)
      if (!id) continue
      await query(
        `INSERT INTO balance_snapshots (account_id, balance_local, balance_usd, snapshot_date, yield_percent, annual_cashflow)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (account_id, snapshot_date)
         DO UPDATE SET balance_local = EXCLUDED.balance_local, balance_usd = EXCLUDED.balance_usd,
                       yield_percent = EXCLUDED.yield_percent, annual_cashflow = EXCLUDED.annual_cashflow`,
        [id, r.local, r.usd, SNAPSHOT_DATE, r.yieldPct, r.annualCashflow],
      )
      written++
    }

    return NextResponse.json({ success: true, date: SNAPSHOT_DATE, accounts: written })
  } catch (error) {
    console.error('Failed to seed current balance sheet:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to seed current balance sheet: ${detail}` }, { status: 500 })
  }
}
