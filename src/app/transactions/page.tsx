'use client'

import React, { useState, useMemo } from 'react'
import { Search } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { DataTable } from '@/components/ui/DataTable'
import { formatCurrency, formatUSD } from '@/lib/currency'
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from '@/lib/categories'

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

interface MockTransaction {
  id: string
  date: string
  description: string
  accountName: string
  accountCountry: string
  accountCurrency: string
  categoryName: string
  categoryColor: string
  amountLocal: number
  currency: string
  amountUsd: number
  type: 'income' | 'expense' | 'transfer'
  isBusinessExpense: boolean
  holder: 'anjan' | 'kate' | 'joint'
}

// ────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────

const ALL_CATEGORIES = [
  ...EXPENSE_CATEGORIES.map((c) => c.name),
  ...INCOME_CATEGORIES.map((c) => c.name),
]

const ACCOUNTS = [
  'FAB Current',
  'FAB iSavings',
  'Wio Anjan',
  'Wio Kate',
  'Barclaycard',
  'Monzo Joint',
  'Revolut',
  'Santander/NS&I',
  'HSBC Jersey',
  'IBKR',
  'Hargreaves S&P',
  'Hargreaves Schroder',
]

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const ACCOUNT_COLORS: Record<string, string> = {
  'FAB Current':          '#F97316',
  'FAB iSavings':         '#F59E0B',
  'Wio Anjan':            '#EF4444',
  'Wio Kate':             '#EC4899',
  'Barclaycard':          '#6366F1',
  'Monzo Joint':          '#3B82F6',
  'Revolut':              '#8B5CF6',
  'Santander/NS&I':       '#14B8A6',
  'HSBC Jersey':          '#06B6D4',
  'IBKR':                 '#64748B',
  'Hargreaves S&P':       '#10B981',
  'Hargreaves Schroder':  '#059669',
}

// ────────────────────────────────────────────────
// Account region mapping for row tinting
// ────────────────────────────────────────────────

type AccountRegion = 'uae' | 'uk' | 'usd' | 'credit'

const ACCOUNT_REGION: Record<string, AccountRegion> = {
  'FAB Current':          'uae',
  'FAB iSavings':         'uae',
  'Wio Anjan':            'uae',
  'Wio Kate':             'uae',
  'Barclaycard':          'credit',
  'Monzo Joint':          'uk',
  'Revolut':              'uk',
  'Santander/NS&I':       'uk',
  'HSBC Jersey':          'uk',
  'IBKR':                 'usd',
  'Hargreaves S&P':       'usd',
  'Hargreaves Schroder':  'usd',
}

const REGION_ROW_CLASS: Record<AccountRegion, string> = {
  uae:    'bg-amber-50/40',
  uk:     'bg-sky-50/40',
  usd:    '',
  credit: 'bg-red-50/30',
}

// ────────────────────────────────────────────────
// Mock data (45 transactions)
// ────────────────────────────────────────────────

const MOCK_TRANSACTIONS: MockTransaction[] = [
  // ── UAE Salary ──
  { id: 'tx001', date: '2024-06-01', description: 'Salary - Indexed Ltd', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Salary', categoryColor: '#10B981', amountLocal: 38500, currency: 'AED', amountUsd: 10483.49, type: 'income', isBusinessExpense: false, holder: 'anjan' },
  // ── Rent ──
  { id: 'tx002', date: '2024-06-01', description: 'Rent - Marina Gate Tower 1', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Bills & Utilities', categoryColor: '#64748B', amountLocal: 8500, currency: 'AED', amountUsd: 2314.50, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── DEWA ──
  { id: 'tx003', date: '2024-06-02', description: 'DEWA - Electricity & Water', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Bills & Utilities', categoryColor: '#64748B', amountLocal: 645.30, currency: 'AED', amountUsd: 175.74, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── Du Mobile ──
  { id: 'tx004', date: '2024-06-03', description: 'du - Mobile Plan x2', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Bills & Utilities', categoryColor: '#64748B', amountLocal: 399, currency: 'AED', amountUsd: 108.64, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── Salik tolls ──
  { id: 'tx005', date: '2024-06-03', description: 'Salik - Toll Gate x6', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Car', categoryColor: '#6366F1', amountLocal: 24, currency: 'AED', amountUsd: 6.54, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── ADNOC fuel ──
  { id: 'tx006', date: '2024-06-04', description: 'ADNOC - Fuel Station JBR', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Car', categoryColor: '#6366F1', amountLocal: 195, currency: 'AED', amountUsd: 53.10, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Carrefour groceries ──
  { id: 'tx007', date: '2024-06-05', description: 'Carrefour - Mall of the Emirates', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Groceries', categoryColor: '#84CC16', amountLocal: 487.65, currency: 'AED', amountUsd: 132.80, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Spinneys ──
  { id: 'tx008', date: '2024-06-07', description: 'Spinneys - The Greens', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Groceries', categoryColor: '#84CC16', amountLocal: 312.40, currency: 'AED', amountUsd: 85.08, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Dining ──
  { id: 'tx009', date: '2024-06-06', description: 'Zuma - DIFC', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Dining & Coffee', categoryColor: '#F97316', amountLocal: 892, currency: 'AED', amountUsd: 242.90, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Coffee ──
  { id: 'tx010', date: '2024-06-08', description: '%Arabica - Dubai Mall', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Dining & Coffee', categoryColor: '#F97316', amountLocal: 42, currency: 'AED', amountUsd: 11.44, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Gym ──
  { id: 'tx011', date: '2024-06-01', description: 'Fitness First - JLT Monthly', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Health & Wellness', categoryColor: '#EC4899', amountLocal: 399, currency: 'AED', amountUsd: 108.64, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Barber ──
  { id: 'tx012', date: '2024-06-09', description: 'Chaps & Co - Barber', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Personal Care', categoryColor: '#A855F7', amountLocal: 120, currency: 'AED', amountUsd: 32.68, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Uber ──
  { id: 'tx013', date: '2024-06-10', description: 'Uber - Dubai Marina to DIFC', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Taxis & Rideshare', categoryColor: '#8B5CF6', amountLocal: 38.50, currency: 'AED', amountUsd: 10.48, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Noon shopping ──
  { id: 'tx014', date: '2024-06-11', description: 'Noon.com - Household Items', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Household', categoryColor: '#14B8A6', amountLocal: 267, currency: 'AED', amountUsd: 72.72, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Netflix ──
  { id: 'tx015', date: '2024-06-12', description: 'Netflix - Premium Plan', accountName: 'Barclaycard', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Subscriptions', categoryColor: '#06B6D4', amountLocal: 17.99, currency: 'GBP', amountUsd: 23.80, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── Spotify ──
  { id: 'tx016', date: '2024-06-12', description: 'Spotify - Family Plan', accountName: 'Barclaycard', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Subscriptions', categoryColor: '#06B6D4', amountLocal: 16.99, currency: 'GBP', amountUsd: 22.48, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── ChatGPT ──
  { id: 'tx017', date: '2024-06-12', description: 'OpenAI - ChatGPT Plus', accountName: 'Barclaycard', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Subscriptions', categoryColor: '#06B6D4', amountLocal: 20, currency: 'USD', amountUsd: 20, type: 'expense', isBusinessExpense: true, holder: 'anjan' },
  // ── Claude Pro ──
  { id: 'tx018', date: '2024-06-12', description: 'Anthropic - Claude Pro', accountName: 'Barclaycard', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Subscriptions', categoryColor: '#06B6D4', amountLocal: 20, currency: 'USD', amountUsd: 20, type: 'expense', isBusinessExpense: true, holder: 'anjan' },
  // ── Coworking space ──
  { id: 'tx019', date: '2024-06-13', description: 'Letswork - DIFC Day Pass', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Business Expenses', categoryColor: '#1E293B', amountLocal: 75, currency: 'AED', amountUsd: 20.42, type: 'expense', isBusinessExpense: true, holder: 'anjan' },
  // ── Amazon UK ──
  { id: 'tx020', date: '2024-06-14', description: 'Amazon UK - Books & Electronics', accountName: 'Barclaycard', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Shopping', categoryColor: '#3B82F6', amountLocal: 84.97, currency: 'GBP', amountUsd: 112.39, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Tesco ──
  { id: 'tx021', date: '2024-06-15', description: 'Tesco - Online Delivery', accountName: 'Monzo Joint', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Groceries', categoryColor: '#84CC16', amountLocal: 127.43, currency: 'GBP', amountUsd: 168.59, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── TfL ──
  { id: 'tx022', date: '2024-06-16', description: 'TfL - Oyster Top Up', accountName: 'Monzo Joint', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Car', categoryColor: '#6366F1', amountLocal: 40, currency: 'GBP', amountUsd: 52.92, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── Kate salary ──
  { id: 'tx023', date: '2024-06-15', description: 'Salary - Kate Employer Ltd', accountName: 'Monzo Joint', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Salary', categoryColor: '#10B981', amountLocal: 3200, currency: 'GBP', amountUsd: 4233.92, type: 'income', isBusinessExpense: false, holder: 'kate' },
  // ── Bank interest ──
  { id: 'tx024', date: '2024-06-15', description: 'FAB iSavings - Monthly Interest', accountName: 'FAB iSavings', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Bank Interest', categoryColor: '#059669', amountLocal: 312.50, currency: 'AED', amountUsd: 85.09, type: 'income', isBusinessExpense: false, holder: 'anjan' },
  // ── Santander interest ──
  { id: 'tx025', date: '2024-06-16', description: 'Santander - Savings Interest', accountName: 'Santander/NS&I', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Bank Interest', categoryColor: '#059669', amountLocal: 42.18, currency: 'GBP', amountUsd: 55.78, type: 'income', isBusinessExpense: false, holder: 'anjan' },
  // ── Dividends ──
  { id: 'tx026', date: '2024-06-17', description: 'IBKR - VOO Dividend Q2', accountName: 'IBKR', accountCountry: 'US', accountCurrency: 'USD', categoryName: 'Dividends', categoryColor: '#0D9488', amountLocal: 187.43, currency: 'USD', amountUsd: 187.43, type: 'income', isBusinessExpense: false, holder: 'anjan' },
  // ── Hargreaves S&P dividend ──
  { id: 'tx027', date: '2024-06-17', description: 'Hargreaves - S&P 500 Distribution', accountName: 'Hargreaves S&P', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Dividends', categoryColor: '#0D9488', amountLocal: 56.22, currency: 'GBP', amountUsd: 74.38, type: 'income', isBusinessExpense: false, holder: 'anjan' },
  // ── Carrefour groceries again ──
  { id: 'tx028', date: '2024-06-18', description: 'Carrefour - JBR Walk', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Groceries', categoryColor: '#84CC16', amountLocal: 523.80, currency: 'AED', amountUsd: 142.64, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Deliveroo ──
  { id: 'tx029', date: '2024-06-18', description: 'Deliveroo - Dinner Order', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Dining & Coffee', categoryColor: '#F97316', amountLocal: 156.50, currency: 'AED', amountUsd: 42.62, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Cinema ──
  { id: 'tx030', date: '2024-06-19', description: 'VOX Cinemas - Mall of the Emirates', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Entertainment', categoryColor: '#EF4444', amountLocal: 140, currency: 'AED', amountUsd: 38.12, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── Cashback ──
  { id: 'tx031', date: '2024-06-19', description: 'Wio - Monthly Cashback', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Cashback', categoryColor: '#0891B2', amountLocal: 47.30, currency: 'AED', amountUsd: 12.88, type: 'income', isBusinessExpense: false, holder: 'anjan' },
  // ── Transfer to savings ──
  { id: 'tx032', date: '2024-06-20', description: 'Transfer to FAB iSavings', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Cash', categoryColor: '#71717A', amountLocal: 5000, currency: 'AED', amountUsd: 1361.47, type: 'transfer', isBusinessExpense: false, holder: 'anjan' },
  // ── Transfer to UK ──
  { id: 'tx033', date: '2024-06-20', description: 'Wise Transfer - AED to GBP', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Cash', categoryColor: '#71717A', amountLocal: 3000, currency: 'AED', amountUsd: 816.88, type: 'transfer', isBusinessExpense: false, holder: 'anjan' },
  // ── Insurance ──
  { id: 'tx034', date: '2024-06-21', description: 'Sukoon Insurance - Health Cover', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Bills & Utilities', categoryColor: '#64748B', amountLocal: 1250, currency: 'AED', amountUsd: 340.37, type: 'expense', isBusinessExpense: false, holder: 'joint' },
  // ── Zara ──
  { id: 'tx035', date: '2024-06-21', description: 'Zara - Dubai Mall', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Shopping', categoryColor: '#3B82F6', amountLocal: 485, currency: 'AED', amountUsd: 132.06, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Pharmacy ──
  { id: 'tx036', date: '2024-06-22', description: 'Life Pharmacy - JBR', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Health & Wellness', categoryColor: '#EC4899', amountLocal: 78.50, currency: 'AED', amountUsd: 21.38, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Dining business ──
  { id: 'tx037', date: '2024-06-23', description: 'La Petite Maison - Client Dinner', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Business Expenses', categoryColor: '#1E293B', amountLocal: 1340, currency: 'AED', amountUsd: 364.87, type: 'expense', isBusinessExpense: true, holder: 'anjan' },
  // ── Revolut exchange ──
  { id: 'tx038', date: '2024-06-24', description: 'Revolut - GBP to EUR Exchange', accountName: 'Revolut', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Cash', categoryColor: '#71717A', amountLocal: 500, currency: 'GBP', amountUsd: 661.55, type: 'transfer', isBusinessExpense: false, holder: 'anjan' },
  // ── Salik again ──
  { id: 'tx039', date: '2024-06-25', description: 'Salik - Toll Gate x4', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Car', categoryColor: '#6366F1', amountLocal: 16, currency: 'AED', amountUsd: 4.36, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── ADNOC again ──
  { id: 'tx040', date: '2024-06-26', description: 'ADNOC - Fuel Station Marina', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Car', categoryColor: '#6366F1', amountLocal: 210, currency: 'AED', amountUsd: 57.18, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Gift ──
  { id: 'tx041', date: '2024-06-26', description: 'The Gift Shop - Birthday Present', accountName: 'Wio Kate', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Gifts', categoryColor: '#D946EF', amountLocal: 320, currency: 'AED', amountUsd: 87.13, type: 'expense', isBusinessExpense: false, holder: 'kate' },
  // ── Refund ──
  { id: 'tx042', date: '2024-06-27', description: 'Amazon UK - Refund (Faulty Item)', accountName: 'Barclaycard', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Refunds', categoryColor: '#2563EB', amountLocal: 29.99, currency: 'GBP', amountUsd: 39.68, type: 'income', isBusinessExpense: false, holder: 'anjan' },
  // ── Uber Eats ──
  { id: 'tx043', date: '2024-06-27', description: 'Uber Eats - Lunch', accountName: 'Wio Anjan', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Dining & Coffee', categoryColor: '#F97316', amountLocal: 67.50, currency: 'AED', amountUsd: 18.38, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Parking ──
  { id: 'tx044', date: '2024-06-28', description: 'RTA - Parking JBR', accountName: 'FAB Current', accountCountry: 'AE', accountCurrency: 'AED', categoryName: 'Car', categoryColor: '#6366F1', amountLocal: 20, currency: 'AED', amountUsd: 5.45, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
  // ── Bank fee ──
  { id: 'tx045', date: '2024-06-30', description: 'Barclaycard - Annual Fee', accountName: 'Barclaycard', accountCountry: 'GB', accountCurrency: 'GBP', categoryName: 'Bank Fees', categoryColor: '#94A3B8', amountLocal: 32, currency: 'GBP', amountUsd: 42.34, type: 'expense', isBusinessExpense: false, holder: 'anjan' },
]

// ────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────

export default function TransactionsPage() {
  // Filter state
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [accountFilter, setAccountFilter] = useState('all')
  const [monthFilter, setMonthFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [holderFilter, setHolderFilter] = useState<'all' | 'anjan' | 'kate' | 'joint'>('all')

  // Filtered data
  const filteredData = useMemo(() => {
    return MOCK_TRANSACTIONS.filter((tx) => {
      // Search
      if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) {
        return false
      }

      // Category
      if (categoryFilter !== 'all' && tx.categoryName !== categoryFilter) {
        return false
      }

      // Account
      if (accountFilter !== 'all' && tx.accountName !== accountFilter) {
        return false
      }

      // Month
      if (monthFilter !== 'all') {
        const txMonth = parseISO(tx.date).getMonth()
        const filterMonthIndex = MONTHS.indexOf(monthFilter)
        if (txMonth !== filterMonthIndex) {
          return false
        }
      }

      // Type
      if (typeFilter !== 'all' && tx.type !== typeFilter) {
        return false
      }

      // Holder
      if (holderFilter !== 'all' && tx.holder !== holderFilter) {
        return false
      }

      return true
    })
  }, [search, categoryFilter, accountFilter, monthFilter, typeFilter, holderFilter])

  // Table columns
  const columns = useMemo(
    () => [
      {
        key: 'date',
        header: 'Date',
        sortable: true,
        className: 'w-[110px]',
        render: (tx: MockTransaction) => (
          <span className="whitespace-nowrap text-sm text-gray-600">
            {format(parseISO(tx.date), 'd MMM yyyy')}
          </span>
        ),
      },
      {
        key: 'description',
        header: 'Description',
        className: 'min-w-[200px]',
        render: (tx: MockTransaction) => (
          <div>
            <span className="text-sm font-medium text-gray-900">{tx.description}</span>
            {tx.isBusinessExpense && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                Business
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'accountName',
        header: 'Account',
        className: 'w-[170px]',
        render: (tx: MockTransaction) => (
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-5 w-1 rounded-full"
              style={{ backgroundColor: ACCOUNT_COLORS[tx.accountName] ?? '#94A3B8' }}
            />
            <span className="text-sm text-gray-700">{tx.accountName}</span>
          </div>
        ),
      },
      {
        key: 'categoryName',
        header: 'Category',
        className: 'w-[180px]',
        render: (tx: MockTransaction) => (
          <div className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: tx.categoryColor }}
            />
            <span className="text-sm text-gray-700">{tx.categoryName}</span>
          </div>
        ),
      },
      {
        key: 'amountLocal',
        header: 'Amount (Local)',
        sortable: true,
        className: 'w-[140px] text-right',
        render: (tx: MockTransaction) => {
          const isNegative = tx.type === 'expense'
          return (
            <span
              className={`block text-right text-sm font-medium tabular-nums ${
                isNegative ? 'text-gray-900' : 'text-emerald-700'
              }`}
            >
              {isNegative ? '-' : '+'}
              {formatCurrency(Math.abs(tx.amountLocal), tx.currency)}
            </span>
          )
        },
      },
      {
        key: 'amountUsd',
        header: 'Amount (USD)',
        sortable: true,
        className: 'w-[130px] text-right',
        render: (tx: MockTransaction) => {
          const isNegative = tx.type === 'expense'
          return (
            <span
              className={`block text-right text-sm tabular-nums ${
                isNegative ? 'text-gray-500' : 'text-emerald-600'
              }`}
            >
              {isNegative ? '-' : '+'}
              {formatUSD(Math.abs(tx.amountUsd))}
            </span>
          )
        },
      },
      {
        key: 'type',
        header: 'Type',
        className: 'w-[100px]',
        render: (tx: MockTransaction) => {
          const styles: Record<string, string> = {
            income:   'bg-emerald-50 text-emerald-700',
            expense:  'bg-red-50 text-red-700',
            transfer: 'bg-blue-50 text-blue-700',
          }
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                styles[tx.type] ?? ''
              }`}
            >
              {tx.type}
            </span>
          )
        },
      },
    ],
    [],
  )

  // Row tinting by account region
  const getRowClassName = (tx: MockTransaction) => {
    const region = ACCOUNT_REGION[tx.accountName]
    return region ? REGION_ROW_CLASS[region] : ''
  }

  // Pill button helper
  const pillClass = (active: boolean) =>
    active
      ? 'bg-gray-900 text-white shadow-sm'
      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'

  return (
    <div className="min-h-screen bg-gray-50/50 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Transactions</h1>
        <p className="mt-1 text-sm text-gray-500">Transaction Explorer</p>
      </div>

      {/* Filter bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 w-64 rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-700 placeholder-gray-400 shadow-sm outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
          />
        </div>

        {/* Category dropdown */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
        >
          <option value="all">All Categories</option>
          <optgroup label="Expenses">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Income">
            {INCOME_CATEGORIES.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>

        {/* Account dropdown */}
        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
        >
          <option value="all">All Accounts</option>
          {ACCOUNTS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>

        {/* Month dropdown */}
        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm outline-none transition-colors focus:border-gray-400 focus:ring-1 focus:ring-gray-300"
        >
          <option value="all">All Months</option>
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200" />

        {/* Type pill buttons */}
        <div className="flex gap-1">
          {(['all', 'income', 'expense'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${pillClass(typeFilter === t)}`}
            >
              {t === 'all' ? 'All Types' : t}
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-200" />

        {/* Holder pill buttons */}
        <div className="flex gap-1">
          {(['all', 'anjan', 'kate', 'joint'] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHolderFilter(h)}
              className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors ${pillClass(holderFilter === h)}`}
            >
              {h === 'all' ? 'All Holders' : h.charAt(0).toUpperCase() + h.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Results count */}
      <div className="mb-3 text-sm text-gray-500">
        {filteredData.length} transaction{filteredData.length !== 1 ? 's' : ''} found
      </div>

      {/* Data table */}
      <DataTable<MockTransaction & Record<string, unknown>>
        columns={columns as { key: string; header: string; render?: (item: MockTransaction & Record<string, unknown>) => React.ReactNode; sortable?: boolean; className?: string }[]}
        data={filteredData as (MockTransaction & Record<string, unknown>)[]}
        pageSize={20}
        emptyMessage="No transactions match your filters."
        rowClassName={(item) => getRowClassName(item as unknown as MockTransaction)}
      />
    </div>
  )
}
