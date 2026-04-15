'use client'

import { useState, useEffect } from 'react'
import { AppSidebar } from './AppSidebar'
import { SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/lib/constants'

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const sidebarWidth = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH

  useEffect(() => {
    const stored = localStorage.getItem('sidebar-collapsed') === 'true'
    setCollapsed(stored)
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (hydrated) localStorage.setItem('sidebar-collapsed', String(collapsed))
  }, [collapsed, hydrated])

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">
      <AppSidebar collapsed={collapsed} onToggle={() => setCollapsed(c => !c)} />
      <div
        className="flex-1 min-h-screen transition-[margin-left] duration-200 ease-in-out"
        style={{ marginLeft: sidebarWidth }}
      >
        {children}
      </div>
    </div>
  )
}
