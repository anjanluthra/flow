'use client'

import React, { useEffect, useState } from 'react'
import { X, Download, FileText } from 'lucide-react'
import DOMPurify from 'isomorphic-dompurify'

export interface DocViewerTarget {
  url: string // inline content URL
  downloadUrl: string
  textUrl?: string // optional plain-text endpoint (for docx/odt)
  htmlUrl?: string // optional structured-HTML endpoint (docx → formatted preview)
  fileName: string
  mimeType?: string
}

// Sanitise mammoth's docx→HTML output with DOMPurify before rendering it —
// a real HTML parser (not regex) so crafted markup in an uploaded document
// can't inject scripts/handlers. Allow only the formatting tags mammoth emits.
function sanitizeHtml(html: string): string {
  // DOMPurify's default URI handling already blocks javascript: and other
  // dangerous schemes while still allowing data: images (how docx embeds them).
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'sub', 'sup', 'blockquote',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'img', 'span', 'div', 'hr', 'pre', 'code',
    ],
    ALLOWED_ATTR: ['href', 'title', 'colspan', 'rowspan', 'src', 'alt'],
  })
}

// Shown when the file couldn't be fetched for inline preview (e.g. the request
// was blocked or the document is missing) — offer a direct download instead.
function DocLoadError({ downloadUrl }: { downloadUrl: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <FileText className="h-10 w-10 text-gray-300" />
      <p className="text-sm text-gray-500">Couldn’t load a preview of this file.</p>
      <a
        href={downloadUrl}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
      >
        <Download className="h-4 w-4" /> Download to view
      </a>
    </div>
  )
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
  // PDFs/images are fetched into a blob: URL rather than pointing the iframe/img
  // straight at /api/documents/{id}. A blob: URL is local to this document, so
  // it's immune to X-Frame-Options / frame-ancestors — and because the fetch
  // carries the session cookie it also sails past Vercel's preview auth wall,
  // which would otherwise return an un-frameable interstitial ("refused to
  // connect").
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [blobError, setBlobError] = useState(false)

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

  // Fetch PDFs/images into a blob: URL (see note on the state above).
  useEffect(() => {
    setBlobUrl(null)
    setBlobError(false)
    if (!target) return
    const k = kind(target.fileName, target.mimeType)
    if (k !== 'pdf' && k !== 'image') return

    let cancelled = false
    let objUrl: string | null = null
    fetch(target.url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.blob()
      })
      .then((b) => {
        if (cancelled) return
        objUrl = URL.createObjectURL(b)
        setBlobUrl(objUrl)
      })
      .catch(() => {
        if (!cancelled) setBlobError(true)
      })
    return () => {
      cancelled = true
      if (objUrl) URL.revokeObjectURL(objUrl)
    }
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
          {k === 'pdf' &&
            (blobError ? (
              <DocLoadError downloadUrl={target.downloadUrl} />
            ) : blobUrl ? (
              <iframe src={blobUrl} title={target.fileName} className="h-full w-full" />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-gray-400">Loading…</p>
              </div>
            ))}
          {k === 'image' && (
            <div className="flex h-full items-center justify-center p-4">
              {blobError ? (
                <DocLoadError downloadUrl={target.downloadUrl} />
              ) : blobUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={blobUrl} alt={target.fileName} className="max-h-full max-w-full object-contain" />
              ) : (
                <p className="text-sm text-gray-400">Loading…</p>
              )}
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
