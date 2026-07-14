'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Plus, ShieldCheck, KeyRound, CheckCircle, AlertCircle, Database, Download, Image as ImageIcon } from 'lucide-react'

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

  // Historical data import
  const [historyBusy, setHistoryBusy] = useState(false)

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

  async function loadHistory() {
    if (
      !confirm(
        'Import 2024 transactions from your workbook into Flow? It’s safe to run more than once — duplicates are skipped.',
      )
    )
      return
    setHistoryBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/load-history', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ kind: 'err', text: data.error || 'Failed to load history.' })
        return
      }
      const bits: string[] = []
      if (data.unresolved) {
        const names = [...(data.missingAccounts || []), ...(data.missingCategories || [])]
        bits.push(
          `${data.unresolved} could not be matched${names.length ? ` (missing: ${names.join(', ')})` : ''}`,
        )
      }
      setMessage({
        kind: data.unresolved ? 'err' : 'ok',
        text: `2024 import complete — ${data.inserted} added${bits.length ? `. ${bits.join('; ')}` : '.'}`,
      })
    } catch {
      setMessage({ kind: 'err', text: 'Failed to load history.' })
    } finally {
      setHistoryBusy(false)
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
                placeholder="Password (min 8 chars)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
              <div className="flex items-center gap-3">
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button
                  onClick={addUser}
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isSubmitting ? 'Adding…' : 'Add'}
                </button>
              </div>
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

        {/* Data card */}
        {isAdmin && (
          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-gray-200 px-6 py-4">
              <Database className="h-4 w-4 text-gray-400" />
              <h2 className="text-base font-semibold text-gray-900">Data</h2>
            </div>
            <div className="flex flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Load 2024 history</p>
                <p className="mt-0.5 text-sm text-gray-500">
                  Imports 2,031 2024 transactions from your personal-finance workbook, keeping the
                  sheet&rsquo;s own categories so the P&amp;L matches it exactly. Re-running refreshes
                  the import.
                </p>
              </div>
              <button
                onClick={loadHistory}
                disabled={historyBusy}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                {historyBusy ? 'Importing…' : 'Load 2024 history'}
              </button>
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
