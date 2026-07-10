import { NextRequest, NextResponse } from 'next/server'
import {
  getTransactions,
  createTransactions,
  getCategories,
  type NewTransaction,
  type TransactionFilters,
} from '@/lib/db'

// ---------------------------------------------------------------------------
// GET /api/transactions — list with optional filters
//   ?year= &month= (1-12) &categoryId= &accountId= &type= &holder= &search=
//   &limit= &offset=
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const filters: TransactionFilters = {}

    const year = sp.get('year')
    const month = sp.get('month')
    if (year) filters.year = parseInt(year, 10)
    // TransactionFilters.month is 0-indexed; the API takes 1-12.
    if (month) filters.month = parseInt(month, 10) - 1
    if (sp.get('categoryId')) filters.categoryId = sp.get('categoryId')!
    if (sp.get('accountId')) filters.accountId = sp.get('accountId')!
    const type = sp.get('type')
    if (type === 'income' || type === 'expense' || type === 'transfer') {
      filters.type = type
    }
    const holder = sp.get('holder')
    if (holder === 'anjan' || holder === 'kate' || holder === 'joint') {
      filters.holder = holder
    }
    if (sp.get('search')) filters.search = sp.get('search')!
    filters.limit = sp.get('limit') ? parseInt(sp.get('limit')!, 10) : 500

    const result = await getTransactions(filters)

    const transactions = result.rows.map((row) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      accountId: row.account_id,
      accountName: row.account_name,
      accountCountry: row.account_country,
      accountCurrency: row.account_currency,
      categoryId: row.category_id,
      categoryName: row.category_name ?? 'Uncategorised',
      categoryColor: row.category_color ?? '#94A3B8',
      amountLocal: parseFloat(row.amount_local),
      currency: row.currency,
      amountUsd: row.amount_usd !== null ? parseFloat(row.amount_usd) : 0,
      type: row.type as 'income' | 'expense' | 'transfer',
      isBusinessExpense: row.is_business_expense,
      isInternalTransfer: row.is_internal_transfer,
      holder: row.holder as 'anjan' | 'kate' | 'joint',
    }))

    return NextResponse.json({ transactions })
  } catch (error) {
    console.error('Failed to fetch transactions:', error)
    return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/transactions — bulk create (used by the CSV importer)
// Body: { transactions: Array<{ accountId, date, description, amountLocal,
//         currency, amountUsd?, categoryId? | categoryName?, type,
//         isBusinessExpense? }> }
// ---------------------------------------------------------------------------

interface IncomingTransaction {
  accountId: string | null
  date: string
  description: string
  amountLocal: number
  currency: string
  amountUsd?: number | null
  categoryId?: string | null
  categoryName?: string | null
  type: 'income' | 'expense' | 'transfer'
  isInternalTransfer?: boolean
  isBusinessExpense?: boolean
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const incoming = (body?.transactions ?? []) as IncomingTransaction[]

    if (!Array.isArray(incoming) || incoming.length === 0) {
      return NextResponse.json(
        { error: 'transactions array is required' },
        { status: 400 },
      )
    }

    // Resolve category names -> UUIDs once.
    const cats = await getCategories()
    const nameToId = new Map<string, string>()
    for (const c of cats.rows) {
      nameToId.set((c.name as string).toLowerCase(), c.id as string)
    }

    const rows: NewTransaction[] = incoming.map((t) => ({
      date: t.date,
      description: t.description,
      amountLocal: t.amountLocal,
      currency: t.currency,
      amountUsd: t.amountUsd ?? null,
      categoryId:
        t.categoryId ??
        (t.categoryName ? nameToId.get(t.categoryName.toLowerCase()) ?? null : null),
      accountId: t.accountId,
      type: t.type,
      isInternalTransfer: t.isInternalTransfer ?? false,
      isBusinessExpense: t.isBusinessExpense ?? false,
    }))

    const { inserted } = await createTransactions(rows)
    return NextResponse.json({ success: true, inserted })
  } catch (error) {
    console.error('Failed to create transactions:', error)
    return NextResponse.json({ error: 'Failed to create transactions' }, { status: 500 })
  }
}
