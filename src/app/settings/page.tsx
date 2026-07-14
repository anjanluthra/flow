'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Users, Plus, ShieldCheck, KeyRound, CheckCircle, AlertCircle, Database, Download } from 'lucide-react'

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
      setMessage({
        kind: 'ok',
        text: `2024 import complete — ${data.inserted} added, ${data.skipped} already present${
          data.unresolved ? `, ${data.unresolved} could not be matched` : ''
        }.`,
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
                  Imports 2,031 categorised 2024 transactions from your personal-finance workbook.
                  Safe to run again — duplicates are skipped.
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

        <p className="mt-4 text-xs text-gray-400">
          The two founding accounts sign in with passwords set via environment variables
          (AUTH_PASSWORD_ANJAN / AUTH_PASSWORD_KATE). Users added here sign in with the password
          you set, stored as a bcrypt hash.
        </p>
      </div>
    </div>
  )
}
