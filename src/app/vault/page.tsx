'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ShieldCheck,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  Heart,
  CheckCircle,
} from 'lucide-react'
import { DocViewer, type DocViewerTarget } from '@/components/DocViewer'

interface VaultDoc {
  id: string
  docType: string
  title: string
  fileName: string
  mimeType: string
  sizeBytes: number
  notes: string | null
  uploadedAt: string
}

const DOC_TYPES = [
  'Will',
  'Marriage Certificate',
  'Passport / ID',
  'Property',
  'Insurance',
  'Financial',
  'Other',
]

const FOR_KATE_TEMPLATE = `If anything ever happens to me, my love — everything you need is here.

People to call first
- Solicitor (wills/estate):
- Accountant:
- Financial adviser:
- Closest family:

Where the money is
- Our net worth and all accounts are in this app under Net Worth → Balance Sheet.
- Main current accounts:
- Savings / investments:
- Pensions:

Key documents (uploaded below)
- Will
- Marriage certificate
- Property deeds / tenancy
- Life insurance policy + who to contact to claim

Passwords & access
- Password manager:
- This app login:

Anything else you should know
`

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step))
  }
  return btoa(binary)
}

export default function VaultPage() {
  const [docs, setDocs] = useState<VaultDoc[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Upload form
  const [upType, setUpType] = useState('Will')
  const [upTitle, setUpTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<DocViewerTarget | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // For-Kate note
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(true)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const loadDocs = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/vault')
      const data = await res.json()
      setDocs(data.documents || [])
    } catch {
      setDocs([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDocs()
    fetch('/api/vault-notes')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setNote(d.value || ''))
      .catch(() => {})
  }, [loadDocs])

  function onNoteChange(v: string) {
    setNote(v)
    setNoteSaved(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/vault-notes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ value: v }),
        })
        setNoteSaved(true)
      } catch {
        /* keep unsaved state */
      }
    }, 800)
  }

  async function handleUpload(file: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const contentBase64 = await fileToBase64(file)
      const res = await fetch('/api/vault', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docType: upType,
          title: upTitle.trim() || file.name,
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
        }),
      })
      if (res.ok) {
        setUpTitle('')
        if (fileRef.current) fileRef.current.value = ''
        await loadDocs()
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this document from the vault?')) return
    await fetch(`/api/vault/${id}`, { method: 'DELETE' })
    await loadDocs()
  }

  const byType = useMemo(() => {
    const map: Record<string, VaultDoc[]> = {}
    for (const d of docs) (map[d.docType] ??= []).push(d)
    return map
  }, [docs])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Vault</h1>
            <p className="text-sm text-gray-500">
              Wills, certificates and the essentials — kept safe and in one place
            </p>
          </div>
        </div>

        {/* For Kate */}
        <div className="mb-8 overflow-hidden rounded-xl border border-rose-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-rose-100 bg-rose-50/60 px-6 py-4">
            <div className="flex items-center gap-2">
              <Heart className="h-4 w-4 text-rose-500" />
              <h2 className="text-base font-semibold text-gray-900">For Kate</h2>
            </div>
            <span className="text-xs text-gray-400">
              {noteSaved ? (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle className="h-3.5 w-3.5" /> Saved
                </span>
              ) : (
                'Saving…'
              )}
            </span>
          </div>
          <div className="p-4">
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              placeholder={FOR_KATE_TEMPLATE}
              rows={14}
              className="w-full resize-y rounded-lg border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-800 outline-none focus:border-rose-300 focus:ring-1 focus:ring-rose-200"
            />
            {!note && (
              <button
                onClick={() => onNoteChange(FOR_KATE_TEMPLATE)}
                className="mt-2 text-xs font-medium text-rose-600 hover:text-rose-700"
              >
                Start from a template
              </button>
            )}
          </div>
        </div>

        {/* Upload */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Add a document</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Type</label>
              <select
                value={upType}
                onChange={(e) => setUpType(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {DOC_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1 block text-xs font-medium text-gray-500">Title (optional)</label>
              <input
                type="text"
                value={upTitle}
                onChange={(e) => setUpTitle(e.target.value)}
                placeholder="e.g. Anjan's will (2026)"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Upload file'}
              <input
                ref={fileRef}
                type="file"
                className="hidden"
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-gray-400">PDFs, images or documents up to 8 MB. Stored privately in your database.</p>
        </div>

        {/* Documents by type */}
        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">
            Loading…
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-400">
            No documents yet — add your will, marriage certificate and other essentials above.
          </div>
        ) : (
          <div className="space-y-6">
            {DOC_TYPES.filter((t) => byType[t]?.length).map((type) => (
              <div key={type} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">{type}</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {byType[type].map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-6 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-5 w-5 shrink-0 text-gray-300" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{d.title}</p>
                          <p className="truncate text-xs text-gray-400">
                            {d.fileName} · {fmtSize(d.sizeBytes)} · {fmtDate(d.uploadedAt)}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() =>
                            setViewer({
                              url: `/api/vault/${d.id}`,
                              downloadUrl: `/api/vault/${d.id}?download=1`,
                              fileName: d.fileName,
                              mimeType: d.mimeType,
                            })
                          }
                          title="View"
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <a
                          href={`/api/vault/${d.id}?download=1`}
                          title="Download"
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Download className="h-4 w-4" />
                        </a>
                        <button
                          onClick={() => handleDelete(d.id)}
                          title="Delete"
                          className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <DocViewer target={viewer} onClose={() => setViewer(null)} />
    </div>
  )
}
