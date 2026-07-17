import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { enableBankingConfigured, listAspsps } from '@/lib/enablebanking'

// GET /api/banks/institutions?country=gb — the banks you can connect. Admin only.
export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  if (!enableBankingConfigured()) return NextResponse.json({ configured: false, institutions: [] })
  try {
    const country = request.nextUrl.searchParams.get('country') || 'GB'
    const list = await listAspsps(country)
    return NextResponse.json({
      configured: true,
      // id encodes name+country (Enable Banking identifies an ASPSP by both).
      institutions: list.map((a) => ({ id: `${a.name}|${a.country}`, name: a.name, logo: a.logo })),
    })
  } catch (error) {
    console.error('Failed to list institutions:', error)
    return NextResponse.json({ error: 'Failed to list banks' }, { status: 500 })
  }
}
