'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Waves, CheckCircle } from 'lucide-react'

export default function SetPasswordPage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [done, setDone] = useState(false)

  // Read the token from the URL on the client (avoids a Suspense boundary).
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('token')
    setToken(t)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setIsLoading(true)
    try {
      const res = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not set your password.')
        return
      }
      setDone(true)
      setTimeout(() => router.push('/auth/login'), 2000)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <Waves className="h-6 w-6 text-blue-600" />
          <span className="text-lg font-bold text-gray-900">Flow</span>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <CheckCircle className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 text-sm font-medium text-gray-900">Password set!</p>
            <p className="mt-1 text-sm text-gray-500">Taking you to sign in…</p>
          </div>
        ) : token === null ? (
          <p className="py-6 text-center text-sm text-gray-500">Checking your invite…</p>
        ) : token === '' ? (
          <p className="py-6 text-center text-sm text-rose-600">This link is missing its invite token.</p>
        ) : (
          <>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Set your password</h1>
            <p className="mt-1 text-sm text-gray-500">Choose a password to finish setting up your account.</p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">New password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Confirm password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              {error && <p className="text-sm text-rose-600">{error}</p>}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Saving…' : 'Set password & continue'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
