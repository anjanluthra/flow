// ────────────────────────────────────────────────
// Default FX rates (to USD)
// ────────────────────────────────────────────────

export const DEFAULT_FX_RATES: Record<string, number> = {
  'GBP_USD': 1.3231,
  'AED_USD': 0.272294,  // 1 / 3.6725
  'USD_USD': 1.0,
}

// ────────────────────────────────────────────────
// Conversion
// ────────────────────────────────────────────────

/**
 * Convert an amount from a given currency to USD.
 * Uses the provided rates map or falls back to DEFAULT_FX_RATES.
 * The rates key format is `{FROM}_USD`, e.g. `GBP_USD`.
 *
 * Returns the original amount if the currency is already USD,
 * or if no rate is found (assumes 1:1 as a safe fallback).
 */
export function convertToUSD(
  amount: number,
  fromCurrency: string,
  rates?: Record<string, number>,
): number {
  const currency = fromCurrency.toUpperCase()

  if (currency === 'USD') {
    return amount
  }

  const rateMap = rates ?? DEFAULT_FX_RATES
  const key = `${currency}_USD`
  const rate = rateMap[key]

  if (rate === undefined) {
    // No rate available — return unconverted so callers can handle
    return amount
  }

  return amount * rate
}

// ────────────────────────────────────────────────
// Currency symbols
// ────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  GBP: '£',   // £
  AED: 'AED',
  EUR: '€',   // €
  INR: '₹',   // ₹
}

/**
 * Return the display symbol for a currency code.
 * Falls back to the code itself (e.g. "JPY").
 */
export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency.toUpperCase()] ?? currency.toUpperCase()
}

// ────────────────────────────────────────────────
// Locale mapping for Intl.NumberFormat
// ────────────────────────────────────────────────

const CURRENCY_LOCALE: Record<string, string> = {
  USD: 'en-US',
  GBP: 'en-GB',
  AED: 'en-AE',
  EUR: 'de-DE',
  INR: 'en-IN',
}

// ────────────────────────────────────────────────
// Formatting
// ────────────────────────────────────────────────

/**
 * Format a monetary amount with the appropriate currency symbol
 * and locale-aware grouping / decimals.
 *
 * Examples:
 *   formatCurrency(1234.56, 'USD')  → "$1,234.56"
 *   formatCurrency(1234.56, 'GBP')  → "£1,234.56"
 *   formatCurrency(1234.56, 'AED')  → "AED 1,234.56"
 */
export function formatCurrency(amount: number, currency: string): string {
  const code = currency.toUpperCase()
  const locale = CURRENCY_LOCALE[code] ?? 'en-US'

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

/**
 * Shorthand: format a value as USD.
 */
export function formatUSD(amount: number): string {
  return formatCurrency(amount, 'USD')
}
