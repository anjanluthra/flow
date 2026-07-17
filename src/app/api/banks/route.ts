import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { requireAdmin } from '@/lib/auth'
import {
  gocardlessConfigured,
  createRequisition,
  getRequisition,
  getAccountTransactions,
} from '@/lib/gocardless'
import {
  listBankConnections,
  getBankConnection,
  insertBankConnection,
  updateBankConnectionStatus,
  setBankConnectionAccount,
  markBankConnectionSynced,
  deleteBankConnection,
  createTransactions,
  type NewTransaction,
} from '@/lib/db'
import { getUsdRates } from '@/lib/fx'

// ---------------------------------------------------------------------------
// GET  /api/banks — configured flag + the list of bank connections.
// POST /api/banks — { action: 'link'|'refresh'|'sync'|'map'|'delete', ... }
// Admin only. Dormant until GOCARDLESS_SECRET_ID/KEY are set.
// ---------------------------------------------------------------------------

export async function GET() {
  const denied = await requireAdmin()
  if (denied) return denied
  const configured = gocardlessConfigured()
  if (!configured) return NextResponse.json({ configured: false, connections: [] })
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
  if (!gocardlessConfigured()) {
    return NextResponse.json({ error: 'GoCardless is not configured. Add GOCARDLESS_SECRET_ID and GOCARDLESS_SECRET_KEY in Vercel.' }, { status: 503 })
  }

  try {
    const body = await request.json()
    const action = body?.action as string

    if (action === 'link') {
      const institutionId = String(body.institutionId || '')
      const institutionName = String(body.institutionName || institutionId)
      if (!institutionId) return NextResponse.json({ error: 'institutionId required' }, { status: 400 })
      const proto = request.headers.get('x-forwarded-proto') || 'https'
      const host = request.headers.get('host') || request.nextUrl.host
      const redirect = `${proto}://${host}/settings?bank=connected`
      const reference = crypto.randomUUID()
      const req = await createRequisition(institutionId, redirect, reference)
      await insertBankConnection(req.id, institutionId, institutionName)
      return NextResponse.json({ link: req.link, requisitionId: req.id })
    }

    if (action === 'refresh') {
      const conn = await getBankConnection(String(body.id))
      if (!conn) return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
      const req = await getRequisition(conn.requisition_id)
      await updateBankConnectionStatus(conn.id, req.status, req.accounts ?? [])
      return NextResponse.json({ status: req.status, accountCount: (req.accounts ?? []).length })
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
      const accountIds: string[] = Array.isArray(conn.gc_account_ids) ? conn.gc_account_ids : []
      if (accountIds.length === 0) {
        return NextResponse.json({ error: 'No accounts yet — hit Refresh after authorising at your bank.' }, { status: 400 })
      }

      // FX for non-USD amounts.
      let rates: Record<string, number> = { USD_USD: 1 }
      try {
        const fx = await getUsdRates()
        rates = { ...rates, ...fx.rates }
      } catch { /* leave USD-only */ }

      // Only pull since the last sync (with a small overlap) to keep it light;
      // dedupe handles any repeats.
      const dateFrom = conn.last_synced_at
        ? new Date(new Date(conn.last_synced_at).getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
        : undefined

      const rows: NewTransaction[] = []
      for (const acc of accountIds) {
        const data = await getAccountTransactions(acc, dateFrom)
        for (const t of data.transactions?.booked ?? []) {
          const date = t.bookingDate || t.valueDate
          if (!date) continue
          const raw = parseFloat(t.transactionAmount.amount)
          if (isNaN(raw)) continue
          const currency = t.transactionAmount.currency || 'USD'
          const description =
            t.remittanceInformationUnstructured ||
            t.remittanceInformationUnstructuredArray?.join(' ') ||
            t.creditorName || t.debtorName || 'Transaction'
          const magnitude = Math.abs(raw)
          const rate = rates[`${currency}_USD`]
          const amountUsd = currency === 'USD' ? magnitude : rate ? magnitude * rate : null
          const stable = t.transactionId || t.internalTransactionId || `${date}|${raw}|${description}`
          const dedupeHash = crypto.createHash('sha256').update(`gc|${acc}|${stable}`).digest('hex')
          rows.push({
            date,
            description,
            amountLocal: magnitude,
            currency,
            amountUsd,
            categoryId: null,
            accountId: conn.account_id,
            type: raw < 0 ? 'expense' : 'income',
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
