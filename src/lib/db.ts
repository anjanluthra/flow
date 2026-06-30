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
    SELECT mm.*, c.name AS category_name
    FROM merchant_mappings mm
    JOIN categories c ON mm.category_id = c.id
    ORDER BY mm.times_used DESC
  `)
}
