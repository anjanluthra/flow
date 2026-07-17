// ---------------------------------------------------------------------------
// GoCardless Bank Account Data (ex-Nordigen) — UK/EU open-banking client.
//
// Reads live transactions + balances from a connected bank. Free tier.
// Requires GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY (from
// bankaccountdata.gocardless.com → Developers → User secrets). Everything is
// gated on gocardlessConfigured() so the app is unaffected until keys exist.
// ---------------------------------------------------------------------------

const BASE = 'https://bankaccountdata.gocardless.com/api/v2'

export function gocardlessConfigured(): boolean {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY)
}

let cachedToken: { access: string; exp: number } | null = null

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) return cachedToken.access
  const res = await fetch(`${BASE}/token/new/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  })
  if (!res.ok) throw new Error(`GoCardless token failed: ${res.status} ${await res.text()}`)
  const d = await res.json()
  cachedToken = { access: d.access, exp: Date.now() + (d.access_expires ?? 86400) * 1000 }
  return d.access
}

async function gc<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`GoCardless ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export interface GcInstitution {
  id: string
  name: string
  bic?: string
  logo?: string
  transaction_total_days?: string
}

export function listInstitutions(country = 'gb') {
  return gc<GcInstitution[]>(`/institutions/?country=${encodeURIComponent(country)}`)
}

// Create an end-user agreement + a requisition (the hosted consent link).
export async function createRequisition(institutionId: string, redirect: string, reference: string) {
  const agreement = await gc<{ id: string }>(`/agreements/enduser/`, {
    method: 'POST',
    body: JSON.stringify({
      institution_id: institutionId,
      max_historical_days: 365,
      access_valid_for_days: 90,
      access_scope: ['balances', 'details', 'transactions'],
    }),
  })
  return gc<{ id: string; link: string }>(`/requisitions/`, {
    method: 'POST',
    body: JSON.stringify({
      redirect,
      institution_id: institutionId,
      agreement: agreement.id,
      reference,
      user_language: 'EN',
    }),
  })
}

export function getRequisition(id: string) {
  return gc<{ id: string; status: string; accounts: string[]; institution_id: string }>(`/requisitions/${id}/`)
}

export interface GcBookedTxn {
  transactionId?: string
  internalTransactionId?: string
  bookingDate?: string
  valueDate?: string
  transactionAmount: { amount: string; currency: string }
  remittanceInformationUnstructured?: string
  remittanceInformationUnstructuredArray?: string[]
  creditorName?: string
  debtorName?: string
}

export function getAccountTransactions(accountId: string, dateFrom?: string) {
  const q = dateFrom ? `?date_from=${dateFrom}` : ''
  return gc<{ transactions: { booked: GcBookedTxn[]; pending: GcBookedTxn[] } }>(
    `/accounts/${accountId}/transactions/${q}`,
  )
}

export function getAccountDetails(accountId: string) {
  return gc<{ account: { iban?: string; name?: string; currency?: string; ownerName?: string } }>(
    `/accounts/${accountId}/details/`,
  )
}
