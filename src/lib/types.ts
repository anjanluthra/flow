// ────────────────────────────────────────────────
// Enum types
// ────────────────────────────────────────────────

export type AccountType =
  | 'checking'
  | 'savings'
  | 'credit'
  | 'investment'
  | 'pension'
  | 'other'

export type HolderType = 'anjan' | 'kate' | 'joint'

export type CategoryType = 'income' | 'expense'

export type TransactionType = 'income' | 'expense' | 'transfer'

export type AssetClassType =
  | 'cash'
  | 'equities'
  | 'private_equity'
  | 'private_debt'
  | 'crypto'
  | 'car'
  | 'debt'

export type LiquidityTier =
  | 't1_instant'
  | 't2_days'
  | 't2_5_locked'
  | 't3_locked_years'

// ────────────────────────────────────────────────
// Database row types
// ────────────────────────────────────────────────

export interface Profile {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  default_currency: string
  created_at: string
  updated_at: string
}

export interface Account {
  id: string
  user_id: string
  name: string
  institution: string | null
  account_type: AccountType
  holder: HolderType
  currency: string
  current_balance: number
  asset_class: AssetClassType
  liquidity_tier: LiquidityTier
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Category {
  id: string
  user_id: string | null
  name: string
  type: CategoryType
  icon_name: string
  color_hex: string
  is_system: boolean
  sort_order: number
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  account_id: string
  category_id: string | null
  type: TransactionType
  amount: number
  currency: string
  amount_usd: number | null
  description: string
  merchant_name: string | null
  transaction_date: string
  notes: string | null
  is_recurring: boolean
  transfer_account_id: string | null
  created_at: string
  updated_at: string
}

export interface MerchantMapping {
  id: string
  user_id: string
  pattern: string
  category_id: string
  merchant_display_name: string | null
  confidence: number
  created_at: string
}

export interface BalanceSnapshot {
  id: string
  account_id: string
  balance: number
  balance_usd: number
  snapshot_date: string
  created_at: string
}

export interface NetWorthSnapshot {
  id: string
  user_id: string
  total_net_worth_usd: number
  total_assets_usd: number
  total_liabilities_usd: number
  breakdown_json: Record<string, unknown>
  snapshot_date: string
  created_at: string
}

export interface FxRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  rate_date: string
  source: string | null
  created_at: string
}

// ────────────────────────────────────────────────
// Joined / enriched types
// ────────────────────────────────────────────────

export interface TransactionWithRelations extends Transaction {
  category?: Category
  account?: Account
}

// ────────────────────────────────────────────────
// Dashboard types
// ────────────────────────────────────────────────

export interface MonthlySummary {
  totalIncome: number
  totalSpending: number
  netSavings: number
  savingsRate: number
  byCategory: CategoryBreakdown[]
}

export interface CategoryBreakdown {
  categoryId: string
  categoryName: string
  color: string
  amount: number
  percentage: number
}

export interface NetWorthSummary {
  totalNetWorth: number
  previousNetWorth: number
  change: number
  changePercent: number
  byAssetClass: AssetClassBreakdown[]
  byLiquidity: LiquidityBreakdown[]
  byHolder: HolderBreakdown[]
}

export interface AssetClassBreakdown {
  assetClass: AssetClassType
  label: string
  amount: number
  percentage: number
}

export interface LiquidityBreakdown {
  tier: LiquidityTier
  label: string
  amount: number
  percentage: number
}

export interface HolderBreakdown {
  holder: HolderType
  label: string
  amount: number
  percentage: number
}
