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
// Transfer categories (excluded from P&L — money moving between your own
// pockets or into investments, not income or spending)
// ────────────────────────────────────────────────

export const TRANSFER_CATEGORIES: CategoryDefinition[] = [
  { id: 'txf_internal',   name: 'Internal Transfer',  iconName: 'arrow-left-right', colorHex: '#64748B' },
  { id: 'txf_investment', name: 'Investments',        iconName: 'trending-up',      colorHex: '#0D9488' },
  { id: 'txf_cc_payment', name: 'Credit Card Payment', iconName: 'credit-card',      colorHex: '#475569' },
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

  // Transfers / investments (kept out of P&L)
  txf_internal: [
    'instant access savings', 'to savings', 'internal transfer', 'savings account',
  ],
  txf_investment: [
    'upvolt', 'vanguard', 'brokerage', 'to investment',
  ],
  // Paying down a credit-card balance — a transfer, not spending. The itemised
  // card transactions are the source of truth, so these lines are excluded.
  txf_cc_payment: [
    'payment by direct debit', 'payment received, thank you',
    'payment received - thank you', 'payment - thank you',
    'thank you for your payment', 'direct debit payment', 'card payment received',
    'payment thank you', 'bill payment to credit card',
  ],
}

// ────────────────────────────────────────────────
// All categories combined (convenience lookup)
// ────────────────────────────────────────────────

export const ALL_CATEGORIES: CategoryDefinition[] = [
  ...EXPENSE_CATEGORIES,
  ...INCOME_CATEGORIES,
  ...TRANSFER_CATEGORIES,
]

// ────────────────────────────────────────────────
// Auto-categorization engine
// ────────────────────────────────────────────────

// Bank/processor noise that prefixes the real merchant on a statement line.
// Without stripping these, every "POS Settlement <merchant>" line collapses to
// "pos settlement" and different merchants become indistinguishable — which
// breaks learning, cascading, and matching. Longest-first so the most specific
// prefix wins (e.g. "pos settlement" before "pos").
const NOISE_PREFIXES = [
  'inward telex transfer', 'outward telex transfer', 'telex transfer',
  'debit card purchase', 'card payment received', 'card payment to', 'card payment',
  'card purchase', 'point of sale', 'pos settlement', 'pos purchase', 'pos payment',
  'contactless payment', 'contactless', 'online payment to', 'online payment',
  'bill payment to', 'bill payment', 'mobile payment', 'recurring payment',
  'faster payment to', 'faster payment', 'standing order to', 'standing order',
  'direct debit to', 'direct debit', 'bank transfer to', 'transfer to',
  'transfer from', 'payment to', 'payment from', 'purchase at', 'payment',
  'purchase', 'visa purchase', 'atm withdrawal', 'cash withdrawal', 'withdrawal',
  'apple pay', 'google pay', 'pos', 'visa', 'ecom',
].sort((a, b) => b.length - a.length)

/**
 * Normalise a raw statement description down to just the merchant text: cut
 * trailing reference/value-date/currency-amount noise, drop punctuation, and
 * strip a leading bank-noise prefix. Both the pattern key and the matcher use
 * this so they always agree.
 */
export function normalizeMerchantText(description: string): string {
  let s = description.toLowerCase()
  // Cut everything from a reference/value-date/amount marker onward.
  s = s.split(/\bref[:\s]|\bvalue date\b|\btrf ccy\b|\bmandate\b/)[0]
  s = s.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  for (const p of NOISE_PREFIXES) {
    if (s === p) return ''
    if (s.startsWith(p + ' ')) {
      s = s.slice(p.length + 1).trim()
      break
    }
  }
  return s
}

/**
 * Derive a stable "merchant core" pattern from a transaction description, used
 * as the key for learned merchant->category mappings. Strips the bank prefix
 * and reference/amount noise so "POS Settlement Amazon.ae Dubai AED 31.85" and
 * "POS Settlement Amazon.ae Abu Dhabi AED 9.10" both collapse to "amazon ae".
 */
export function deriveMerchantPattern(description: string): string {
  const core = normalizeMerchantText(description)
  if (!core) return ''
  const words = core.split(' ').filter(Boolean)
  const pattern = words.slice(0, 2).join(' ')
  if (pattern.length >= 3) return pattern
  return words[0] ?? ''
}

/**
 * Does a raw description belong to a learned merchant pattern? Normalises the
 * description the same way the pattern was derived, then checks containment —
 * so "amazon ae" matches "POS Settlement Amazon.ae Dubai AED 31.85" even though
 * the raw text has "amazon.ae" with a dot.
 */
export function merchantMatches(description: string, pattern: string): boolean {
  const p = pattern.trim().toLowerCase()
  if (p.length < 3) return false
  return normalizeMerchantText(description).includes(p)
}

/**
 * Lightweight keyword categoriser returning a canonical DB category name
 * (e.g. "Dining & Coffee") or null. Single source of truth for keyword
 * matching — both the import UI and the /api/categorise route call this, so
 * category names never drift apart. Names match the seeded `categories` table.
 */
export function suggestCategoryName(description: string): string | null {
  const descLower = description.toLowerCase()

  let bestMatch: { categoryId: string; keywordLength: number } | null = null

  for (const [categoryId, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (descLower.includes(keyword.toLowerCase())) {
        if (!bestMatch || keyword.length > bestMatch.keywordLength) {
          bestMatch = { categoryId, keywordLength: keyword.length }
        }
      }
    }
  }

  if (!bestMatch) return null
  return ALL_CATEGORIES.find((c) => c.id === bestMatch!.categoryId)?.name ?? null
}

export function suggestCategory(
  description: string,
  merchantMappings: MerchantMapping[],
): { categoryId: string; confidence: number; categoryName: string } | null {
  const descLower = description.toLowerCase()

  // 1. Check merchant mappings first (highest confidence)
  for (const mapping of merchantMappings) {
    if (merchantMatches(description, mapping.pattern)) {
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
