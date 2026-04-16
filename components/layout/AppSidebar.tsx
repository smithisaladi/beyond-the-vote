'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/lib/constants'

function IconHome() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}

function IconFileText() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  )
}

function IconDollarSign() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

const NAV_ITEMS = [
  { label: 'Dashboard',      href: '/',               icon: <IconHome /> },
  { label: 'My Politicians', href: '/representatives', icon: <IconUsers /> },
  { label: 'Bills Tracker',  href: '/bills',           icon: <IconFileText /> },
  { label: 'Donors',         href: '/donors',          icon: <IconDollarSign /> },
  { label: 'Settings',       href: '/settings',        icon: <IconSettings /> },
]

interface AppSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = usePathname()
  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH

  return (
    <aside
      className="fixed top-0 left-0 h-full flex flex-col bg-[#D6CFC4] border-r border-[#C4BCB0] z-20 transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{ width }}
    >
      {/* Brand */}
      <div
        className="border-b border-[#C4BCB0] flex items-center justify-center"
        style={{ minHeight: 64, padding: collapsed ? '0' : '0 16px' }}
      >
        {collapsed ? (
          <Link href="/" aria-label="Beyond the Vote — home" className="flex items-center justify-center w-full">
            <span
              className="text-2xl font-bold tracking-tight select-none leading-none"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              <span className="text-[#1C1C1A]">B</span>
              <span className="text-[#7B5E8A]">V</span>
            </span>
          </Link>
        ) : (
          <Link href="/" className="flex items-center justify-center w-full">
            <span
              className="text-xl font-semibold text-[#1C1C1A] tracking-tight whitespace-nowrap"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Beyond the <span className="text-[#7B5E8A]">Vote</span>
            </span>
          </Link>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 flex flex-col gap-0.5" style={{ paddingLeft: collapsed ? 0 : 8, paddingRight: collapsed ? 0 : 8 }}>
        {NAV_ITEMS.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          if (collapsed) {
            return (
              <Link
                key={item.label}
                href={item.href}
                title={item.label}
                className={`flex items-center justify-center py-2.5 mx-2 rounded-lg transition-colors ${
                  active
                    ? 'bg-[#C8BED0]/40 text-[#7B5E8A]'
                    : 'text-[#1C1C1A]/40 hover:text-[#1C1C1A] hover:bg-[#BDB5A8]/40'
                }`}
              >
                {item.icon}
              </Link>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 py-2.5 rounded-r-lg text-sm transition-colors ${
                active
                  ? 'border-l-2 border-[#7B5E8A] bg-[#C8BED0]/40 text-[#1C1C1A] font-medium pl-[14px] pr-3'
                  : 'border-l-2 border-transparent text-[#1C1C1A]/60 hover:text-[#1C1C1A] hover:bg-[#BDB5A8]/40 pl-[14px] pr-3'
              }`}
            >
              <span className={active ? 'text-[#7B5E8A]' : 'text-[#1C1C1A]/40'}>{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-[#C4BCB0] flex" style={{ padding: collapsed ? '12px 0' : '12px 8px' }}>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-2 py-2 rounded-lg text-xs text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 hover:bg-[#BDB5A8]/40 transition-colors ${
            collapsed ? 'justify-center w-full mx-2' : 'px-3 w-full'
          }`}
        >
          {collapsed ? <IconChevronRight /> : (
            <>
              <IconChevronLeft />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
