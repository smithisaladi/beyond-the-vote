import { Link } from "@tanstack/react-router"
import { useLocation } from "@tanstack/react-router"
import { LayoutDashboard, Users, ScrollText, CircleDollarSign, Settings, ChevronLeft, ChevronRight } from "lucide-react"
import { SIDEBAR_EXPANDED_WIDTH, SIDEBAR_COLLAPSED_WIDTH } from '@/lib/constants'

const NAV_ITEMS = [
  { label: 'Home',            href: '/home',            icon: <LayoutDashboard size={18} strokeWidth={1.8} /> },
  { label: 'My Politicians', href: '/representatives', icon: <Users size={18} strokeWidth={1.8} /> },
  { label: 'Bills Tracker',  href: '/bills',           icon: <ScrollText size={18} strokeWidth={1.8} /> },
  { label: 'Donors',         href: '/donors',          icon: <CircleDollarSign size={18} strokeWidth={1.8} /> },
  { label: 'Settings',       href: '/settings',        icon: <Settings size={18} strokeWidth={1.8} /> },
]

interface AppSidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const pathname = useLocation().pathname
  const width = collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH

  return (
    <aside
      className="fixed top-0 left-0 h-full flex flex-col bg-[#1C1C1A] border-r border-edge z-20 transition-[width] duration-200 ease-in-out overflow-hidden"
      style={{ width }}
    >
      {/* Brand */}
      <div
        className="border-b border-edge flex items-center justify-center"
        style={{ minHeight: 64, padding: collapsed ? '0' : '0 16px' }}
      >
        {collapsed ? (
          <Link to="/home" aria-label="Beyond the Vote — home" className="flex items-center justify-center w-full">
            <span className="text-2xl font-semibold tracking-tight select-none leading-none">
              <span className="text-fg">B</span>
              <span className="text-accent">V</span>
            </span>
          </Link>
        ) : (
          <Link to="/home" className="flex items-center justify-center w-full">
            <span className="text-xl font-semibold text-fg tracking-tight whitespace-nowrap">
              Beyond the <span className="text-accent">Vote</span>
            </span>
          </Link>
        )}
      </div>

      {/* Nav links */}
      <nav className="flex-1 py-4 flex flex-col gap-0.5" style={{ paddingLeft: collapsed ? 0 : 8, paddingRight: collapsed ? 0 : 8 }}>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/home' && pathname.startsWith(item.href))
          if (collapsed) {
            return (
              <Link
                key={item.label}
                to={item.href}
                title={item.label}
                aria-label={item.label}
                className={`flex items-center justify-center py-2.5 mx-2 rounded-lg transition-colors ${
                  active
                    ? 'text-accent bg-accent-deep/[0.12]'
                    : 'text-fg/50 hover:text-fg/80 hover:bg-fg/[0.05]'
                }`}
              >
                {item.icon}
              </Link>
            )
          }
          return (
            <Link
              key={item.label}
              to={item.href}
              className={`flex items-center gap-3 py-2.5 rounded-lg text-sm transition-colors pl-3 pr-3 ${
                active
                  ? 'text-accent bg-accent-deep/[0.12] font-medium'
                  : 'text-fg/50 hover:text-fg/80 hover:bg-fg/[0.05]'
              }`}
            >
              {item.icon}
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-edge flex" style={{ padding: collapsed ? '12px 0' : '12px 8px' }}>
        <button
          onClick={onToggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`flex items-center gap-2 py-2 rounded-lg text-xs text-fg/45 hover:text-fg/70 hover:bg-fg/[0.05] transition-colors ${
            collapsed ? 'justify-center w-full mx-2' : 'px-3 w-full'
          }`}
        >
          {collapsed ? <ChevronRight size={15} strokeWidth={2} /> : (
            <>
              <ChevronLeft size={15} strokeWidth={2} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
