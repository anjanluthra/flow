import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { query, createTransactions, type NewTransaction } from '@/lib/db'
import history from '@/data/history.json'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// POST /api/admin/load-history — one-click import of historical actuals.
//
// Loads the bundled 2024 transactions (from the personal-finance workbook)
// using the workbook's own account and category names, so the P&L matches the
// source sheet row-for-row and to the penny. Re-running fully refreshes the
// import: previously-seeded rows (identified by dedupe_hash) are removed first,
// then re-inserted — so it's safe to click repeatedly.
// ---------------------------------------------------------------------------

interface HistoryRow {
  date: string
  description: string
  amountLocal: number
  currency: string
  amountUsd: number
  type: 'income' | 'expense' | 'transfer' | 'investment'
  isInternalTransfer: boolean
  categoryName: string
  accountName: string
  dedupeHash: string
  notes: string
}

// Every account the 2024 data references, with sensible defaults. Each is
// created only if an account with that exact name doesn't already exist, so
// this never disturbs the user's existing accounts — it just guarantees the
// import can resolve all of them.
const EXTRA_ACCOUNTS: Array<[string, string, string, string, string, string, string, string]> = [
  ['FAB Current Account', 'FAB', 'AE', 'AED', 'checking', 'joint', 'cash', 't1_instant'],
  ['FAB iSavings', 'FAB', 'AE', 'AED', 'savings', 'joint', 'cash', 't2_days'],
  ['Santander/NS&I', 'Santander', 'GB', 'GBP', 'savings', 'anjan', 'cash', 't2_days'],
  ['Revolut', 'Revolut', 'GB', 'GBP', 'checking', 'anjan', 'cash', 't1_instant'],
  ['Monzo Joint', 'Monzo', 'GB', 'GBP', 'checking', 'joint', 'cash', 't1_instant'],
  ['Barclaycard Credit Card', 'Barclays', 'GB', 'GBP', 'credit', 'anjan', 'debt', 't1_instant'],
  ['Kroo', 'Kroo', 'GB', 'GBP', 'checking', 'anjan', 'cash', 't1_instant'],
  ['Moneybox', 'Moneybox', 'GB', 'GBP', 'savings', 'anjan', 'cash', 't2_days'],
  ['Wio Personal (Anjan)', 'Wio', 'AE', 'AED', 'checking', 'anjan', 'cash', 't1_instant'],
]

const PALETTE = [
  '#F97316', '#84CC16', '#EC4899', '#A855F7', '#6366F1', '#8B5CF6', '#14B8A6', '#64748B',
  '#EF4444', '#3B82F6', '#06B6D4', '#78716C', '#F59E0B', '#D946EF', '#71717A', '#10B981',
  '#0EA5E9', '#F43F5E', '#22C55E', '#0D9488',
]

export async function POST() {
  const denied = await requireAdmin()
  if (denied) return denied
  try {
    const rows = history as HistoryRow[]

    // 0. Ensure the schema this import relies on exists (idempotent).
    await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS dedupe_hash text`)
    await query(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_dedupe_hash
         ON transactions (dedupe_hash) WHERE dedupe_hash IS NOT NULL`,
    )
    await query(`ALTER TYPE category_type ADD VALUE IF NOT EXISTS 'transfer'`)
    await query(
      `INSERT INTO categories (name, type, icon_name, color_hex, sort_order)
       VALUES ('Internal Transfer', 'transfer', 'arrow-left-right', '#64748B', 1),
              ('Investments', 'transfer', 'trending-up', '#0D9488', 2)
       ON CONFLICT (name) DO NOTHING`,
    )

    // 1. Ensure the extra accounts exist.
    for (const [name, inst, country, ccy, type, holder, ac, liq] of EXTRA_ACCOUNTS) {
      await query(
        `INSERT INTO accounts (name, institution, country, currency, type, holder, asset_class, liquidity_tier)
         SELECT $1, $2, $3, $4, $5::account_type, $6::holder_type, $7::asset_class_type, $8::liquidity_tier_type
         WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE name = $1)`,
        [name, inst, country, ccy, type, holder, ac, liq],
      )
    }

    // 2. Ensure every category the workbook uses exists, keeping the sheet's
    //    own names so the statement mirrors it. A name gets the type of its
    //    first occurrence; the P&L sections by transaction type regardless.
    const catType = new Map<string, 'income' | 'expense'>()
    for (const r of rows) {
      if (r.categoryName === 'Internal Transfer' || r.categoryName === 'Investments') continue
      if (r.type === 'transfer' || r.type === 'investment') continue
      if (!catType.has(r.categoryName)) catType.set(r.categoryName, r.type)
    }
    let ci = 100
    for (const [name, type] of catType) {
      await query(
        `INSERT INTO categories (name, type, icon_name, color_hex, sort_order)
         VALUES ($1, $2::category_type, 'circle', $3, $4)
         ON CONFLICT (name) DO NOTHING`,
        [name, type, PALETTE[ci % PALETTE.length], ci],
      )
      ci++
    }

    // 3. Build name -> id maps.
    const [accs, cats] = await Promise.all([
      query('SELECT id, name FROM accounts'),
      query('SELECT id, name FROM categories'),
    ])
    const accById = new Map<string, string>(accs.rows.map((r) => [r.name, r.id]))
    const catById = new Map<string, string>(cats.rows.map((r) => [r.name, r.id]))

    // 4. Resolve rows to NewTransaction, skipping anything unresolvable.
    const unresolved: string[] = []
    const missingAccounts = new Set<string>()
    const missingCategories = new Set<string>()
    const toInsert: NewTransaction[] = []
    for (const r of rows) {
      const accountId = accById.get(r.accountName)
      const categoryId = catById.get(r.categoryName)
      if (!accountId || !categoryId) {
        if (!accountId) missingAccounts.add(r.accountName)
        if (!categoryId) missingCategories.add(r.categoryName)
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

    // 5. Refresh: remove any previously-seeded rows, then insert fresh so
    //    re-running always reflects the latest mapping (and never duplicates).
    const hashes = rows.map((r) => r.dedupeHash)
    // Clear any previously-seeded 2024 rows. Match both the current hashes and
    // the notes marker, so rows from an earlier import (whose hashes have since
    // changed) are still removed and never linger as duplicates.
    let removed = 0
    for (let i = 0; i < hashes.length; i += 1000) {
      const res = await query(`DELETE FROM transactions WHERE dedupe_hash = ANY($1)`, [
        hashes.slice(i, i + 1000),
      ])
      removed += res.rowCount ?? 0
    }
    const markerDel = await query(`DELETE FROM transactions WHERE notes LIKE '2024 sheet:%'`)
    removed += markerDel.rowCount ?? 0

    let inserted = 0
    const BATCH = 200
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const res = await createTransactions(toInsert.slice(i, i + BATCH))
      inserted += res.inserted
    }

    return NextResponse.json({
      success: true,
      total: rows.length,
      removed,
      inserted,
      categories: catType.size,
      unresolved: unresolved.length,
      missingAccounts: Array.from(missingAccounts),
      missingCategories: Array.from(missingCategories),
    })
  } catch (error) {
    console.error('Failed to load history:', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ error: `Failed to load history: ${detail}` }, { status: 500 })
  }
}
