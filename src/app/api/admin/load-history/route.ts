import { NextResponse } from 'next/server'
import { query, createTransactions, type NewTransaction } from '@/lib/db'
import history from '@/data/history.json'

// ---------------------------------------------------------------------------
// POST /api/admin/load-history — one-click import of historical actuals.
//
// Loads the bundled 2024 transactions (from the personal-finance workbook)
// into the transactions table. Idempotent: every row carries a dedupe_hash so
// re-running never double-counts. Creates any accounts/categories the data
// references that don't exist yet, then resolves everything by name.
// ---------------------------------------------------------------------------

interface HistoryRow {
  date: string
  description: string
  amountLocal: number
  currency: string
  amountUsd: number
  type: 'income' | 'expense' | 'transfer'
  isInternalTransfer: boolean
  categoryName: string
  accountName: string
  dedupeHash: string
  notes: string
}

// Accounts referenced by the 2024 data that aren't in the base seed.
const EXTRA_ACCOUNTS: Array<[string, string, string, string, string, string, string, string]> = [
  // name, institution, country, currency, type, holder, asset_class, liquidity_tier
  ['Kroo', 'Kroo', 'GB', 'GBP', 'checking', 'anjan', 'cash', 't1_instant'],
  ['Moneybox', 'Moneybox', 'GB', 'GBP', 'savings', 'anjan', 'cash', 't2_days'],
]

// Categories referenced by the 2024 data that aren't in the base seed.
const EXTRA_CATEGORIES: Array<[string, string, string, string, number]> = [
  // name, type, icon_name, color_hex, sort_order
  ['Taxes', 'expense', 'landmark', '#64748B', 18],
  ['Insurance', 'expense', 'shield', '#0EA5E9', 19],
  ['Wedding', 'expense', 'heart', '#F43F5E', 20],
  ['Rent', 'expense', 'home', '#14B8A6', 21],
]

export async function POST() {
  try {
    // 1. Ensure the extra accounts exist.
    for (const [name, inst, country, ccy, type, holder, ac, liq] of EXTRA_ACCOUNTS) {
      await query(
        `INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier)
         SELECT $1, $2, $3, $4, $5::account_type, $6::holder_type, $7::asset_class_type, $8::liquidity_tier_type
         WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = $1)`,
        [name, inst, country, ccy, type, holder, ac, liq],
      )
    }

    // 2. Ensure the extra categories exist.
    for (const [name, type, icon, color, sort] of EXTRA_CATEGORIES) {
      await query(
        `INSERT INTO categories (name, type, icon_name, color_hex, sort_order)
         VALUES ($1, $2::category_type, $3, $4, $5)
         ON CONFLICT (name) DO NOTHING`,
        [name, type, icon, color, sort],
      )
    }

    // 3. Build name -> id maps.
    const [accs, cats] = await Promise.all([
      query('SELECT id, name FROM accounts'),
      query('SELECT id, name FROM categories'),
    ])
    const accById = new Map<string, string>(accs.rows.map((r) => [r.name, r.id]))
    const catById = new Map<string, string>(cats.rows.map((r) => [r.name, r.id]))

    // 4. Resolve rows to NewTransaction, skipping anything unresolvable.
    const rows = history as HistoryRow[]
    const unresolved: string[] = []
    const toInsert: NewTransaction[] = []
    for (const r of rows) {
      const accountId = accById.get(r.accountName)
      const categoryId = catById.get(r.categoryName)
      if (!accountId || !categoryId) {
        unresolved.push(`${r.date} ${r.description} (${r.accountName}/${r.categoryName})`)
        continue
      }
      toInsert.push({
        date: r.date,
        description: r.description,
        amountLocal: r.amountLocal,
        currency: r.currency,
        amountUsd: r.amountUsd,
        categoryId,
        accountId,
        type: r.type,
        isInternalTransfer: r.isInternalTransfer,
        notes: r.notes,
        dedupeHash: r.dedupeHash,
      })
    }

    // 5. Insert in batches (idempotent via dedupe_hash).
    let inserted = 0
    let skipped = 0
    const BATCH = 500
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const res = await createTransactions(toInsert.slice(i, i + BATCH))
      inserted += res.inserted
      skipped += res.skipped
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      inserted,
      skipped,
      unresolved: unresolved.length,
      unresolvedSample: unresolved.slice(0, 10),
    })
  } catch (error) {
    console.error('Failed to load history:', error)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }
}
