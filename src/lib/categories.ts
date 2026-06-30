import type { MerchantMapping } from './types'

// ────────────────────────────────────────────────
// Category definition type
// ────────────────────────────────────────────────

export interface CategoryDefinition {
  id: string
  name: string
  iconName: string
  colorHex: string
}

// ────────────────────────────────────────────────
// Expense categories (17)
// ────────────────────────────────────────────────

export const EXPENSE_CATEGORIES: CategoryDefinition[] = [
  { id: 'exp_dining',          name: 'Dining & Coffee',        iconName: 'coffee',         colorHex: '#F97316' },
  { id: 'exp_groceries',      name: 'Groceries',              iconName: 'shopping-cart',   colorHex: '#84CC16' },
  { id: 'exp_health',         name: 'Health & Wellness',      iconName: 'heart-pulse',     colorHex: '#EC4899' },
  { id: 'exp_personal_care',  name: 'Personal Care',          iconName: 'scissors',        colorHex: '#A855F7' },
  { id: 'exp_car',            name: 'Car',                    iconName: 'car',             colorHex: '#6366F1' },
  { id: 'exp_taxis',          name: 'Taxis & Rideshare',      iconName: 'map-pin',         colorHex: '#8B5CF6' },
  { id: 'exp_household',      name: 'Household',              iconName: 'home',            colorHex: '#14B8A6' },
  { id: 'exp_bills',          name: 'Bills & Utilities',      iconName: 'file-text',       colorHex: '#64748B' },
  { id: 'exp_entertainment',  name: 'Entertainment',          iconName: 'film',            colorHex: '#EF4444' },
  { id: 'exp_shopping',       name: 'Shopping',               iconName: 'shopping-bag',    colorHex: '#3B82F6' },
  { id: 'exp_subscriptions',  name: 'Subscriptions',          iconName: 'repeat',          colorHex: '#06B6D4' },
  { id: 'exp_professional',   name: 'Professional Services',  iconName: 'briefcase',       colorHex: '#78716C' },
  { id: 'exp_travel',         name: 'Travel & Holidays',      iconName: 'plane',           colorHex: '#F59E0B' },
  { id: 'exp_gifts',          name: 'Gifts',                  iconName: 'gift',            colorHex: '#D946EF' },
  { id: 'exp_cash',           name: 'Cash',                   iconName: 'banknote',        colorHex: '#71717A' },
  { id: 'exp_bank_fees',      name: 'Bank Fees',              iconName: 'landmark',        colorHex: '#94A3B8' },
  { id: 'exp_business',       name: 'Business Expenses',      iconName: 'building-2',      colorHex: '#1E293B' },
]

// ────────────────────────────────────────────────
// Income categories (8)
// ────────────────────────────────────────────────

export const INCOME_CATEGORIES: CategoryDefinition[] = [
  { id: 'inc_salary',          name: 'Salary',              iconName: 'briefcase',     colorHex: '#10B981' },
  { id: 'inc_bank_interest',   name: 'Bank Interest',       iconName: 'landmark',      colorHex: '#059669' },
  { id: 'inc_dividends',       name: 'Dividends',           iconName: 'trending-up',   colorHex: '#0D9488' },
  { id: 'inc_cashback',        name: 'Cashback',            iconName: 'rotate-ccw',    colorHex: '#0891B2' },
  { id: 'inc_refunds',         name: 'Refunds',             iconName: 'undo-2',        colorHex: '#2563EB' },
  { id: 'inc_reimbursements',  name: 'Reimbursements',      iconName: 'receipt',        colorHex: '#7C3AED' },
  { id: 'inc_gifts_received',  name: 'Gifts Received',      iconName: 'gift',          colorHex: '#DB2777' },
  { id: 'inc_inheritance',     name: 'Inheritance',          iconName: 'scroll',        colorHex: '#4338CA' },
]

// ────────────────────────────────────────────────
// Keyword-to-category mapping for auto-categorization
// ────────────────────────────────────────────────

export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  // Expense categories
  exp_dining: [
    'restaurant', 'cafe', 'coffee', 'starbucks', 'costa', 'mcdonald', 'kfc',
    'nando', 'pizza', 'burger', 'uber eats', 'deliveroo', 'zomato', 'talabat',
    'careem food',
  ],
  exp_groceries: [
    'carrefour', 'lulu', 'spinneys', 'waitrose', 'tesco', 'sainsbury', 'coop',
    'aldi', 'lidl', 'grocery', 'supermarket',
  ],
  exp_health: [
    'pharmacy', 'hospital', 'doctor', 'clinic', 'dental', 'gym', 'fitness',
    'health', 'medical', 'physio',
  ],
  exp_personal_care: [
    'salon', 'barber', 'haircut', 'spa', 'beauty', 'nail',
  ],
  exp_car: [
    'fuel', 'petrol', 'gas station', 'adnoc', 'enoc', 'parking', 'salik',
    'toll', 'car wash', 'rta', 'maintenance', 'service center',
  ],
  exp_taxis: [
    'uber', 'careem', 'taxi', 'cab', 'bolt', 'lyft',
  ],
  exp_household: [
    'ikea', 'ace hardware', 'home centre', 'maintenance', 'cleaning', 'maid',
    'laundry',
  ],
  exp_bills: [
    'du', 'etisalat', 'dewa', 'sewa', 'internet', 'phone', 'electricity',
    'water', 'gas bill', 'rent', 'insurance',
  ],
  exp_entertainment: [
    'cinema', 'movie', 'netflix', 'spotify', 'theatre', 'concert', 'museum',
    'vox',
  ],
  exp_shopping: [
    'amazon', 'noon', 'namshi', 'zara', 'h&m', 'mall', 'clothing',
    'electronics',
  ],
  exp_subscriptions: [
    'subscription', 'monthly', 'annual', 'membership', 'apple', 'google storage',
    'chatgpt', 'claude',
  ],
  exp_professional: [
    'legal', 'accountant', 'lawyer', 'consultant', 'notary', 'translation',
  ],
  exp_travel: [
    'airline', 'flight', 'hotel', 'booking', 'airbnb', 'emirates', 'etihad',
    'flydubai', 'airport',
  ],
  exp_gifts: [
    'gift', 'present', 'flowers', 'donation', 'charity',
  ],
  exp_cash: [
    'atm', 'cash withdrawal', 'cash deposit',
  ],
  exp_bank_fees: [
    'bank fee', 'charge', 'interest charge', 'annual fee', 'late fee',
  ],
  exp_business: [
    'coworking', 'business', 'client', 'conference', 'co-working',
  ],

  // Income categories
  inc_salary: [
    'salary', 'wages', 'payroll',
  ],
  inc_bank_interest: [
    'interest earned', 'interest credit',
  ],
  inc_dividends: [
    'dividend',
  ],
  inc_cashback: [
    'cashback', 'cash back', 'reward',
  ],
  inc_refunds: [
    'refund', 'reversal', 'credit',
  ],
  inc_reimbursements: [
    'reimbursement', 'expense claim',
  ],
  inc_gifts_received: [
    'gift received', 'transfer from',
  ],
  inc_inheritance: [
    'inheritance', 'estate',
  ],
}

// ────────────────────────────────────────────────
// All categories combined (convenience lookup)
// ────────────────────────────────────────────────

export const ALL_CATEGORIES: CategoryDefinition[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
]

// ────────────────────────────────────────────────
// Auto-categorization engine
// ────────────────────────────────────────────────

export function suggestCategory(
  description: string,
  merchantMappings: MerchantMapping[],
): { categoryId: string; confidence: number; categoryName: string } | null {
  const descLower = description.toLowerCase()

  // 1. Check merchant mappings first (highest confidence)
  for (const mapping of merchantMappings) {
    if (descLower.includes(mapping.pattern.toLowerCase())) {
      const category = ALL_CATEGORIES.find((c) => c.id === mapping.category_id)
      if (category) {
        return {
          categoryId: mapping.category_id,
          confidence: mapping.confidence,
          categoryName: category.name,
        }
      }
    }
  }

  // 2. Fall back to keyword matching
  let bestMatch: { categoryId: string; keywordLength: number } | null = null

  for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (descLower.includes(keyword.toLowerCase())) {
        // Prefer longer keyword matches (more specific)
        if (!bestMatch || keyword.length > bestMatch.keywordLength) {
          bestMatch = { categoryId, keywordLength: keyword.length }
        }
      }
    }
  }

  if (bestMatch) {
    const category = ALL_CATEGORIES.find((c) => c.id === bestMatch.categoryId)
    if (category) {
      return {
        categoryId: bestMatch.categoryId,
        confidence: 0.6,
        categoryName: category.name,
      }
    }
  }

  return null
}
