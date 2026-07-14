'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Landmark,
  FileText,
  Upload,
  Eye,
  Download,
  Trash2,
  CalendarClock,
  Plane,
  AlertTriangle,
  Pin,
} from 'lucide-react'
import { DocViewer, type DocViewerTarget } from '@/components/DocViewer'

interface TaxDoc {
  id: string
  category: string
  title: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string
}

interface Tracker {
  ukDays?: Record<string, number>
  ukWorkDays?: Record<string, number>
}

// Synthesised from the Westbourne Tax Services advice pack (UK → UAE move).
const INSIGHTS: { title: string; body: string; tone: 'red' | 'amber' | 'slate' }[] = [
  {
    title: 'Stay non-UK-resident until ~July 2029',
    body: 'You left the UK in July 2024. Under the Temporary Non-Residence rules you must stay non-resident for at least 5 full years. Return before ~July 2029 and income/gains from your time abroad can be taxed on the way back.',
    tone: 'red',
  },
  {
    title: 'Keep UK days under 91 per tax year (≤30 working days)',
    body: 'From 2025/26 your non-resident status relies on full-time work abroad. A "UK day" counts if you are in the UK at midnight. Track every trip — this is the number that decides residence.',
    tone: 'red',
  },
  {
    title: 'UK company dividends are the biggest risk after 6 Apr 2026',
    body: 'If you return before July 2029, dividends from your UK close company taken while abroad become UK-taxable on return — even ones already paid, even from post-departure profits. Salary earned abroad is safe.',
    tone: 'amber',
  },
  {
    title: 'Time any company sale carefully',
    body: 'The Dubai company was set up in April 2024 (before you left), so selling it before you return within 5 years is caught by the TNR rules. A sale once safely past the 5-year mark avoids this.',
    tone: 'amber',
  },
  {
    title: 'Claim 2024/25 split-year treatment',
    body: 'For the departure year, claim split-year treatment (SA109, or form P85) so your Dubai salary isn’t taxed in the UK for 2024/25.',
    tone: 'slate',
  },
  {
    title: 'Estate & IHT housekeeping',
    body: 'Keep dated records of every gift over £3,000 (7-year IHT clock). Resolve the UK house GROB (market rent, or the 7-year clock hasn’t started). Indian inherited-property CGT should be fully covered by the Indian tax credit (SA108 box 51 + SA106).',
    tone: 'slate',
  },
]

const RETURN_SAFE_DATE = new Date('2029-07-01T00:00:00Z')
const DEPARTURE = new Date('2024-07-01T00:00:00Z')

function fmtSize(b: number): string {
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`
  if (b >= 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${b} B`
}

// UK tax year label for a date, e.g. "2026/27" (year starts 6 April).
function taxYearOf(d: Date): string {
  const y = d.getUTCFullYear()
  const beforeApr6 = d.getUTCMonth() < 3 || (d.getUTCMonth() === 3 && d.getUTCDate() < 6)
  const start = beforeApr6 ? y - 1 : y
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`
}

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const step = 0x8000
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step))
  return btoa(binary)
}

const CATEGORIES = ['Residence (SRT)', 'Temporary Non-Residence', 'Split-Year Treatment', 'CGT / Inheritance', 'IHT / Estate', 'Other']

export default function TaxPage() {
  const [docs, setDocs] = useState<TaxDoc[]>([])
  const [tracker, setTracker] = useState<Tracker>({})
  const [isLoading, setIsLoading] = useState(true)
  const [upCategory, setUpCategory] = useState('Other')
  const [upTitle, setUpTitle] = useState('')
  const [uploading, setUploading] = useState(false)
  const [viewer, setViewer] = useState<DocViewerTarget | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/tax')
      const data = await res.json()
      setDocs(data.documents || [])
      setTracker(data.tracker || {})
    } catch {
      setDocs([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const daysToReturn = Math.max(
    0,
    Math.ceil((RETURN_SAFE_DATE.getTime() - Date.now()) / 86400000),
  )
  const yearsAbroad = ((Date.now() - DEPARTURE.getTime()) / (365.25 * 86400000)).toFixed(1)

  const taxYears = useMemo(() => {
    const years: string[] = []
    let start = 2024
    const current = parseInt(taxYearOf(new Date()).slice(0, 4), 10)
    while (start <= current + 1) {
      years.push(`${start}/${String((start + 1) % 100).padStart(2, '0')}`)
      start++
    }
    return years
  }, [])

  function saveTracker(next: Tracker) {
    setTracker(next)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      fetch('/api/tax', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      }).catch(() => {})
    }, 500)
  }

  function setDays(year: string, field: 'ukDays' | 'ukWorkDays', value: number) {
    saveTracker({ ...tracker, [field]: { ...(tracker[field] || {}), [year]: value } })
  }

  async function handleUpload(file: File | null) {
    if (!file) return
    setUploading(true)
    try {
      const contentBase64 = await fileToBase64(file)
      const res = await fetch('/api/tax', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: upCategory,
          title: upTitle.trim() || file.name,
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
        }),
      })
      if (res.ok) {
        setUpTitle('')
        if (fileRef.current) fileRef.current.value = ''
        await load()
      }
    } finally {
      setUploading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Remove this document?')) return
    await fetch(`/api/tax/${id}`, { method: 'DELETE' })
    await load()
  }

  const byCategory = useMemo(() => {
    const map: Record<string, TaxDoc[]> = {}
    for (const d of docs) (map[d.category] ??= []).push(d)
    return map
  }, [docs])

  const toneClass = (t: string) =>
    t === 'red'
      ? 'border-rose-200 bg-rose-50'
      : t === 'amber'
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-slate-50'

  const currentTaxYear = taxYearOf(new Date())
  const ukDaysThisYear = tracker.ukDays?.[currentTaxYear] ?? 0

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
            <Landmark className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tax</h1>
            <p className="text-sm text-gray-500">Your UK ↔ UAE advice, the key rules, and the dates that matter</p>
          </div>
        </div>

        {/* Trackers */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500">
              <Plane className="h-4 w-4" /> Non-resident since
            </div>
            <p className="text-2xl font-bold text-gray-900">Jul 2024</p>
            <p className="text-xs text-gray-400">{yearsAbroad} years abroad</p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-rose-500">
              <CalendarClock className="h-4 w-4" /> Safe to return to the UK
            </div>
            <p className="text-2xl font-bold text-gray-900">{daysToReturn.toLocaleString()} days</p>
            <p className="text-xs text-gray-400">≈ July 2029 (5-year TNR mark)</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center gap-2 text-xs font-medium text-gray-500">
              <AlertTriangle className="h-4 w-4" /> UK days this tax year
            </div>
            <p className={`text-2xl font-bold ${ukDaysThisYear > 90 ? 'text-rose-600' : 'text-gray-900'}`}>
              {ukDaysThisYear}
              <span className="text-base font-medium text-gray-400"> / 90</span>
            </p>
            <p className="text-xs text-gray-400">{currentTaxYear} · midnight rule</p>
          </div>
        </div>

        {/* Pinned insights */}
        <div className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Pin className="h-4 w-4 text-gray-400" />
            <h2 className="text-base font-semibold text-gray-900">Key things to remember</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {INSIGHTS.map((ins) => (
              <div key={ins.title} className={`rounded-xl border p-4 ${toneClass(ins.tone)}`}>
                <p className="text-sm font-semibold text-gray-900">{ins.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600">{ins.body}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Summary of your adviser’s notes — not advice itself. Always check specifics against the source documents below.
          </p>
        </div>

        {/* UK days by year */}
        <div className="mb-8 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-6 py-4">
            <h2 className="text-base font-semibold text-gray-900">UK days by tax year</h2>
            <p className="text-xs text-gray-400">Keep each year under 91 days total and 30 working days. A day counts if you’re in the UK at midnight.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60 text-left">
                  <th className="px-6 py-3 font-medium text-gray-500">Tax year</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">UK days (/90)</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-500">of which working (/30)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {taxYears.map((y) => {
                  const days = tracker.ukDays?.[y] ?? 0
                  const work = tracker.ukWorkDays?.[y] ?? 0
                  return (
                    <tr key={y} className={y === currentTaxYear ? 'bg-blue-50/30' : undefined}>
                      <td className="px-6 py-2.5 font-medium text-gray-900">
                        {y}
                        {y === currentTaxYear && <span className="ml-2 text-xs text-blue-500">current</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          value={days || ''}
                          onChange={(e) => setDays(y, 'ukDays', Number(e.target.value))}
                          className={`w-20 rounded-md border px-2 py-1 text-right text-sm ${days > 90 ? 'border-rose-300 text-rose-600' : 'border-gray-300'}`}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <input
                          type="number"
                          min={0}
                          value={work || ''}
                          onChange={(e) => setDays(y, 'ukWorkDays', Number(e.target.value))}
                          className={`w-20 rounded-md border px-2 py-1 text-right text-sm ${work > 30 ? 'border-rose-300 text-rose-600' : 'border-gray-300'}`}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upload */}
        <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Add a document</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">Category</label>
              <select
                value={upCategory}
                onChange={(e) => setUpCategory(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="min-w-[200px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-500">Title (optional)</label>
              <input
                type="text"
                value={upTitle}
                onChange={(e) => setUpTitle(e.target.value)}
                placeholder="e.g. 2025/26 residence review"
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700">
              <Upload className="h-4 w-4" />
              {uploading ? 'Uploading…' : 'Upload file'}
              <input ref={fileRef} type="file" className="hidden" disabled={uploading} onChange={(e) => handleUpload(e.target.files?.[0] ?? null)} />
            </label>
          </div>
        </div>

        {/* Documents */}
        {isLoading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-400">Loading…</div>
        ) : (
          <div className="space-y-6">
            {CATEGORIES.filter((c) => byCategory[c]?.length).map((cat) => (
              <div key={cat} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">{cat}</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {byCategory[cat].map((d) => (
                    <div key={d.id} className="flex items-center justify-between px-6 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <FileText className="h-5 w-5 shrink-0 text-gray-300" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{d.title}</p>
                          <p className="truncate text-xs text-gray-400">{d.fileName} · {fmtSize(d.sizeBytes)}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          onClick={() =>
                            setViewer({
                              url: `/api/tax/${d.id}`,
                              downloadUrl: `/api/tax/${d.id}?download=1`,
                              textUrl: `/api/tax/${d.id}?text=1`,
                              fileName: d.fileName,
                              mimeType: d.mimeType,
                            })
                          }
                          title="View"
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <a href={`/api/tax/${d.id}?download=1`} title="Download" className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                          <Download className="h-4 w-4" />
                        </a>
                        <button onClick={() => handleDelete(d.id)} title="Delete" className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500">
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
