import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { gocardlessConfigured, listInstitutions } from '@/lib/gocardless'

// GET /api/banks/institutions?country=gb — the banks you can connect. Admin only.
export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  if (!gocardlessConfigured()) return NextResponse.json({ configured: false, institutions: [] })
  try {
    const country = request.nextUrl.searchParams.get('country') || 'gb'
    const list = await listInstitutions(country)
    return NextResponse.json({
      configured: true,
      institutions: list.map((i) => ({ id: i.id, name: i.name, logo: i.logo })),
    })
  } catch (error) {
    console.error('Failed to list institutions:', error)
    return NextResponse.json({ error: 'Failed to list banks' }, { status: 500 })
  }
}
