import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { enableBankingConfigured, createSession } from '@/lib/enablebanking'
import { getBankConnectionByState, setBankConnectionSession } from '@/lib/db'

// ---------------------------------------------------------------------------
// GET /api/banks/callback?code=…&state=… — the Enable Banking consent redirect.
// Exchanges the code for a session, stores the granted account uids against the
// pending connection (matched on `state`), then bounces back to Settings.
// This URL must be registered as a redirect URL in the Enable Banking app.
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('host') || request.nextUrl.host
  const back = (status: string) => NextResponse.redirect(`${proto}://${host}/settings?bank=${status}`)

  const denied = await requireAdmin()
  if (denied) return back('error')
  if (!enableBankingConfigured()) return back('error')

  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  if (!code || !state) return back('error')

  try {
    const conn = await getBankConnectionByState(state)
    if (!conn) return back('error')
    const session = await createSession(code)
    const uids = (session.accounts || []).map((a) => a.uid).filter(Boolean)
    await setBankConnectionSession(conn.id, session.session_id, uids)
    return back('connected')
  } catch (error) {
    console.error('Bank callback failed:', error)
    return back('error')
  }
}
