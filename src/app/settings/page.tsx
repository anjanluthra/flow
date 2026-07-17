'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Plus, ShieldCheck, KeyRound, CheckCircle, AlertCircle, Database, Image as ImageIcon, Pencil } from 'lucide-react'
import { BankConnections } from '@/components/BankConnections'
import { Select } from '@/components/ui/Select'

// Downscale an image file to a modest JPEG data URL so uploads stay small and
// fast (max edge ~1600px). Returns { base64, mimeType }.
async function downscale(file: File): Promise<{ base64: string; mimeType: string }> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = reject
    r.readAsDataURL(file)
  })
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new window.Image()
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = dataUrl
  })
  const maxEdge = 1600
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return { base64: dataUrl.split(',')[1] ?? '', mimeType: file.type || 'image/jpeg' }
  ctx.drawImage(img, 0, 0, w, h)
  const out = canvas.toDataURL('image/jpeg', 0.85)
  return { base64: out.split(',')[1] ?? '', mimeType: 'image/jpeg' }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppUser {
  id: number
  email: string
  fullName: string | null
  role: string
  isActive: boolean
  hasPassword: boolean
  createdAt: string
}

// The two founding accounts authenticate via env vars, not DB passwords.
const ENV_USERS = new Set(['admin@joinindexed.com', 'kate@joinindexed.com'])

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { data: session } = useSession()
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === 'admin'

  const [users, setUsers] = useState<AppUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  // Category management (merge / consolidate)
  interface Cat { id: string; name: string; type: 'income' | 'expense' | 'transfer' | 'investment'; count: number }
  const [cats, setCats] = useState<Cat[]>([])
  const [mergeSources, setMergeSources] = useState<Set<string>>(new Set())
  const [mergeTarget, setMergeTarget] = useState('')
  const [mergeBusy, setMergeBusy] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const [newCatType, setNewCatType] = useState<'expense' | 'income' | 'transfer' | 'investment'>('expense')
  const [newCatBusy, setNewCatBusy] = useState(false)

  // Account management (merge / delete duplicates)
  interface Acct { id: string; name: string; currency: string; txCount: number }
  const [accts, setAccts] = useState<Acct[]>([])
  const [acctSources, setAcctSources] = useState<Set<string>>(new Set())
  const [acctTarget, setAcctTarget] = useState('')
  const [acctBusy, setAcctBusy] = useState(false)

  const loadAccts = useCallback(async () => {
    try {
      const res = await fetch('/api/accounts?counts=1')
      const data = await res.json()
      setAccts(data.accounts || [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (isAdmin) loadAccts()
  }, [isAdmin, loadAccts])

  function toggleAcctSource(id: string) {
    setAcctSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function mergeAccounts() {
    const sources = [...acctSources].filter((id) => id !== acctTarget)
    if (!acctTarget || sources.length === 0) {
      setMessage({ kind: 'err', text: 'Tick the accounts to combine and choose the one to keep.' })
      return
    }
    const targetName = accts.find((a) => a.id === acctTarget)?.name ?? 'target'
    if (!confirm(`Merge ${sources.length} account${sources.length === 1 ? '' : 's'} into "${targetName}"? All their transactions, balances and statements move to "${targetName}" and the old accounts are deleted.`))
      return
    setAcctBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/accounts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: sources, targetId: acctTarget }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Merge failed')
      setMessage({ kind: 'ok', text: `Merged into "${targetName}" — ${data.transactionsMoved} transactions moved.` })
      setAcctSources(new Set())
      setAcctTarget('')
      await loadAccts()
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Merge failed.' })
    } finally {
      setAcctBusy(false)
    }
  }

  async function renameAccount(id: string, current: string) {
    const name = window.prompt('Rename account:', current)?.trim()
    if (!name || name === current) return
    try {
      await fetch('/api/accounts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      await loadAccts()
    } catch {
      setMessage({ kind: 'err', text: 'Failed to rename account.' })
    }
  }

  async function renameCategory(id: string, current: string) {
    const name = window.prompt('Rename category:', current)?.trim()
    if (!name || name === current) return
    try {
      await fetch('/api/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      await loadCats()
    } catch {
      setMessage({ kind: 'err', text: 'Failed to rename category.' })
    }
  }

  // Add a new account
  const [newAcctName, setNewAcctName] = useState('')
  const [newAcctCcy, setNewAcctCcy] = useState('GBP')
  const [newAcctHolder, setNewAcctHolder] = useState('joint')
  const [newAcctClass, setNewAcctClass] = useState('cash')
  const [newAcctBusy, setNewAcctBusy] = useState(false)

  async function createAccount() {
    const name = newAcctName.trim()
    if (!name) return
    setNewAcctBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, currency: newAcctCcy, holder: newAcctHolder, assetClass: newAcctClass }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add account')
      setMessage({ kind: 'ok', text: `Added account “${name}”.` })
      setNewAcctName('')
      await loadAccts()
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to add account.' })
    } finally {
      setNewAcctBusy(false)
    }
  }

  async function deleteAccounts() {
    const ids = [...acctSources]
    if (ids.length === 0) return
    const withTx = ids.map((id) => accts.find((a) => a.id === id)).filter((a) => a && a.txCount > 0)
    const warn = withTx.length
      ? ` ${withTx.length} of them have transactions, which will become Unassigned.`
      : ''
    if (!confirm(`Delete ${ids.length} account${ids.length === 1 ? '' : 's'}?${warn} This can't be undone.`)) return
    setAcctBusy(true)
    setMessage(null)
    try {
      for (const id of ids) {
        await fetch(`/api/accounts?id=${id}`, { method: 'DELETE' })
      }
      setMessage({ kind: 'ok', text: `Deleted ${ids.length} account${ids.length === 1 ? '' : 's'}.` })
      setAcctSources(new Set())
      setAcctTarget('')
      await loadAccts()
    } catch {
      setMessage({ kind: 'err', text: 'Failed to delete.' })
    } finally {
      setAcctBusy(false)
    }
  }

  const loadCats = useCallback(async () => {
    try {
      const res = await fetch('/api/categories?counts=1')
      const data = await res.json()
      setCats(data.categories || [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (isAdmin) loadCats()
  }, [isAdmin, loadCats])

  async function createCategory() {
    const name = newCatName.trim()
    if (!name) return
    setNewCatBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: newCatType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add category')
      setMessage({ kind: 'ok', text: `Added category “${name}”.` })
      setNewCatName('')
      await loadCats()
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to add category.' })
    } finally {
      setNewCatBusy(false)
    }
  }

  function toggleSource(id: string) {
    setMergeSources((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function mergeCategories() {
    if (mergeSources.size === 0) {
      setMessage({ kind: 'err', text: 'Tick the categories you want to combine.' })
      return
    }

    setMergeBusy(true)
    setMessage(null)
    try {
      // Resolve the target — an existing category, or a brand-new one.
      let targetId = mergeTarget
      let targetName = cats.find((c) => c.id === mergeTarget)?.name ?? ''
      if (mergeTarget === '__new__') {
        const name = window.prompt('Name for the combined category (e.g. Travel):')?.trim()
        if (!name) {
          setMergeBusy(false)
          return
        }
        const created = await fetch('/api/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, type: 'expense' }),
        }).then((r) => r.json())
        targetId = created.category?.id
        targetName = name
      }
      const sources = [...mergeSources].filter((id) => id !== targetId)
      if (!targetId || sources.length === 0) {
        setMessage({ kind: 'err', text: 'Pick the categories to combine and the one to keep.' })
        setMergeBusy(false)
        return
      }
      if (
        !confirm(
          `Merge ${sources.length} categor${sources.length === 1 ? 'y' : 'ies'} into "${targetName}"? All their transactions (all years) move to "${targetName}" and the old categories are deleted.`,
        )
      ) {
        setMergeBusy(false)
        return
      }

      const res = await fetch('/api/categories/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceIds: sources, targetId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Merge failed')
      setMessage({ kind: 'ok', text: `Merged into "${targetName}" — ${data.transactionsMoved} transactions moved.` })
      setMergeSources(new Set())
      setMergeTarget('')
      await loadCats()
    } catch (e) {
      setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Merge failed.' })
    } finally {
      setMergeBusy(false)
    }
  }

  // Household photos
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)
  const [photoVersion, setPhotoVersion] = useState(0)
  const [photoPos, setPhotoPos] = useState<Record<string, { x: number; y: number }>>({
    login: { x: 50, y: 50 },
    hero: { x: 50, y: 50 },
  })
  const posTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    for (const slot of ['login', 'hero'] as const) {
      fetch(`/api/couple-photo?meta=1&slot=${slot}`)
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => {
          const [x, y] = String(d.position || '50% 50%').split(' ').map((s: string) => parseInt(s, 10))
          setPhotoPos((p) => ({ ...p, [slot]: { x: isNaN(x) ? 50 : x, y: isNaN(y) ? 50 : y } }))
        })
        .catch(() => {})
    }
  }, [])

  function setPos(slot: 'login' | 'hero', axis: 'x' | 'y', value: number) {
    setPhotoPos((p) => {
      const next = { ...p, [slot]: { ...p[slot], [axis]: value } }
      if (posTimer.current) clearTimeout(posTimer.current)
      posTimer.current = setTimeout(() => {
        const pos = `${next[slot].x}% ${next[slot].y}%`
        fetch('/api/couple-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slot, position: pos }),
        }).catch(() => {})
      }, 400)
      return next
    })
  }

  async function uploadPhoto(slot: 'login' | 'hero', file: File | null) {
    if (!file) return
    setPhotoBusy(slot)
    setMessage(null)
    try {
      const { base64, mimeType } = await downscale(file)
      const pos = `${photoPos[slot].x}% ${photoPos[slot].y}%`
      const res = await fetch('/api/couple-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot, contentBase64: base64, mimeType, position: pos }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error || 'Failed to upload photo.' })
        return
      }
      setPhotoVersion((v) => v + 1)
      setMessage({ kind: 'ok', text: `${slot === 'login' ? 'Sign-in' : 'Home'} photo updated.` })
    } catch {
      setMessage({ kind: 'err', text: 'Failed to process that image.' })
    } finally {
      setPhotoBusy(null)
    }
  }

  // Add-user form
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('user')
  const [newPassword, setNewPassword] = useState('')
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/users')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      setUsers([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function addUser() {
    setIsSubmitting(true)
    setMessage(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          fullName: newName.trim() || undefined,
          role: newRole,
          password: newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error || 'Failed to add user.' })
        return
      }
      setMessage({ kind: 'ok', text: `Added ${newEmail.trim()}.` })
      setNewEmail('')
      setNewName('')
      setNewPassword('')
      setShowAdd(false)
      await load()
    } catch {
      setMessage({ kind: 'err', text: 'Failed to add user.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function createInvite(email: string, fullName?: string, role?: string) {
    setIsSubmitting(true)
    setMessage(null)
    setInviteLink(null)
    setCopied(false)
    try {
      const res = await fetch('/api/users/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), fullName: fullName?.trim() || undefined, role }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error || 'Failed to create invite.' })
        return
      }
      setInviteLink(data.inviteUrl)
      await load()
    } catch {
      setMessage({ kind: 'err', text: 'Failed to create invite.' })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function copyInvite() {
    if (!inviteLink) return
    try {
      await navigator.clipboard.writeText(inviteLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard blocked — the link is selectable in the field */
    }
  }

  async function toggleActive(u: AppUser) {
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !u.isActive }),
    })
    await load()
  }

  async function resetPassword(u: AppUser) {
    const pw = prompt(`New password for ${u.email} (min 8 characters):`)
    if (!pw) return
    const res = await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    })
    const data = await res.json()
    setMessage(
      res.ok
        ? { kind: 'ok', text: `Password updated for ${u.email}.` }
        : { kind: 'err', text: data.error || 'Failed to update password.' },
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">Manage who can access Flow</p>
        </div>

        {!isAdmin && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <ShieldCheck className="h-4 w-4" />
            User management requires an admin account.
          </div>
        )}

        {message && (
          <div
            className={`mb-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              message.kind === 'ok'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {message.kind === 'ok' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            {message.text}
          </div>
        )}

        {/* Users card */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">Users</h2>
            </div>
            {isAdmin && (
              <button
                onClick={() => setShowAdd((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add User
              </button>
            )}
          </div>

          {showAdd && (
            <div className="grid gap-3 border-b border-blue-100 bg-blue-50/50 px-6 py-4 sm:grid-cols-2">
              <input
                type="email"
                placeholder="Email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <input
                type="text"
                placeholder="Full name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <input
                type="password"
                placeholder="Password (optional — or send an invite)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={newRole}
                  onChange={setNewRole}
                  ariaLabel="Role"
                  options={[
                    { value: 'user', label: 'User' },
                    { value: 'admin', label: 'Admin' },
                  ]}
                  buttonClassName="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                />
                <button
                  onClick={() => createInvite(newEmail, newName, newRole)}
                  disabled={isSubmitting || !newEmail.trim()}
                  title="Create a link they open to set their own password"
                  className="rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                >
                  {isSubmitting ? 'Working…' : 'Invite via link'}
                </button>
                <button
                  onClick={addUser}
                  disabled={isSubmitting || !newPassword}
                  title="Set their password directly"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding…' : 'Add with password'}
                </button>
              </div>

              {inviteLink && (
                <div className="sm:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                  <p className="mb-1.5 text-xs font-medium text-emerald-800">
                    Invite link created — send it to them. It sets their own password and expires in 7 days.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      readOnly
                      value={inviteLink}
                      onFocus={(e) => e.target.select()}
                      className="min-w-0 flex-1 rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono text-xs text-gray-700"
                    />
                    <button
                      onClick={copyInvite}
                      className="shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      {copied ? 'Copied ✓' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                <th className="px-6 py-3 font-medium text-gray-500">User</th>
                <th className="px-4 py-3 font-medium text-gray-500">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500">Sign-in</th>
                <th className="px-4 py-3 font-medium text-gray-500">Status</th>
                {isAdmin && <th className="px-4 py-3 text-right font-medium text-gray-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                    Loading…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                    {isAdmin
                      ? 'No users found — check the database connection.'
                      : 'Sign in as an admin to manage users.'}
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isEnvUser = ENV_USERS.has(u.email.toLowerCase())
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/50">
                      <td className="px-6 py-3">
                        <p className="font-medium text-gray-900">{u.fullName ?? u.email}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.role === 'admin'
                              ? 'bg-purple-50 text-purple-700'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-500">
                        {isEnvUser ? 'Env password' : u.hasPassword ? 'DB password' : 'No password set'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.isActive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
                          }`}
                        >
                          {u.isActive ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {!isEnvUser && !u.hasPassword && (
                              <button
                                onClick={() => createInvite(u.email, u.fullName ?? undefined, u.role)}
                                title="Create an invite link so they can set their password"
                                className="rounded-md px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                              >
                                Invite link
                              </button>
                            )}
                            {!isEnvUser && (
                              <button
                                onClick={() => resetPassword(u)}
                                title="Reset password"
                                className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                              >
                                <KeyRound className="h-4 w-4" />
                              </button>
                            )}
                            {!isEnvUser && (
                              <button
                                onClick={() => toggleActive(u)}
                                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                  u.isActive
                                    ? 'border-red-200 text-red-600 hover:bg-red-50'
                                    : 'border-green-200 text-green-600 hover:bg-green-50'
                                }`}
                              >
                                {u.isActive ? 'Disable' : 'Enable'}
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Bank connections (open banking) */}
        {isAdmin && (
          <div className="mt-6">
            <BankConnections />
          </div>
        )}

        {/* Categories management card */}
        {isAdmin && (
          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
              <Database className="h-4 w-4 text-gray-400" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">Categories</h2>
                <p className="text-xs text-gray-400">
                  Consolidate categories — tick the ones to combine, choose the one to keep, and merge.
                  Transactions from every year move over; the old categories are removed.
                </p>
              </div>
            </div>

            <div className="px-6 py-5">
              {/* Add a new category */}
              <div className="mb-5 flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center">
                <span className="text-sm font-medium text-gray-700">Add category</span>
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createCategory()
                  }}
                  placeholder="e.g. Travel"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Select
                  value={newCatType}
                  onChange={(v) => setNewCatType(v as 'expense' | 'income' | 'transfer' | 'investment')}
                  ariaLabel="Category type"
                  options={[
                    { value: 'expense', label: 'Spending' },
                    { value: 'income', label: 'Income' },
                    { value: 'investment', label: 'Investment' },
                    { value: 'transfer', label: 'Transfer' },
                  ]}
                  buttonClassName="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                />
                <button
                  onClick={createCategory}
                  disabled={newCatBusy || !newCatName.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {newCatBusy ? 'Adding…' : 'Add'}
                </button>
              </div>

              {(['expense', 'income', 'investment', 'transfer'] as const).map((t) => {
                const group = cats.filter((c) => c.type === t)
                if (!group.length) return null
                return (
                  <div key={t} className="mb-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                      {t === 'expense' ? 'Spending' : t === 'income' ? 'Income' : t === 'investment' ? 'Investments' : 'Transfers'}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {group.map((c) => {
                        const on = mergeSources.has(c.id)
                        return (
                          <div
                            key={c.id}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
                              on ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'
                            }`}
                          >
                            <button onClick={() => toggleSource(c.id)} className="inline-flex items-center gap-1.5">
                              <span
                                className={`flex h-4 w-4 items-center justify-center rounded border ${
                                  on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'
                                }`}
                              >
                                {on && <CheckCircle className="h-3 w-3" />}
                              </span>
                              {c.name}
                              <span className="text-xs text-gray-400">{c.count}</span>
                            </button>
                            <button onClick={() => renameCategory(c.id, c.name)} title="Rename" className="text-gray-300 hover:text-blue-600">
                              <Pencil className="h-3 w-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">
                    {mergeSources.size} selected · merge into
                  </span>
                  <Select
                    value={mergeTarget}
                    onChange={setMergeTarget}
                    ariaLabel="Merge into category"
                    placeholder="— keep which category? —"
                    options={[
                      { value: '__new__', label: '➕ New category…' },
                      ...cats
                        .filter((c) => mergeSources.has(c.id))
                        .map((c) => ({ value: c.id, label: c.name })),
                    ]}
                    buttonClassName="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                  />
                </div>
                <button
                  onClick={mergeCategories}
                  disabled={mergeBusy || mergeSources.size === 0 || !mergeTarget}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 sm:ml-auto"
                >
                  <Database className="h-4 w-4" />
                  {mergeBusy ? 'Merging…' : 'Merge categories'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Accounts management card */}
        {isAdmin && (
          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
              <Database className="h-4 w-4 text-gray-400" />
              <div>
                <h2 className="text-base font-semibold text-gray-900">Accounts</h2>
                <p className="text-xs text-gray-400">
                  Clean up duplicates — tick the accounts to combine, choose the one to keep, and merge
                  (their transactions, balances and statements move over), or delete unused ones.
                </p>
              </div>
            </div>

            <div className="px-6 py-5">
              {/* Add a new account */}
              <div className="mb-5 flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 sm:flex-row sm:items-center">
                <span className="text-sm font-medium text-gray-700">Add account</span>
                <input
                  value={newAcctName}
                  onChange={(e) => setNewAcctName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') createAccount() }}
                  placeholder="e.g. Chase Saver"
                  className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <Select
                  value={newAcctCcy}
                  onChange={setNewAcctCcy}
                  ariaLabel="Currency"
                  options={['GBP', 'USD', 'AED', 'EUR', 'INR', 'CHF'].map((c) => ({ value: c, label: c }))}
                  buttonClassName="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                />
                <Select
                  value={newAcctHolder}
                  onChange={setNewAcctHolder}
                  ariaLabel="Account holder"
                  options={[
                    { value: 'joint', label: 'Joint' },
                    { value: 'anjan', label: 'Anjan' },
                    { value: 'kate', label: 'Kate' },
                  ]}
                  buttonClassName="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                />
                <Select
                  value={newAcctClass}
                  onChange={setNewAcctClass}
                  ariaLabel="Asset class"
                  options={[
                    { value: 'cash', label: 'Cash' },
                    { value: 'debt', label: 'Credit / Debt' },
                    { value: 'equities', label: 'Equities' },
                    { value: 'crypto', label: 'Crypto' },
                  ]}
                  buttonClassName="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                />
                <button
                  onClick={createAccount}
                  disabled={newAcctBusy || !newAcctName.trim()}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" />
                  {newAcctBusy ? 'Adding…' : 'Add'}
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {accts.map((a) => {
                  const on = acctSources.has(a.id)
                  return (
                    <div
                      key={a.id}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
                        on ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700'
                      }`}
                    >
                      <button onClick={() => toggleAcctSource(a.id)} className="inline-flex items-center gap-1.5">
                        <span
                          className={`flex h-4 w-4 items-center justify-center rounded border ${
                            on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'
                          }`}
                        >
                          {on && <CheckCircle className="h-3 w-3" />}
                        </span>
                        {a.name}
                        <span className="text-xs text-gray-400">{a.currency} · {a.txCount}</span>
                      </button>
                      <button onClick={() => renameAccount(a.id, a.name)} title="Rename" className="text-gray-300 hover:text-blue-600">
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">{acctSources.size} selected · merge into</span>
                  <Select
                    value={acctTarget}
                    onChange={setAcctTarget}
                    ariaLabel="Merge into account"
                    placeholder="— keep which account? —"
                    options={accts
                      .filter((a) => acctSources.has(a.id))
                      .map((a) => ({ value: a.id, label: a.name }))}
                    buttonClassName="inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-2 text-sm text-gray-900 hover:bg-gray-50"
                  />
                </div>
                <div className="flex items-center gap-2 sm:ml-auto">
                  <button
                    onClick={deleteAccounts}
                    disabled={acctBusy || acctSources.size === 0}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:opacity-50"
                  >
                    Delete
                  </button>
                  <button
                    onClick={mergeAccounts}
                    disabled={acctBusy || acctSources.size === 0 || !acctTarget}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                  >
                    <Database className="h-4 w-4" />
                    {acctBusy ? 'Working…' : 'Merge'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Household photos card */}
        {isAdmin && (
          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
              <ImageIcon className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">Household photos</h2>
            </div>
            <div className="grid gap-5 px-6 py-5 sm:grid-cols-2">
              {(['login', 'hero'] as const).map((slot) => (
                <div key={slot}>
                  <p className="mb-2 text-sm font-medium text-gray-900">
                    {slot === 'login' ? 'Sign-in page' : 'Home hero'}
                  </p>
                  <div
                    className={`mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 bg-cover ${
                      slot === 'hero' ? 'h-24' : 'h-40'
                    }`}
                    style={{
                      backgroundImage: `url('/api/couple-photo?slot=${slot}&v=${photoVersion}')`,
                      backgroundPosition: `${photoPos[slot].x}% ${photoPos[slot].y}%`,
                    }}
                  />
                  {/* Position controls */}
                  <div className="mb-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-xs text-gray-400">Left/right</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={photoPos[slot].x}
                        onChange={(e) => setPos(slot, 'x', Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-14 text-xs text-gray-400">Up/down</span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={photoPos[slot].y}
                        onChange={(e) => setPos(slot, 'y', Number(e.target.value))}
                        className="flex-1 accent-blue-600"
                      />
                    </div>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50">
                    {photoBusy === slot ? 'Uploading…' : 'Choose photo'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={photoBusy === slot}
                      onChange={(e) => uploadPhoto(slot, e.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
              ))}
            </div>
            <p className="px-6 pb-5 text-xs text-gray-400">
              Photos are resized automatically and stored privately in your database. The sign-in
              photo looks best portrait; the home hero looks best landscape.
            </p>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400">
          The two founding accounts sign in with passwords set via environment variables
          (AUTH_PASSWORD_ANJAN / AUTH_PASSWORD_KATE). Users added here sign in with the password
          you set, stored as a bcrypt hash.
        </p>
      </div>
    </div>
  )
}
