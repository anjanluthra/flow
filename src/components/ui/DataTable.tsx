'use client'

import React, { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface Column<T> {
  key: string
  header: string
  render?: (item: T) => React.ReactNode
  sortable?: boolean
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  onSort?: (key: string, direction: 'asc' | 'desc') => void
  sortKey?: string
  sortDirection?: 'asc' | 'desc'
  emptyMessage?: string
  className?: string
  rowClassName?: (item: T) => string
  onRowClick?: (item: T) => void
  pageSize?: number
}

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((acc: unknown, part: string) => {
    if (acc && typeof acc === 'object' && part in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[part]
    }
    return undefined
  }, obj)
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  onSort,
  sortKey: controlledSortKey,
  sortDirection: controlledSortDirection,
  emptyMessage = 'No data available',
  className = '',
  rowClassName,
  onRowClick,
  pageSize = 10,
}: DataTableProps<T>) {
  const [internalSortKey, setInternalSortKey] = useState<string | null>(null)
  const [internalSortDirection, setInternalSortDirection] = useState<'asc' | 'desc'>('asc')
  const [currentPage, setCurrentPage] = useState(0)

  const isControlled = controlledSortKey !== undefined
  const activeSortKey = isControlled ? controlledSortKey : internalSortKey
  const activeSortDirection = isControlled ? (controlledSortDirection ?? 'asc') : internalSortDirection

  const handleSort = (key: string) => {
    const column = columns.find((col) => col.key === key)
    if (!column?.sortable) return

    let newDirection: 'asc' | 'desc' = 'asc'
    if (activeSortKey === key && activeSortDirection === 'asc') {
      newDirection = 'desc'
    }

    if (onSort) {
      onSort(key, newDirection)
    }

    if (!isControlled) {
      setInternalSortKey(key)
      setInternalSortDirection(newDirection)
    }

    setCurrentPage(0)
  }

  const sortedData = useMemo(() => {
    if (isControlled || !internalSortKey) return data

    const sorted = [...data].sort((a, b) => {
      const aVal = getNestedValue(a, internalSortKey)
      const bVal = getNestedValue(b, internalSortKey)

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return internalSortDirection === 'asc' ? aVal - bVal : bVal - aVal
      }

      const aStr = String(aVal).toLowerCase()
      const bStr = String(bVal).toLowerCase()
      const cmp = aStr.localeCompare(bStr)
      return internalSortDirection === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [data, internalSortKey, internalSortDirection, isControlled])

  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize))
  const paginatedData = sortedData.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize
  )

  const goToPreviousPage = () => setCurrentPage((p) => Math.max(0, p - 1))
  const goToNextPage = () => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))

  return (
    <div className={`overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm ${className}`}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 ${
                    column.sortable ? 'cursor-pointer select-none hover:text-gray-700' : ''
                  } ${column.className ?? ''}`}
                  onClick={() => column.sortable && handleSort(column.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {column.header}
                    {column.sortable && activeSortKey === column.key && (
                      activeSortDirection === 'asc' ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-12 text-center text-sm text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((item, rowIndex) => (
                <tr
                  key={rowIndex}
                  className={`border-b border-gray-100 transition-colors hover:bg-gray-50 ${
                    onRowClick ? 'cursor-pointer' : ''
                  } ${rowClassName ? rowClassName(item) : ''}`}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`px-4 py-3 text-gray-700 ${column.className ?? ''}`}
                    >
                      {column.render
                        ? column.render(item)
                        : String(getNestedValue(item, column.key) ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {sortedData.length > pageSize && (
        <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3">
          <p className="text-sm text-gray-500">
            Page {currentPage + 1} of {totalPages}
            <span className="ml-2 text-gray-400">
              ({sortedData.length} {sortedData.length === 1 ? 'row' : 'rows'})
            </span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={goToPreviousPage}
              disabled={currentPage === 0}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={goToNextPage}
              disabled={currentPage >= totalPages - 1}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
