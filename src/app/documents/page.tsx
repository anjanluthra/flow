'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { FileText, Upload, Trash2, Download, Eye, CheckCircle, AlertCircle, UploadCloud } from 'lucide-react'
import { Select } from '@/components/ui/Select'

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
  importedCount: number | null
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
  const [gridYear, setGridYear] = useState(new Date().getFullYear())
  const [isLoading, setIsLoading] = useState(true)

  // Upload state — account is optional so you can just dump files.
  const [uploadAccountId, setUploadAccountId] = useState('') // '' = Unassigned
  const [statementDate, setStatementDate] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const dragDepth = useRef(0)

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
    } catch {
      // leave empty
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const uploadOne = useCallback(
    async (file: File): Promise<boolean> => {
      try {
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
        return res.ok
      } catch {
        return false
      }
    },
    [uploadAccountId, statementDate],
  )

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return
      setIsUploading(true)
      setMessage(null)
      setProgress({ done: 0, total: files.length })

      let saved = 0
      let tooBig = 0
      let failed = 0
      for (let i = 0; i < files.length; i++) {
        const f = files[i]
        if (f.size > 4 * 1024 * 1024) tooBig++
        else if (await uploadOne(f)) saved++
        else failed++
        setProgress({ done: i + 1, total: files.length })
      }

      setProgress(null)
      setIsUploading(false)
      const parts = [`Saved ${saved} file${saved !== 1 ? 's' : ''}`]
      if (tooBig) parts.push(`${tooBig} over 4 MB skipped`)
      if (failed) parts.push(`${failed} failed`)
      setMessage({ kind: tooBig || failed ? 'err' : 'ok', text: parts.join(' · ') })
      await load()
    },
    [uploadOne, load],
  )

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current += 1
    setIsDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current -= 1
    if (dragDepth.current === 0) setIsDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    dragDepth.current = 0
    const files = Array.from(e.dataTransfer.files)
    if (files.length) handleFiles(files)
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

  // Coverage grid: for each account (row) and month (column) of the selected
  // year, is there a statement — and has it been imported (green) or is it just
  // uploaded (amber)?
  const gridYears = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear()])
    for (const d of docs) if (d.statementDate) set.add(new Date(d.statementDate).getUTCFullYear())
    return Array.from(set).sort((a, b) => b - a)
  }, [docs])

  const gridAccounts = useMemo(() => {
    const names = new Set<string>()
    for (const d of docs) names.add(d.accountName ?? 'Unassigned')
    // Unassigned last, otherwise alphabetical.
    return Array.from(names).sort((a, b) =>
      a === 'Unassigned' ? 1 : b === 'Unassigned' ? -1 : a.localeCompare(b),
    )
  }, [docs])

  const coverage = useMemo(() => {
    const map = new Map<string, { imported: boolean; files: string[] }>()
    for (const d of docs) {
      if (!d.statementDate) continue
      const dt = new Date(d.statementDate)
      if (dt.getUTCFullYear() !== gridYear) continue
      const key = `${d.accountName ?? 'Unassigned'}|${dt.getUTCMonth() + 1}`
      const cur = map.get(key) ?? { imported: false, files: [] }
      cur.files.push(d.fileName)
      if ((d.importedCount ?? 0) > 0) cur.imported = true
      map.set(key, cur)
    }
    return map
  }, [docs, gridYear])

  const undatedCount = useMemo(() => docs.filter((d) => !d.statementDate).length, [docs])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Documents</h1>
          <p className="mt-1 text-sm text-gray-500">
            The home for all your statements — drop them here and they&apos;re saved for good,
            organised per account
          </p>
        </div>

        {/* Optional tagging for whatever you drop next */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-xs font-medium text-gray-500">Tag new uploads:</span>
          <Select
            value={uploadAccountId}
            onChange={setUploadAccountId}
            options={[
              { value: '', label: 'Unassigned (assign later)' },
              ...accounts.map((a) => ({ value: a.id, label: a.name })),
            ]}
            searchable
            ariaLabel="Tag new uploads"
          />
          <input
            type="date"
            value={statementDate}
            onChange={(e) => setStatementDate(e.target.value)}
            title="Statement date (optional)"
            className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs font-medium text-gray-500">View:</label>
            <Select
              value={filterAccount}
              onChange={setFilterAccount}
              options={[
                { value: 'all', label: 'All Accounts' },
                ...accounts.map((a) => ({ value: a.id, label: a.name })),
              ]}
              searchable
              ariaLabel="View"
            />
          </div>
        </div>

        {/* Drag-and-drop dump zone */}
        <label
          onDragEnter={onDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
            isDragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-300 hover:bg-blue-50/30'
          }`}
        >
          <input
            type="file"
            multiple
            accept=".pdf,.csv,.xlsx,.xls,.png,.jpg,.jpeg"
            className="hidden"
            disabled={isUploading}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length) handleFiles(files)
              e.target.value = ''
            }}
          />
          <div
            className={`flex h-14 w-14 items-center justify-center rounded-full ${
              isDragging ? 'bg-blue-100' : 'bg-gray-100'
            }`}
          >
            <UploadCloud className={`h-7 w-7 ${isDragging ? 'text-blue-600' : 'text-gray-400'}`} />
          </div>
          {isUploading && progress ? (
            <p className="mt-4 text-sm font-medium text-blue-600">
              Uploading… {progress.done}/{progress.total}
            </p>
          ) : (
            <>
              <p className={`mt-4 text-base font-semibold ${isDragging ? 'text-blue-700' : 'text-gray-700'}`}>
                Drop statements here to save them
              </p>
              <p className="mt-1 text-sm text-gray-400">
                Drag in as many files as you like, or click to browse · PDF, CSV, Excel, images · up to 4 MB each
              </p>
            </>
          )}
        </label>

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

        {/* Coverage grid — at a glance, which months have a statement per
            account, and whether it's been imported. */}
        {!isLoading && gridAccounts.length > 0 && (
          <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-gray-50/60 px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Statement coverage</h2>
                <p className="mt-0.5 text-xs text-gray-500">Which months you have on file, per account</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" /> Imported</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm bg-amber-400" /> Uploaded</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-sm border border-gray-200 bg-gray-50" /> Missing</span>
                </div>
                <Select
                  value={String(gridYear)}
                  onChange={(v) => setGridYear(Number(v))}
                  options={gridYears.map((y) => ({ value: String(y), label: String(y) }))}
                  ariaLabel="Coverage year"
                />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 bg-white px-4 py-2 text-left text-xs font-medium text-gray-500">Account</th>
                    {MONTH_ABBR.map((m) => (
                      <th key={m} className="px-1 py-2 text-center text-xs font-medium text-gray-400">{m}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {gridAccounts.map((name) => (
                    <tr key={name} className="hover:bg-gray-50/40">
                      <td className="sticky left-0 z-10 bg-white px-4 py-1.5 text-gray-700 whitespace-nowrap">
                        <button
                          onClick={() => setFilterAccount(accounts.find((a) => a.name === name)?.id ?? 'all')}
                          className="hover:text-blue-700 hover:underline"
                          title="Filter the list below to this account"
                        >
                          {name}
                        </button>
                      </td>
                      {MONTH_ABBR.map((_, i) => {
                        const cell = coverage.get(`${name}|${i + 1}`)
                        const cls = cell
                          ? cell.imported
                            ? 'bg-emerald-500'
                            : 'bg-amber-400'
                          : 'border border-gray-200 bg-gray-50'
                        const title = cell
                          ? `${cell.files.join(', ')} — ${cell.imported ? 'imported' : 'uploaded, not imported'}`
                          : `No ${MONTH_ABBR[i]} ${gridYear} statement`
                        return (
                          <td key={i} className="px-1 py-1.5 text-center">
                            <span className={`mx-auto block h-6 w-full max-w-[36px] rounded-sm ${cls}`} title={title} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {undatedCount > 0 && (
              <div className="border-t border-gray-100 px-5 py-2 text-xs text-gray-400">
                {undatedCount} document{undatedCount !== 1 ? 's' : ''} without a statement date aren&rsquo;t shown here — set a date on upload to place them.
              </div>
            )}
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
