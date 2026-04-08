'use client'

import { Bell, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getUserInitials } from '@/lib/ui'

export function PageHeader({ title }: { title: string }) {
  const { user, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
      <h1 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>{title}</h1>

      <div className="flex items-center gap-5">
        <button
          className="relative text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={19} />
        </button>

        {user && (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#9B7FA6]/20 border border-[#9B7FA6]/30 flex items-center justify-center">
              <span className="text-xs font-semibold text-[#9B7FA6]" style={{ fontFamily: 'var(--font-serif)' }}>
                {getUserInitials(user)}
              </span>
            </div>
            <span className="text-sm text-[#1C1C1A]/60 hidden sm:inline">
              {user.user_metadata?.full_name ?? user.email}
            </span>
          </div>
        )}

        <button
          onClick={signOut}
          aria-label="Sign out"
          className="flex items-center gap-2 text-sm text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75 transition-colors"
        >
          <span className="hidden sm:inline">Sign out</span>
          <LogOut size={16} />
        </button>
      </div>
    </header>
  )
}
