'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { Landmark, RefreshCw, Plus, Trash2 } from 'lucide-react'
import { Select } from '@/components/ui/Select'

interface Connection {
  id: string
  institutionName: string
  status: string
  accountCount: number
  mappedAccountId: string | null
  mappedAccountName: string | null
  lastSyncedAt: string | null
}
interface Inst { id: string; name: string }
interface Acct { id: string; name: string }

export function BankConnections() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [connections, setConnections] = useState<Connection[]>([])
  const [accounts, setAccounts] = useState<Acct[]>([])
  const [institutions, setInstitutions] = useState<Inst[]>([])
  const [pickInst, setPickInst] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([fetch('/api/banks'), fetch('/api/accounts')])
      const bd = await b.json()
      const ad = a.ok ? await a.json() : { accounts: [] }
      setConfigured(bd.configured)
      setConnections(bd.connections || [])
      setAccounts(ad.accounts || [])
    } catch {
      setConfigured(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  // Landing back from the bank's consent screen: the callback route stores the
  // session and redirects here with ?bank=connected|error. Show a note, then
  // strip the param and refresh the list.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const bank = params.get('bank')
    if (!bank) return
    if (bank === 'connected') setMsg('Bank connected. Map it to a Flow account below, then hit Sync.')
    else if (bank === 'error') setMsg('Could not finish connecting. Please try again.')
    params.delete('bank')
    const qs = params.toString()
    window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''))
    load()
  }, [load])

  const loadInstitutions = useCallback(async () => {
    if (institutions.length) return
    try {
      const r = await fetch('/api/banks/institutions?country=gb')
      const d = await r.json()
      setInstitutions(d.institutions || [])
    } catch {
      /* ignore */
    }
  }, [institutions.length])

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true)
    setMsg(null)
    try {
      const r = await fetch('/api/banks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      })
      const d = await r.json()
      if (!r.ok) {
        setMsg(d.error || 'Something went wrong.')
        return null
      }
      return d
    } catch {
      setMsg('Request failed.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function connect() {
    if (!pickInst) return
    const inst = institutions.find((i) => i.id === pickInst)
    const d = await act('link', { institutionId: pickInst, institutionName: inst?.name })
    if (d?.link) {
      window.open(d.link, '_blank', 'noopener')
      setMsg('Authorise at your bank in the new tab — it returns here automatically. Then map the connection to a Flow account and hit Sync.')
      setPickInst('')
      await load()
    }
  }

  if (configured === null) return null

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
        <Landmark className="h-4 w-4 text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900">Bank connections</h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">UK · Open Banking</span>
      </div>

      {!configured ? (
        <div className="px-6 py-5 text-sm text-gray-500">
          <p>
            Connect UK/EU bank accounts to auto-import transactions (via Enable Banking — free for your own accounts). To enable, add{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">ENABLE_BANKING_APP_ID</code> and{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">ENABLE_BANKING_PRIVATE_KEY</code> in Vercel → Project → Settings → Environment Variables, then redeploy.
          </p>
          <p className="mt-2 text-xs text-gray-400">
            Sign up free at enablebanking.com → Control Panel: register an application, generate a key pair (the private key downloads as a .pem — paste its contents into <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">ENABLE_BANKING_PRIVATE_KEY</code>), and add this redirect URL to the app:{' '}
            <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">{origin}/api/banks/callback</code>. (UAE banks aren&rsquo;t supported — keep using statement import for those.)
          </p>
        </div>
      ) : (
        <div className="px-6 py-4">
          {/* Connect a new bank */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Select
              value={pickInst}
              onChange={setPickInst}
              searchable
              placeholder="Choose a UK bank…"
              ariaLabel="Bank"
              options={institutions.map((i) => ({ value: i.id, label: i.name }))}
              buttonClassName="inline-flex h-9 min-w-[220px] items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm hover:bg-gray-50"
            />
            <button
              onClick={() => loadInstitutions()}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-50"
              title="Load the list of banks"
            >
              Load banks
            </button>
            <button
              onClick={connect}
              disabled={busy || !pickInst}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Connect
            </button>
          </div>

          {msg && <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-800">{msg}</p>}

          {connections.length === 0 ? (
            <p className="text-sm text-gray-400">No banks connected yet.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {connections.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{c.institutionName}</p>
                    <p className="text-xs text-gray-400">
                      {c.status} · {c.accountCount} account{c.accountCount !== 1 ? 's' : ''}
                      {c.lastSyncedAt ? ` · synced ${new Date(c.lastSyncedAt).toLocaleDateString('en-GB')}` : ''}
                    </p>
                  </div>
                  <Select
                    value={c.mappedAccountId ?? ''}
                    onChange={(v) => act('map', { id: c.id, accountId: v || null }).then(load)}
                    ariaLabel="Map to Flow account"
                    placeholder="Map to account…"
                    options={[{ value: '', label: 'Unmapped' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]}
                    buttonClassName="inline-flex h-8 min-w-[150px] items-center justify-between gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-600 hover:bg-gray-50"
                  />
                  <button
                    onClick={() => act('sync', { id: c.id }).then((d) => { if (d) setMsg(`Imported ${d.inserted} new transaction${d.inserted !== 1 ? 's' : ''} (${d.skipped} already had).`); load() })}
                    disabled={busy}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    title="Import transactions now"
                  >
                    <RefreshCw className="h-3 w-3" /> Sync
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remove the ${c.institutionName} connection?`)) act('delete', { id: c.id }).then(load) }}
                    disabled={busy}
                    className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
