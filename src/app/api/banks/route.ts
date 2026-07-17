import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth'
import {
  enableBankingConfigured,
  startAuth,
  getAccountTransactions,
} from '@/lib/enablebanking'
import {
  listBankConnections,
  getBankConnection,
  insertBankConnection,
  setBankConnectionAccount,
  markBankConnectionSynced,
  deleteBankConnection,
  createTransactions,
  type NewTransaction,
} from '@/lib/db'
import { getUsdRates } from '@/lib/fx'

// ---------------------------------------------------------------------------
// GET  /api/banks — configured flag + the list of bank connections.
// POST /api/banks — { action: 'link'|'sync'|'map'|'delete', ... }
// Admin only. Dormant until ENABLE_BANKING_APP_ID / ENABLE_BANKING_PRIVATE_KEY.
// The consent redirect is handled by GET /api/banks/callback.
// ---------------------------------------------------------------------------

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  if (!enableBankingConfigured()) return NextResponse.json({ configured: false, connections: [] })
  try {
    const res = await listBankConnections()
    const connections = res.rows.map((r) => ({
      id: r.id,
      institutionName: r.institution_name,
      status: r.status,
      accountCount: Array.isArray(r.gc_account_ids) ? r.gc_account_ids.length : 0,
      mappedAccountId: r.account_id,
      mappedAccountName: r.mapped_account_name,
      lastSyncedAt: r.last_synced_at,
    }))
    return NextResponse.json({ configured: true, connections })
  } catch (error) {
    console.error('Failed to list bank connections:', error)
    return NextResponse.json({ error: 'Failed to list bank connections' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  if (!enableBankingConfigured()) {
    return NextResponse.json(
      { error: 'Enable Banking is not configured. Add ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY in Vercel.' },
      { status: 503 },
    )
  }

  try {
    const body = await request.json()
    const action = body?.action as string

    if (action === 'link') {
      // institutionId encodes "name|country" from the institutions endpoint.
      const institutionId = String(body.institutionId || '')
      const [aspspName, aspspCountry] = institutionId.split('|')
      if (!aspspName || !aspspCountry) {
        return NextResponse.json({ error: 'Pick a bank first.' }, { status: 400 })
      }
      const proto = request.headers.get('x-forwarded-proto') || 'https'
      const host = request.headers.get('host') || request.nextUrl.host
      const redirectUrl = `${proto}://${host}/api/banks/callback`
      const state = crypto.randomUUID()
      const auth = await startAuth({ aspspName, aspspCountry, redirectUrl, state })
      await insertBankConnection(state, aspspCountry, aspspName)
      return NextResponse.json({ link: auth.url })
    }

    if (action === 'map') {
      await setBankConnectionAccount(String(body.id), body.accountId || null)
      return NextResponse.json({ success: true })
    }

    if (action === 'delete') {
      await deleteBankConnection(String(body.id))
      return NextResponse.json({ success: true })
    }

    if (action === 'sync') {
      const conn = await getBankConnection(String(body.id))
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      if (!conn.account_id) {
        return NextResponse.json({ error: 'Map this bank to a Flow account first.' }, { status: 400 })
      }
      const accountUids: string[] = Array.isArray(conn.gc_account_ids) ? conn.gc_account_ids : []
      if (accountUids.length === 0) {
        return NextResponse.json({ error: 'No accounts yet — reconnect the bank to grant access.' }, { status: 400 })
      }

      // FX for non-USD amounts.
      let rates: Record<string, number> = { USD_USD: 1 }
      try {
        const fx = await getUsdRates()
        rates = { ...rates, ...fx.rates }
      } catch {
        /* leave USD-only */
      }

      // Only pull since the last sync (with a small overlap) to keep it light;
      // dedupe handles any repeats.
      const dateFrom = conn.last_synced_at
        ? new Date(new Date(conn.last_synced_at).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : undefined

      const rows: NewTransaction[] = []
      for (const uid of accountUids) {
        const txns = await getAccountTransactions(uid, dateFrom)
        for (const t of txns) {
          // Skip still-pending entries; they get re-fetched as booked later.
          if (t.status && t.status !== 'BOOK') continue
          const date = t.booking_date || t.value_date || t.transaction_date
          if (!date) continue
          const raw = parseFloat(t.transaction_amount?.amount ?? '')
          if (isNaN(raw)) continue
          const currency = t.transaction_amount?.currency || 'USD'
          const isIncome = t.credit_debit_indicator === 'CRDT'
          const description =
            (t.remittance_information && t.remittance_information.join(' ')) ||
            t.creditor?.name ||
            t.debtor?.name ||
            'Transaction'
          const magnitude = Math.abs(raw)
          const rate = rates[`${currency}_USD`]
          const amountUsd = currency === 'USD' ? magnitude : rate ? magnitude * rate : null
          const stable = t.entry_reference || `${date}|${raw}|${description}`
          const dedupeHash = crypto.createHash('sha256').update(`eb|${uid}|${stable}`).digest('hex')
          rows.push({
            date,
            description,
            amountLocal: magnitude,
            currency,
            amountUsd,
            categoryId: null,
            accountId: conn.account_id,
            type: isIncome ? 'income' : 'expense',
            isInternalTransfer: false,
            isBusinessExpense: false,
            dedupeHash,
          })
        }
      }

      const { inserted, skipped } = await createTransactions(rows)
      await markBankConnectionSynced(conn.id)
      return NextResponse.json({ success: true, inserted, skipped, scanned: rows.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Bank action failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Bank action failed' }, { status: 500 })
  }
}
