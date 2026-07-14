import { NextResponse } from 'next/server'
import { getUsdRates } from '@/lib/fx'

// ---------------------------------------------------------------------------
// GET /api/fx — live USD conversion rates (cached daily in fx_rates)
// Response: { rates: { AED_USD, GBP_USD, ... , USD_USD: 1 }, date, source }
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const result = await getUsdRates()
    return NextResponse.json(result)
  } catch (error) {
    console.error('Failed to fetch FX rates:', error)
    return NextResponse.json({ error: 'Failed to fetch FX rates' }, { status: 500 })
  }
}
