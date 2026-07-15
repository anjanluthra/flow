'use client'

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

// ---------------------------------------------------------------------------
// Shared styled dropdowns — a single, consistent popup used everywhere in
// Flow (replacing native <select>). Both variants render their panel through a
// portal to document.body and position it against the trigger, so they never
// get clipped inside scrolling tables or overflow containers.
// ---------------------------------------------------------------------------

export interface SelectOption {
  value: string
  label: string
  /** Optional group heading — options with the same group are clustered. */
  group?: string
  /** Optional colour dot (e.g. a category colour). */
  color?: string
}

interface PanelPos {
  top: number
  left: number
  width: number
}

// Shared hook: track the trigger rect and keep the portal panel positioned.
function usePanelPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
  panelRef: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  minWidth = 224,
  align: 'left' | 'right' = 'left',
) {
  const [pos, setPos] = useState<PanelPos | null>(null)

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const width = Math.max(r.width, minWidth)
    let left = align === 'right' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    setPos({ top: r.bottom + 6, left, width })
  }

  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const reposition = () => place()
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (triggerRef.current?.contains(t)) return
      if (panelRef.current?.contains(t)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return pos
}

function orderedGroups(options: SelectOption[]): string[] {
  return options.reduce<string[]>((acc, o) => {
    const g = o.group ?? ''
    if (!acc.includes(g)) acc.push(g)
    return acc
  }, [])
}

// ---------------------------------------------------------------------------
// Single-select
// ---------------------------------------------------------------------------

export function Select({
  value,
  options,
  onChange,
  placeholder = 'Select…',
  searchable,
  ariaLabel,
  buttonClassName,
  panelWidth,
  align = 'left',
  actions,
}: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  searchable?: boolean
  ariaLabel?: string
  buttonClassName?: string
  panelWidth?: number
  align?: 'left' | 'right'
  /** Extra rows rendered at the bottom (e.g. "+ Add category"). */
  actions?: { label: string; onSelect: () => void }[]
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pos = usePanelPosition(open, btnRef, panelRef, () => setOpen(false), panelWidth ?? 224, align)

  const selected = options.find((o) => o.value === value)
  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const groups = orderedGroups(filtered)

  const choose = (v: string) => {
    onChange(v)
    setOpen(false)
    setQ('')
  }

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
        className={
          buttonClassName ??
          'inline-flex h-9 min-w-0 items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm transition-colors hover:bg-gray-50'
        }
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.color && (
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: selected.color }} />
          )}
          <span className={`truncate ${selected ? '' : 'text-gray-400'}`}>{selected?.label ?? placeholder}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            className="z-[60] rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
          >
            {searchable && (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            )}
            <div className="max-h-72 overflow-y-auto">
              {groups.map((g) => (
                <div key={g}>
                  {g && (
                    <p className="px-1 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g}</p>
                  )}
                  {filtered
                    .filter((o) => (o.group ?? '') === g)
                    .map((o) => {
                      const on = o.value === value
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => choose(o.value)}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-gray-50 ${
                            on ? 'text-blue-700' : 'text-gray-700'
                          }`}
                        >
                          {o.color && (
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: o.color }} />
                          )}
                          <span className="min-w-0 flex-1 truncate">{o.label}</span>
                          {on && <Check className="h-4 w-4 shrink-0 text-blue-600" />}
                        </button>
                      )
                    })}
                </div>
              ))}
              {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-gray-400">No matches</p>}
            </div>
            {actions && actions.length > 0 && (
              <div className="mt-1 border-t border-gray-100 pt-1">
                {actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => {
                      a.onSelect()
                      setOpen(false)
                      setQ('')
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium text-blue-600 hover:bg-blue-50"
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Multi-select (checkbox list)
// ---------------------------------------------------------------------------

export interface MSOption {
  value: string
  label: string
  group?: string
}

export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  searchable,
}: {
  label: string
  options: MSOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  searchable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const pos = usePanelPosition(open, btnRef, panelRef, () => setOpen(false), 256)

  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onChange(next)
  }

  const summary =
    selected.size === 0
      ? `All ${label}`
      : selected.size === 1
        ? (options.find((o) => o.value === [...selected][0])?.label ?? `1 ${label.slice(0, -1)}`)
        : `${selected.size} ${label}`

  const filtered = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options
  const groups = orderedGroups(filtered)

  return (
    <>
      <button
        type="button"
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm shadow-sm transition-colors ${
          selected.size ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
        }`}
      >
        {summary}
        <ChevronDown className={`h-4 w-4 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width }}
            className="z-[60] rounded-xl border border-gray-200 bg-white p-2 shadow-xl"
          >
            <div className="mb-1.5 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</span>
              {selected.size > 0 && (
                <button type="button" onClick={() => onChange(new Set())} className="text-xs font-medium text-blue-600 hover:underline">
                  Clear
                </button>
              )}
            </div>
            {searchable && (
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search…"
                className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-300"
              />
            )}
            <div className="max-h-72 overflow-y-auto">
              {groups.map((g) => (
                <div key={g}>
                  {g && (
                    <p className="px-1 pb-0.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">{g}</p>
                  )}
                  {filtered
                    .filter((o) => (o.group ?? '') === g)
                    .map((o) => {
                      const on = selected.has(o.value)
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => toggle(o.value)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              on ? 'border-blue-500 bg-blue-500 text-white' : 'border-gray-300'
                            }`}
                          >
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{o.label}</span>
                        </button>
                      )
                    })}
                </div>
              ))}
              {filtered.length === 0 && <p className="px-2 py-3 text-center text-xs text-gray-400">No matches</p>}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
