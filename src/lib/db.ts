import { sql } from '@vercel/postgres'

// ---------------------------------------------------------------------------
// Generic query helper
// ---------------------------------------------------------------------------

export async function query(text: string, params?: unknown[]) {
  if (params && params.length > 0) {
    // Build a tagged-template-style call via sql.query
    return sql.query(text, params)
  }
  return sql.query(text)
}

// ---------------------------------------------------------------------------
// Transaction filters
// ---------------------------------------------------------------------------

export interface TransactionFilters {
  month?: number // 0-11
  year?: number
  categoryId?: string
  accountId?: string
  type?: 'income' | 'expense' | 'transfer'
  holder?: 'anjan' | 'kate' | 'joint'
  search?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export async function getTransactions(filters: TransactionFilters = {}) {
  let queryText = `
    SELECT
      t.*,
      c.name   AS category_name,
      c.color_hex AS category_color,
      a.name   AS account_name,
      a.country AS account_country,
      a.currency AS account_currency,
      a.holder AS holder
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    LEFT JOIN accounts   a ON t.account_id  = a.id
    WHERE 1=1
  `
  const params: unknown[] = []
  let paramIndex = 1

  if (filters.year !== undefined && filters.month !== undefined) {
    queryText += ` AND EXTRACT(YEAR FROM t.date) = $${paramIndex++} AND EXTRACT(MONTH FROM t.date) = $${paramIndex++}`
    params.push(filters.year, filters.month + 1) // JS month is 0-indexed
  }

  if (filters.categoryId) {
    queryText += ` AND t.category_id = $${paramIndex++}`
    params.push(filters.categoryId)
  }

  if (filters.accountId) {
    queryText += ` AND t.account_id = $${paramIndex++}`
    params.push(filters.accountId)
  }

  if (filters.type) {
    queryText += ` AND t.type = $${paramIndex++}`
    params.push(filters.type)
  }

  if (filters.holder) {
    queryText += ` AND a.holder = $${paramIndex++}`
    params.push(filters.holder)
  }

  if (filters.search) {
    queryText += ` AND t.description ILIKE $${paramIndex++}`
    params.push(`%${filters.search}%`)
  }

  queryText += ` ORDER BY t.date DESC`

  if (filters.limit) {
    queryText += ` LIMIT $${paramIndex++}`
    params.push(filters.limit)
  }

  if (filters.offset) {
    queryText += ` OFFSET $${paramIndex++}`
    params.push(filters.offset)
  }

  return query(queryText, params)
}

export async function getCategories() {
  return query('SELECT * FROM categories ORDER BY type, sort_order')
}

export async function getAccounts() {
  return query('SELECT * FROM accounts ORDER BY name')
}

export async function getBalanceSnapshots() {
  return query(`
    SELECT bs.*, a.name AS account_name, a.currency, a.holder
    FROM balance_snapshots bs
    JOIN accounts a ON bs.account_id = a.id
    ORDER BY bs.snapshot_date DESC
  `)
}

export async function getNetWorthSnapshots() {
  return query('SELECT * FROM net_worth_snapshots ORDER BY snapshot_date DESC')
}

export async function getMerchantMappings() {
  return query(`
    SELECT mm.*, c.name AS category_name, c.color_hex AS category_color
    FROM merchant_mappings mm
    JOIN categories c ON mm.category_id = c.id
    ORDER BY mm.times_used DESC
  `)
}

/**
 * Learn (or reinforce) a merchant -> category mapping. When the same pattern is
 * seen again we bump confidence and times_used so repeated corrections stick.
 */
export async function upsertMerchantMapping(pattern: string, categoryId: string) {
  await query(
    `INSERT INTO merchant_mappings (merchant_pattern, category_id, confidence, times_used)
     VALUES ($1, $2, 0.90, 1)
     ON CONFLICT (merchant_pattern)
     DO UPDATE SET
       category_id = EXCLUDED.category_id,
       confidence  = LEAST(0.99, merchant_mappings.confidence + 0.02),
       times_used  = merchant_mappings.times_used + 1,
       updated_at  = now()`,
    [pattern, categoryId],
  )
  return { learned: pattern }
}

// ---------------------------------------------------------------------------
// Transaction writes
// ---------------------------------------------------------------------------

export interface NewTransaction {
  date: string
  description: string
  amountLocal: number
  currency: string
  amountUsd: number | null
  categoryId: string | null
  accountId: string | null
  type: 'income' | 'expense' | 'transfer'
  isInternalTransfer?: boolean
  isBusinessExpense?: boolean
  notes?: string | null
  dedupeHash?: string | null
}

/**
 * Bulk-insert transactions (used by the CSV importer). Rows whose dedupe_hash
 * already exists are silently skipped (ON CONFLICT DO NOTHING), so re-importing
 * a statement never double-counts. Returns how many rows were actually inserted
 * and how many were skipped as duplicates.
 */
export async function createTransactions(rows: NewTransaction[]) {
  if (rows.length === 0) return { inserted: 0, skipped: 0 }

  const values: string[] = []
  const params: unknown[] = []
  let i = 1

  for (const r of rows) {
    values.push(
      `($${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++}, $${i++})`,
    )
    params.push(
      r.date,
      r.description,
      r.amountLocal,
      r.currency,
      r.amountUsd,
      r.categoryId,
      r.accountId,
      r.type,
      r.isInternalTransfer ?? false,
      r.isBusinessExpense ?? false,
      r.notes ?? null,
      r.dedupeHash ?? null,
    )
  }

  const result = await query(
    `INSERT INTO transactions
       (date, description, amount_local, currency, amount_usd,
        category_id, account_id, type, is_internal_transfer,
        is_business_expense, notes, dedupe_hash)
     VALUES ${values.join(', ')}
     ON CONFLICT (dedupe_hash) WHERE dedupe_hash IS NOT NULL DO NOTHING`,
    params,
  )

  const inserted = result.rowCount ?? 0
  return { inserted, skipped: rows.length - inserted }
}

export interface TransactionPatch {
  categoryId?: string | null
  type?: 'income' | 'expense' | 'transfer'
  isInternalTransfer?: boolean
  isBusinessExpense?: boolean
  isReimbursed?: boolean
  notes?: string | null
}

/** Patch a single transaction. Only provided fields are updated. */
export async function updateTransaction(id: string, patch: TransactionPatch) {
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  const map: Array<[keyof TransactionPatch, string]> = [
    ['categoryId', 'category_id'],
    ['type', 'type'],
    ['isInternalTransfer', 'is_internal_transfer'],
    ['isBusinessExpense', 'is_business_expense'],
    ['isReimbursed', 'is_reimbursed'],
    ['notes', 'notes'],
  ]

  for (const [key, col] of map) {
    if (patch[key] !== undefined) {
      sets.push(`${col} = $${i++}`)
      params.push(patch[key])
    }
  }

  if (sets.length === 0) return { updated: 0 }

  params.push(id)
  await query(
    `UPDATE transactions SET ${sets.join(', ')} WHERE id = $${i}`,
    params,
  )
  return { updated: 1 }
}

export async function deleteTransaction(id: string) {
  await query(`DELETE FROM transactions WHERE id = $1`, [id])
  return { deleted: 1 }
}

// ---------------------------------------------------------------------------
// P&L aggregation
// ---------------------------------------------------------------------------

/**
 * Monthly P&L for a given year/month: income & expense totals plus a
 * per-category breakdown. Transfers and internal transfers are excluded so
 * moving money between your own accounts never counts as income or spend.
 */
export async function getMonthlyPnL(
  year: number,
  month: number, // 1-12
  holder?: 'anjan' | 'kate' | 'joint',
) {
  const params: unknown[] = [year, month]
  let holderClause = ''
  if (holder) {
    holderClause = ` AND a.holder = $3`
    params.push(holder)
  }

  return query(
    `SELECT
        t.type,
        c.name       AS category_name,
        c.color_hex  AS category_color,
        SUM(COALESCE(t.amount_usd, 0)) AS total_usd
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     LEFT JOIN accounts   a ON t.account_id  = a.id
     WHERE EXTRACT(YEAR FROM t.date) = $1
       AND EXTRACT(MONTH FROM t.date) = $2
       AND t.type <> 'transfer'
       AND t.is_internal_transfer = false${holderClause}
     GROUP BY t.type, c.name, c.color_hex`,
    params,
  )
}

/**
 * Per-month income & expense totals for a whole year — the actuals side of the
 * annual/forecast view.
 */
export async function getAnnualActuals(
  year: number,
  holder?: 'anjan' | 'kate' | 'joint',
) {
  const params: unknown[] = [year]
  let holderClause = ''
  if (holder) {
    holderClause = ` AND a.holder = $2`
    params.push(holder)
  }

  return query(
    `SELECT
        EXTRACT(MONTH FROM t.date)::int AS month,
        t.type,
        SUM(COALESCE(t.amount_usd, 0)) AS total_usd
     FROM transactions t
     LEFT JOIN accounts a ON t.account_id = a.id
     WHERE EXTRACT(YEAR FROM t.date) = $1
       AND t.type <> 'transfer'
       AND t.is_internal_transfer = false${holderClause}
     GROUP BY month, t.type
     ORDER BY month`,
    params,
  )
}

/**
 * P&L line items for an arbitrary date range, grouped by type, category and
 * month. Powers the statement view (income/expense rows × month columns).
 * Transfers and internal transfers are excluded.
 *
 * Returns totals in both USD and GBP. GBP uses the transaction's native
 * amount_local when it was recorded in GBP (so it matches source sheets to the
 * penny) and falls back to converting USD at `gbpRate` for other currencies.
 */
export async function getPnLByRange(from: string, to: string, gbpRate: number) {
  const rate = gbpRate > 0 ? gbpRate : 1.3231
  return query(
    `SELECT
        t.type,
        c.name       AS category_name,
        c.color_hex  AS category_color,
        to_char(date_trunc('month', t.date), 'YYYY-MM') AS ym,
        SUM(COALESCE(t.amount_usd, 0)) AS total_usd,
        SUM(
          CASE WHEN t.currency = 'GBP' THEN t.amount_local
               ELSE COALESCE(t.amount_usd, 0) / $3 END
        ) AS total_gbp
     FROM transactions t
     LEFT JOIN categories c ON t.category_id = c.id
     WHERE t.date >= $1 AND t.date <= $2
       AND t.type <> 'transfer'
       AND t.is_internal_transfer = false
     GROUP BY t.type, c.name, c.color_hex, ym
     ORDER BY ym`,
    [from, to, rate],
  )
}

// ---------------------------------------------------------------------------
// Forecasts
// ---------------------------------------------------------------------------

export async function getForecasts(year: number) {
  return query(
    `SELECT year, month, forecast_income_usd, forecast_expense_usd, notes
     FROM forecasts WHERE year = $1 ORDER BY month`,
    [year],
  )
}

export async function upsertForecast(
  year: number,
  month: number,
  incomeUsd: number,
  expenseUsd: number,
  notes?: string | null,
) {
  await query(
    `INSERT INTO forecasts (year, month, forecast_income_usd, forecast_expense_usd, notes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (year, month)
     DO UPDATE SET
       forecast_income_usd  = EXCLUDED.forecast_income_usd,
       forecast_expense_usd = EXCLUDED.forecast_expense_usd,
       notes                = EXCLUDED.notes`,
    [year, month, incomeUsd, expenseUsd, notes ?? null],
  )
  return { upserted: 1 }
}

// ---------------------------------------------------------------------------
// Account import hints (learned fingerprints for auto-detection)
// ---------------------------------------------------------------------------

export async function getAccountHints() {
  return query(
    `SELECT account_id, hint_type, hint_value FROM account_import_hints`,
  )
}

/** Remember that files with this fingerprint belong to an account. Latest wins. */
export async function upsertAccountHint(accountId: string, hintType: string, hintValue: string) {
  await query(
    `INSERT INTO account_import_hints (account_id, hint_type, hint_value)
     VALUES ($1, $2, $3)
     ON CONFLICT (hint_type, hint_value)
     DO UPDATE SET account_id = EXCLUDED.account_id`,
    [accountId, hintType, hintValue],
  )
  return { learned: hintValue }
}

