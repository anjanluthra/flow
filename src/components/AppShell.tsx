'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu, Waves } from 'lucide-react'
import { Sidebar } from '@/components/ui/Sidebar'
import { AssistantWidget } from '@/components/AssistantWidget'

// Routes that render full-bleed, without the app chrome (sidebar / assistant).
function isBareRoute(pathname: string): boolean {
  return pathname.startsWith('/auth')
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  if (isBareRoute(pathname)) {
    return <>{children}</>
  }

  return (
    <div>
      <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />

      <div className="md:ml-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white/90 px-4 backdrop-blur md:hidden">
          <button
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"
          >
            <Menu className="h-6 w-6" />
          </button>
          <div className="flex items-center gap-2">
            <Waves className="h-5 w-5 text-accent" strokeWidth={2.25} />
            <span className="text-lg font-bold tracking-tight text-accent">Flow</span>
          </div>
        </header>

        <main className="min-h-screen bg-slate-50/50">{children}</main>
      </div>

      <AssistantWidget />
    </div>
  )
}
