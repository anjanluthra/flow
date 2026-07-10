'use client'

import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { FileText, Upload, Trash2, Download, Eye, CheckCircle, AlertCircle } from 'lucide-react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountOption {
  id: string
  name: string
}

interface Doc {
  id: string
  accountId: string | null
  accountName: string | null
  fileName: string
  mimeType: string
  statementDate: string | null
  sizeBytes: number
  uploadedAt: string
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DocumentsPage() {
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [filterAccount, setFilterAccount] = useState('all')
  const [isLoading, setIsLoading] = useState(true)

  // Upload state
  const [uploadAccountId, setUploadAccountId] = useState('')
  const [statementDate, setStatementDate] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [accRes, docRes] = await Promise.all([
        fetch('/api/accounts'),
        fetch('/api/documents'),
      ])
      const accData = await accRes.json()
      const docData = await docRes.json()
      setAccounts(accData.accounts || [])
      setDocs(docData.documents || [])
      if (accData.accounts?.length && !uploadAccountId) {
        setUploadAccountId(accData.accounts[0].id)
      }
    } catch {
      // leave empty
    } finally {
      setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const handleUpload = async (file: File) => {
    setIsUploading(true)
    setMessage(null)
    try {
      if (file.size > 4 * 1024 * 1024) {
        setMessage({ kind: 'err', text: 'File is over the 4 MB limit.' })
        return
      }
      const buf = await file.arrayBuffer()
      let binary = ''
      const bytes = new Uint8Array(buf)
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      const contentBase64 = btoa(binary)

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: uploadAccountId || null,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          statementDate: statementDate || null,
          contentBase64,
        }),
      })
      if (!res.ok) throw new Error('upload failed')
      setMessage({ kind: 'ok', text: `Saved ${file.name}.` })
      await load()
    } catch {
      setMessage({ kind: 'err', text: 'Upload failed — please try again.' })
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return
    await fetch(`/api/documents/${id}`, { method: 'DELETE' })
    await load()
  }

  const filtered = useMemo(
    () => (filterAccount === 'all' ? docs : docs.filter((d) => d.accountId === filterAccount)),
    [docs, filterAccount],
  )

  // Group by account for the "per account" browsing the user asked for.
  const grouped = useMemo(() => {
    const groups = new Map<string, Doc[]>()
    for (const d of filtered) {
      const key = d.accountName ?? 'Unassigned'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(d)
    }
    return Array.from(groups.entries())
  }, [filtered])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Bank statements &amp; records, organised per account
          </p>
        </div>

        {/* Upload bar */}
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <Upload className="h-4 w-4 text-gray-400" />
          <select
            value={uploadAccountId}
            onChange={(e) => setUploadAccountId(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <label className="text-xs font-medium text-gray-500">Statement date:</label>
          <input
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700">
            <Upload className="h-3.5 w-3.5" />
            {isUploading ? 'Uploading…' : 'Upload Statement'}
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
              className="hidden"
              disabled={isUploading}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleUpload(f)
                e.target.value = ''
              }}
            />
          </label>

          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">View:</label>
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              <option value="all">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ${
              message.kind === 'ok'
                ? 'border-green-200 bg-green-50 text-green-700'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {message.kind === 'ok' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            {message.text}
          </div>
        )}

        {/* Grouped listings */}
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : grouped.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">
              No documents yet — upload your first statement above.
            </p>
          </div>
        ) : (
          grouped.map(([accountName, accountDocs]) => (
            <div
              key={accountName}
              className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50/60 px-6 py-3">
                <h2 className="text-sm font-semibold text-gray-900">{accountName}</h2>
                <span className="text-xs text-gray-400">
                  {accountDocs.length} document{accountDocs.length !== 1 ? 's' : ''}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-gray-100">
                  {accountDocs.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50/50">
                      <td className="w-8 py-3 pl-6">
                        <FileText className="h-4 w-4 text-gray-300" />
                      </td>
                      <td className="px-3 py-3 font-medium text-gray-900">{d.fileName}</td>
                      <td className="px-3 py-3 text-gray-500">
                        {fmtDate(d.statementDate)}
                      </td>
                      <td className="px-3 py-3 text-gray-400">{fmtSize(d.sizeBytes)}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1 pr-4">
                          <a
                            href={`/api/documents/${d.id}`}
                            target="_blank"
                            rel="noreferrer"
                            title="View"
                            className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Eye className="h-4 w-4" />
                          </a>
                          <a
                            href={`/api/documents/${d.id}?download=1`}
                            title="Download"
                            className="rounded-md p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <Download className="h-4 w-4" />
                          </a>
                          <button
                            onClick={() => handleDelete(d.id, d.fileName)}
                            title="Delete"
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
