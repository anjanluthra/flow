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
  categoryName?: string
  accountId?: string
  type?: 'income' | 'expense' | 'transfer' | 'investment'
  holder?: 'anjan' | 'kate' | 'joint'
  eventId?: string // capital event the transaction belongs to
  from?: string // inclusive YYYY-MM-DD
  to?: string // inclusive YYYY-MM-DD
  search?: string
  limit?: number
  offset?: number
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

// One-time, idempotent migration that makes `investment` a first-class type.
// Adds the enum value to both the transaction and category enums, then relabels
// any investment-named category (Investments, Public investments, Private
// Investment) and its transactions from 'transfer' to 'investment'. Guarded so
// it runs at most once per serverless instance; safe to re-run.
let investmentTypeReady = false
export async function ensureInvestmentType() {
  if (investmentTypeReady) return
  try {
    await query(`ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'investment'`)
    await query(`ALTER TYPE category_type ADD VALUE IF NOT EXISTS 'investment'`)
    await query(
      `UPDATE categories SET type = 'investment'
       WHERE LOWER(name) LIKE '%investment%' AND type <> 'investment'`,
    )
    await query(
      `UPDATE transactions t SET type = 'investment'
       FROM categories c
       WHERE t.category_id = c.id AND c.type = 'investment' AND t.type <> 'investment'`,
    )
    investmentTypeReady = true
  } catch (error) {
    // Leave the flag unset so the next call retries; the ALTERs are idempotent.
    console.error('ensureInvestmentType failed:', error)
  }
}

// One-time, idempotent alignment: a categorised transaction's `type` must match
// its category's type (a Car expense is an expense even on a refund amount).
// Historically the importer typed rows by amount sign, so positive expense-
// category rows were mis-typed 'income' and showed up as phantom income lines
// in the P&L. This corrects any drift; new writes already type by category.
let typesAlignedReady = false
export async function ensureTransactionTypesMatchCategory() {
  if (typesAlignedReady) return
  try {
    await query(
      `UPDATE transactions t SET type = c.type
       FROM categories c
       WHERE t.category_id = c.id AND t.type IS DISTINCT FROM c.type`,
    )
    typesAlignedReady = true
  } catch (error) {
    console.error('ensureTransactionTypesMatchCategory failed:', error)
  }
}

export async function getTransactions(filters: TransactionFilters = {}) {
  await ensureInvestmentType()
  await ensureTransactionTypesMatchCategory()
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

  // Year and month filter independently — selecting a year alone must still
  // constrain to that year (previously the year was ignored unless a month was
  // also chosen).
  if (filters.year !== undefined) {
    queryText += ` AND EXTRACT(YEAR FROM t.date) = $${paramIndex++}`
    params.push(filters.year)
  }
  if (filters.month !== undefined) {
    queryText += ` AND EXTRACT(MONTH FROM t.date) = $${paramIndex++}` // JS month is 0-indexed
    params.push(filters.month + 1)
  }

  if (filters.categoryId) {
    queryText += ` AND t.category_id = $${paramIndex++}`
    params.push(filters.categoryId)
  }

  if (filters.categoryName) {
    queryText += ` AND c.name = $${paramIndex++}`
    params.push(filters.categoryName)
  }

  if (filters.from) {
    queryText += ` AND t.date >= $${paramIndex++}`
    params.push(filters.from)
  }

  if (filters.to) {
    queryText += ` AND t.date <= $${paramIndex++}`
    params.push(filters.to)
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

  if (filters.eventId) {
    queryText += ` AND t.event_id = $${paramIndex++}`
    params.push(filters.eventId)
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
  // Alphabetical by name so every category dropdown/filter is easy to scan.
  // Pages still group by type client-side; ordering within each group is A→Z.
  return query('SELECT * FROM categories ORDER BY name ASC')
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

// The self-learning mapping relies on a table + a UNIQUE index on the pattern
// (the target of ON CONFLICT). Both ship as migrations; ensure them here so
// learning works even on a DB where those migrations were never applied —
// otherwise every upsert throws and corrections are silently lost.
let merchantSchemaEnsured = false
async function ensureMerchantSchema() {
  if (merchantSchemaEnsured) return
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS merchant_mappings (
        id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
        merchant_pattern text          NOT NULL,
        category_id      uuid          NOT NULL REFERENCES categories ON DELETE CASCADE,
        confidence       numeric(3, 2) NOT NULL DEFAULT 0.80,
        times_used       int           NOT NULL DEFAULT 0,
        created_at       timestamptz   NOT NULL DEFAULT now(),
        updated_at       timestamptz   NOT NULL DEFAULT now()
      )
    `)
  } catch {
    /* table may already exist */
  }
  // Collapse any duplicate patterns (keep the most-used), then add the unique
  // index ON CONFLICT requires. CREATE UNIQUE INDEX IF NOT EXISTS is idempotent.
  try {
    await query(`
      DELETE FROM merchant_mappings a USING merchant_mappings b
      WHERE a.merchant_pattern = b.merchant_pattern
        AND (a.times_used < b.times_used OR (a.times_used = b.times_used AND a.ctid < b.ctid))
    `)
  } catch {
    /* nothing to dedupe */
  }
  try {
    await query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_mappings_pattern ON merchant_mappings (merchant_pattern)`)
  } catch {
    /* index may already exist */
  }
  merchantSchemaEnsured = true
}

export async function getMerchantMappings() {
  try {
    await ensureMerchantSchema()
    return await query(`
      SELECT mm.*, c.name AS category_name, c.color_hex AS category_color
      FROM merchant_mappings mm
      JOIN categories c ON mm.category_id = c.id
      ORDER BY mm.times_used DESC
    `)
  } catch {
    return { rows: [] as Record<string, unknown>[] } as Awaited<ReturnType<typeof query>>
  }
}

/**
 * Every already-categorised transaction, as (description, category, type). The
 * categoriser derives a merchant pattern from each and builds a merchant ->
 * category model from the household's own history — so the hundreds of rows you
 * have already classified drive auto-categorisation, not just a handful of
 * learned mappings.
 */
export async function getCategorisedDescriptions(limit = 8000) {
  try {
    return await query(
      `SELECT t.description, c.name AS category_name, c.type AS category_type
       FROM transactions t
       JOIN categories c ON t.category_id = c.id
       WHERE t.category_id IS NOT NULL
       ORDER BY t.date DESC
       LIMIT $1`,
      [limit],
    )
  } catch {
    return { rows: [] as Record<string, unknown>[] } as Awaited<ReturnType<typeof query>>
  }
}

/**
 * Learn (or reinforce) a merchant -> category mapping. When the same pattern is
 * seen again we bump confidence and times_used so repeated corrections stick.
 */
export async function upsertMerchantMapping(pattern: string, categoryId: string) {
  await ensureMerchantSchema()
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
  type: 'income' | 'expense' | 'transfer' | 'investment'
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
  if (rows.some((r) => r.type === 'investment')) await ensureInvestmentType()

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
  description?: string
  type?: 'income' | 'expense' | 'transfer' | 'investment'
  isInternalTransfer?: boolean
  isBusinessExpense?: boolean
  isReimbursed?: boolean
  notes?: string | null
  eventId?: string | null
}

/** Patch a single transaction. Only provided fields are updated. */
export async function updateTransaction(id: string, patch: TransactionPatch) {
  if (patch.eventId !== undefined) await ensureCapitalEvents()
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1

  const map: Array<[keyof TransactionPatch, string]> = [
    ['categoryId', 'category_id'],
    ['description', 'description'],
    ['type', 'type'],
    ['isInternalTransfer', 'is_internal_transfer'],
    ['isBusinessExpense', 'is_business_expense'],
    ['isReimbursed', 'is_reimbursed'],
    ['notes', 'notes'],
    ['eventId', 'event_id'],
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
  await ensureInvestmentType()
  await ensureTransactionTypesMatchCategory()
  await ensureCapitalEvents()
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
       -- Capital events (asset sales, inheritance, gifts) are non-operating:
       -- their proceeds AND costs are pulled out together into their own
       -- section so the operating P&L reflects recurring income vs spending.
       AND t.event_id IS NULL
       AND (
         -- Operating: income & expenses (internal transfers are excluded).
         (t.type IN ('income', 'expense') AND t.is_internal_transfer = false)
         -- Investing: investment funding is a real cash outflow, surfaced in a
         -- separate section rather than dropped like transfers / card payments.
         OR t.type = 'investment'
       )
     GROUP BY t.type, c.name, c.color_hex, ym
     ORDER BY ym`,
    [from, to, rate],
  )
}

// ---------------------------------------------------------------------------
// Capital events — asset sales, inheritance, gifts. Non-operating: proceeds and
// their costs are bundled into one event and excluded from the operating P&L,
// so the "operating" numbers show recurring income vs spending only.
// ---------------------------------------------------------------------------

let capitalEventsReady = false
export async function ensureCapitalEvents() {
  if (capitalEventsReady) return
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS capital_events (
        id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
        name       text        NOT NULL,
        kind       text        NOT NULL DEFAULT 'asset_sale',
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `)
    await query(`ALTER TABLE transactions ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES capital_events ON DELETE SET NULL`)
    capitalEventsReady = true
  } catch (error) {
    console.error('ensureCapitalEvents failed:', error)
  }
}

// Per-event proceeds / costs / net within a date range, in USD and GBP. Amounts
// are stored absolute, so proceeds = income legs, costs = expense legs.
export async function getCapitalEventsForRange(from: string, to: string, gbpRate: number) {
  await ensureCapitalEvents()
  const rate = gbpRate > 0 ? gbpRate : 1.3231
  const gbp = (col: string) =>
    `SUM(CASE WHEN t.type = '${col}' THEN (CASE WHEN t.currency = 'GBP' THEN t.amount_local ELSE COALESCE(t.amount_usd, 0) / $3 END) ELSE 0 END)`
  return query(
    `SELECT e.id, e.name, e.kind,
        COUNT(t.id)::int AS txn_count,
        COALESCE(SUM(CASE WHEN t.type = 'income'  THEN COALESCE(t.amount_usd, 0) ELSE 0 END), 0) AS proceeds_usd,
        COALESCE(SUM(CASE WHEN t.type = 'expense' THEN COALESCE(t.amount_usd, 0) ELSE 0 END), 0) AS costs_usd,
        COALESCE(${gbp('income')}, 0)  AS proceeds_gbp,
        COALESCE(${gbp('expense')}, 0) AS costs_gbp
     FROM capital_events e
     LEFT JOIN transactions t ON t.event_id = e.id AND t.date >= $1 AND t.date <= $2
     GROUP BY e.id, e.name, e.kind
     ORDER BY (COALESCE(SUM(CASE WHEN t.type = 'income' THEN COALESCE(t.amount_usd, 0) ELSE -COALESCE(t.amount_usd, 0) END), 0)) DESC`,
    [from, to, rate],
  )
}

// All events with all-time transaction counts, for the management list.
export async function getCapitalEvents() {
  await ensureCapitalEvents()
  return query(
    `SELECT e.id, e.name, e.kind, e.created_at, COUNT(t.id)::int AS txn_count
     FROM capital_events e
     LEFT JOIN transactions t ON t.event_id = e.id
     GROUP BY e.id, e.name, e.kind, e.created_at
     ORDER BY e.created_at DESC`,
  )
}

export async function createCapitalEvent(name: string, kind: string) {
  await ensureCapitalEvents()
  const res = await query(
    `INSERT INTO capital_events (name, kind) VALUES ($1, $2) RETURNING id, name, kind`,
    [name, kind || 'asset_sale'],
  )
  return res.rows[0]
}

export async function updateCapitalEvent(id: string, patch: { name?: string; kind?: string }) {
  await ensureCapitalEvents()
  const sets: string[] = []
  const params: unknown[] = []
  let i = 1
  if (patch.name !== undefined) { sets.push(`name = $${i++}`); params.push(patch.name) }
  if (patch.kind !== undefined) { sets.push(`kind = $${i++}`); params.push(patch.kind) }
  if (!sets.length) return
  params.push(id)
  await query(`UPDATE capital_events SET ${sets.join(', ')} WHERE id = $${i}`, params)
}

// Deleting an event unassigns its transactions (ON DELETE SET NULL), returning
// them to the operating P&L.
export async function deleteCapitalEvent(id: string) {
  await ensureCapitalEvents()
  await query(`DELETE FROM capital_events WHERE id = $1`, [id])
}

// ---------------------------------------------------------------------------
// Forecasts
// ---------------------------------------------------------------------------

// Idempotent guard so saving a forecast works even on a DB where the
// 003_forecasts migration was never applied. Creates the table AND its
// UNIQUE (year, month) constraint — the target of the upsert's ON CONFLICT.
// Without this the POST throws (relation/constraint missing) and, because the
// UI reloaded from averages, edits silently reverted.
let forecastsReady = false
export async function ensureForecasts() {
  if (forecastsReady) return
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS forecasts (
        id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
        year                  int            NOT NULL,
        month                 int            NOT NULL,
        forecast_income_usd   numeric(14, 2) NOT NULL DEFAULT 0,
        forecast_expense_usd  numeric(14, 2) NOT NULL DEFAULT 0,
        notes                 text,
        created_at            timestamptz    NOT NULL DEFAULT now(),
        updated_at            timestamptz    NOT NULL DEFAULT now()
      )
    `)
    // Add the unique constraint if it's somehow missing (e.g. table pre-exists
    // without it). ON CONFLICT (year, month) needs it.
    await query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_forecasts_year_month') THEN
          ALTER TABLE forecasts ADD CONSTRAINT uq_forecasts_year_month UNIQUE (year, month);
        END IF;
      END $$;
    `)
    forecastsReady = true
  } catch (error) {
    console.error('ensureForecasts failed:', error)
  }
}

export async function getForecasts(year: number) {
  await ensureForecasts()
  try {
    return await query(
      `SELECT year, month, forecast_income_usd, forecast_expense_usd, notes
       FROM forecasts WHERE year = $1 ORDER BY month`,
      [year],
    )
  } catch {
    // The forecasts table is optional; treat a missing table as "no forecasts".
    return { rows: [] as Record<string, unknown>[] } as Awaited<ReturnType<typeof query>>
  }
}

export async function upsertForecast(
  year: number,
  month: number,
  incomeUsd: number,
  expenseUsd: number,
  notes?: string | null,
) {
  await ensureForecasts()
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
// Annual budgets — a single operating-expense target per year, tracked against
// planned spend (actuals + forecast). Idempotent guard like the others.
// ---------------------------------------------------------------------------

let budgetsReady = false
export async function ensureBudgets() {
  if (budgetsReady) return
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS annual_budgets (
        year               int            PRIMARY KEY,
        expense_budget_usd numeric(14, 2) NOT NULL DEFAULT 0,
        updated_at         timestamptz    NOT NULL DEFAULT now()
      )
    `)
    budgetsReady = true
  } catch (error) {
    console.error('ensureBudgets failed:', error)
  }
}

export async function getBudget(year: number): Promise<number | null> {
  await ensureBudgets()
  try {
    const res = await query(`SELECT expense_budget_usd FROM annual_budgets WHERE year = $1`, [year])
    return res.rows[0] ? parseFloat(res.rows[0].expense_budget_usd as string) : null
  } catch {
    return null
  }
}

export async function upsertBudget(year: number, expenseBudgetUsd: number) {
  await ensureBudgets()
  await query(
    `INSERT INTO annual_budgets (year, expense_budget_usd)
     VALUES ($1, $2)
     ON CONFLICT (year)
     DO UPDATE SET expense_budget_usd = EXCLUDED.expense_budget_usd, updated_at = now()`,
    [year, expenseBudgetUsd],
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

