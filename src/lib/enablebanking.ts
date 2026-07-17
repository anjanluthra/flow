// ---------------------------------------------------------------------------
// Enable Banking — UK/EU open-banking (PSD2 AIS) client.
//
// Reads live transactions from a connected bank. Free self-serve tier
// ("Restricted Production" whitelists your own accounts). Replaces GoCardless
// Bank Account Data, which closed to new signups.
//
// Auth is a short-lived RS256 JWT signed with the application's private key:
//   header  { typ: 'JWT', alg: 'RS256', kid: <application id> }
//   payload { iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp }
// Sign it with Node's crypto (no extra dependency). Everything is gated on
// enableBankingConfigured() so the app is unaffected until the keys exist.
//
// Set up at enablebanking.com → Control Panel: register an application, generate
// a key pair (download the .pem), and whitelist the redirect URL. Then set
// ENABLE_BANKING_APP_ID and ENABLE_BANKING_PRIVATE_KEY (the PEM contents).
// ---------------------------------------------------------------------------

import crypto from 'crypto'

const BASE = 'https://api.enablebanking.com'

export function enableBankingConfigured(): boolean {
  return !!(process.env.ENABLE_BANKING_APP_ID && process.env.ENABLE_BANKING_PRIVATE_KEY)
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Vercel env values keep real newlines, but support the common `\n`-escaped
// form too so pasting a single-line key still works.
function privateKeyPem(): string {
  const raw = process.env.ENABLE_BANKING_PRIVATE_KEY || ''
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw
}

function signJwt(): string {
  const appId = process.env.ENABLE_BANKING_APP_ID
  if (!appId) throw new Error('ENABLE_BANKING_APP_ID is not set')
  const iat = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: appId }))
  const payload = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 }))
  const signingInput = `${header}.${payload}`
  const signature = crypto.sign('RSA-SHA256', Buffer.from(signingInput), privateKeyPem())
  return `${signingInput}.${b64url(signature)}`
}

async function eb<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      accept: 'application/json',
      Authorization: `Bearer ${signJwt()}`,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`Enable Banking ${path} → ${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export interface EbAspsp {
  name: string
  country: string
  logo?: string
}

// List the banks (ASPSPs) available in a country. Country is ISO-3166 alpha-2
// uppercase (e.g. GB).
export function listAspsps(country = 'GB') {
  return eb<{ aspsps: EbAspsp[] }>(`/aspsps?country=${encodeURIComponent(country.toUpperCase())}`).then(
    (d) => d.aspsps ?? [],
  )
}

// Start an authorisation — returns the hosted consent URL the user opens to
// approve access at their bank. `state` is echoed back on the redirect so we
// can tie the returned code to this connection.
export async function startAuth(opts: {
  aspspName: string
  aspspCountry: string
  redirectUrl: string
  state: string
}) {
  // PSD2 consents last up to 90 days before re-authorisation is required.
  const validUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
  return eb<{ url: string; authorization_id?: string }>(`/auth`, {
    method: 'POST',
    body: JSON.stringify({
      access: { valid_until: validUntil },
      aspsp: { name: opts.aspspName, country: opts.aspspCountry.toUpperCase() },
      state: opts.state,
      redirect_url: opts.redirectUrl,
      psu_type: 'personal',
    }),
  })
}

export interface EbAccount {
  uid: string
  account_id?: { iban?: string; other?: { identification?: string } }
  name?: string
  currency?: string
  product?: string
}

// Exchange the redirect `code` for a session — returns the session id and the
// list of accounts the user granted access to.
export function createSession(code: string) {
  return eb<{ session_id: string; accounts: EbAccount[]; aspsp?: { name: string; country: string } }>(`/sessions`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  })
}

export interface EbTransaction {
  entry_reference?: string
  transaction_amount: { amount: string; currency: string }
  credit_debit_indicator?: 'CRDT' | 'DBIT'
  status?: string // BOOK | PDNG
  booking_date?: string
  value_date?: string
  transaction_date?: string
  remittance_information?: string[]
  creditor?: { name?: string }
  debtor?: { name?: string }
}

// Pull an account's transactions, following continuation_key pagination.
// Capped at a sane number of pages so a misbehaving bank can't loop forever.
export async function getAccountTransactions(accountUid: string, dateFrom?: string): Promise<EbTransaction[]> {
  const out: EbTransaction[] = []
  let continuationKey: string | undefined
  let pages = 0
  do {
    const params = new URLSearchParams()
    if (dateFrom) params.set('date_from', dateFrom)
    if (continuationKey) params.set('continuation_key', continuationKey)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const d = await eb<{ transactions: EbTransaction[]; continuation_key?: string }>(
      `/accounts/${accountUid}/transactions${qs}`,
    )
    out.push(...(d.transactions ?? []))
    continuationKey = d.continuation_key
    pages += 1
  } while (continuationKey && pages < 25)
  return out
}
