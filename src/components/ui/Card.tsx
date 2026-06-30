'use client'

import React from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

interface CardProps {
  title: string
  value: string
  subtitle?: string
  change?: number
  icon?: React.ReactNode
  className?: string
}

export function Card({
  title,
  value,
  subtitle,
  change,
  icon,
  className = '',
}: CardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium uppercase tracking-wide text-gray-500">
            {title}
          </p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
        {icon && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50 text-gray-400">
            {icon}
          </div>
        )}
      </div>

      {(change !== undefined || subtitle) && (
        <div className="mt-3 flex items-center gap-2">
          {change !== undefined && (
            <span
              className={`inline-flex items-center gap-1 text-sm font-medium ${
                change >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {change >= 0 ? (
                <TrendingUp className="h-4 w-4" />
              ) : (
                <TrendingDown className="h-4 w-4" />
              )}
              {change >= 0 ? '+' : ''}
              {change.toFixed(1)}%
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-gray-400">{subtitle}</span>
          )}
        </div>
      )}
    </div>
  )
}
