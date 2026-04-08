'use client'

import { useState } from 'react'
import { AppSidebar } from './AppSidebar'

const EXPANDED_WIDTH = 228
const COLLAPSED_WIDTH = 60

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)
  const sidebarWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH

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
