'use client'

import React, { useEffect, useState } from 'react'
import { X, Download, FileText } from 'lucide-react'

export interface DocViewerTarget {
  url: string // inline content URL
  downloadUrl: string
  textUrl?: string // optional plain-text endpoint (for docx/odt)
  htmlUrl?: string // optional structured-HTML endpoint (docx → formatted preview)
  fileName: string
  mimeType?: string
}

// Minimal sanitiser for mammoth's docx→HTML output (which only emits a safe
// subset of tags): drop scripts/styles and any inline event handlers.
function sanitizeHtml(html: string): string {
  return html
    .replace(/<\/?(script|style)[^>]*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
}

function kind(fileName: string, mimeType?: string): 'pdf' | 'image' | 'text' | 'richtext' | 'other' {
  const f = fileName.toLowerCase()
  const m = (mimeType || '').toLowerCase()
  if (f.endsWith('.pdf') || m.includes('pdf')) return 'pdf'
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(f) || m.startsWith('image/')) return 'image'
  if (/\.(csv|txt|tsv|log)$/.test(f) || m.startsWith('text/')) return 'text'
  if (/\.(docx?|odt|rtf)$/.test(f) || m.includes('word') || m.includes('opendocument')) return 'richtext'
  return 'other'
}

export function DocViewer({ target, onClose }: { target: DocViewerTarget | null; onClose: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [loadingText, setLoadingText] = useState(false)

  useEffect(() => {
    setText(null)
    setHtml(null)
    if (!target) return
    const k = kind(target.fileName, target.mimeType)
    if (k !== 'text' && k !== 'richtext') return
    setLoadingText(true)

    // Prefer a structured-HTML endpoint (docx keeps its headings/bold/lists);
    // fall back to plain text, then to the raw file.
    if (k === 'richtext' && target.htmlUrl) {
      fetch(target.htmlUrl)
        .then((r) => r.json())
        .then((d) => {
          if (d.html) setHtml(sanitizeHtml(d.html))
          else setText(d.text ?? '')
        })
        .catch(() => setText(''))
        .finally(() => setLoadingText(false))
      return
    }

    const src = k === 'richtext' && target.textUrl ? target.textUrl : target.url
    const asJson = k === 'richtext' && !!target.textUrl
    fetch(src)
      .then((r) => (asJson ? r.json().then((d) => d.text ?? '') : r.text()))
      .then((t) => setText(t))
      .catch(() => setText(''))
      .finally(() => setLoadingText(false))
  }, [target])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (target) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [target, onClose])

  if (!target) return null
  const k = kind(target.fileName, target.mimeType)
  const canPreview = k !== 'other' && !(k === 'richtext' && !target.textUrl && !target.htmlUrl)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText className="h-4 w-4 shrink-0 text-gray-400" />
            <p className="truncate text-sm font-medium text-gray-900">{target.fileName}</p>
          </div>
          <div className="flex items-center gap-1">
            <a
              href={target.downloadUrl}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </a>
            <button onClick={onClose} className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto bg-gray-50">
          {k === 'pdf' && <iframe src={target.url} title={target.fileName} className="h-full w-full" />}
          {k === 'image' && (
            <div className="flex h-full items-center justify-center p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={target.url} alt={target.fileName} className="max-h-full max-w-full object-contain" />
            </div>
          )}
          {(k === 'text' || (k === 'richtext' && (target.textUrl || target.htmlUrl))) && (
            <div className="p-6">
              {loadingText ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : html !== null ? (
                <div
                  className="mx-auto max-w-2xl bg-white p-8 text-sm leading-relaxed text-gray-800 shadow-sm [&_a]:text-blue-600 [&_a]:underline [&_h1]:mb-3 [&_h1]:mt-5 [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-gray-900 [&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h3]:mb-1.5 [&_h3]:mt-4 [&_h3]:font-semibold [&_h3]:text-gray-900 [&_li]:my-1 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2.5 [&_strong]:font-semibold [&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-gray-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-gray-200 [&_th]:bg-gray-50 [&_th]:px-2 [&_th]:py-1 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-gray-800">
                  {text || '(empty document)'}
                </pre>
              )}
            </div>
          )}
          {!canPreview && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <FileText className="h-10 w-10 text-gray-300" />
              <p className="text-sm text-gray-500">This file type can’t be previewed in the browser.</p>
              <a
                href={target.downloadUrl}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Download className="h-4 w-4" /> Download to view
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
