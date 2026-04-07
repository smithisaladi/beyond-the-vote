'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

function getInitials(user: User): string {
  const name = user.user_metadata?.full_name as string | undefined
  if (name) {
    const parts = name.trim().split(/\s+/)
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0][0].toUpperCase()
  }
  return (user.email?.[0] ?? '?').toUpperCase()
}

export function PageHeader({ title }: { title: string }) {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleSignOut = async () => {
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

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
                {getInitials(user)}
              </span>
            </div>
            <span className="text-sm text-[#1C1C1A]/60 hidden sm:inline">
              {user.user_metadata?.full_name ?? user.email}
            </span>
          </div>
        )}

        <button
          onClick={handleSignOut}
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
