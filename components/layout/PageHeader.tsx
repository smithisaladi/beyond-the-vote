'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, LogOut } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getUserInitials } from '@/lib/ui'
import { SignInModal } from '@/components/auth/SignInModal'
import { SignUpModal } from '@/components/auth/SignUpModal'

export function PageHeader({ title }: { title: string }) {
  const { user, loading, signOut } = useAuth()
  const pathname = usePathname()
  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

  if (!user && !loading) {
    return (
      <>
        <header className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-sm border-b border-[rgba(28,28,26,0.1)]">
          <div className="max-w-6xl mx-auto px-6 flex items-center h-16 gap-6">
            <Link
              href="/"
              className="text-base text-[#1C1C1A] tracking-[0.01em] flex-shrink-0"
              style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
            >
              Beyond the Vote
            </Link>

            <div className="w-px h-5 bg-[rgba(28,28,26,0.15)]" />

            <nav className="flex gap-1 flex-1 h-full items-stretch" aria-label="Main navigation">
              {([
                { href: '/representatives', label: 'Know Your Representative' },
                { href: '/bills', label: 'Bills' },
                { href: '/donors', label: 'Donors' },
              ] as const).map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className={`px-4 text-sm transition-colors relative flex items-center ${
                    pathname === href
                      ? 'text-[#1C1C1A] font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1C1C1A] after:rounded-t-full'
                      : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>

            <div className="flex items-center gap-3 flex-shrink-0">
              <button
                onClick={() => setShowSignIn(true)}
                className="text-sm text-[#1C1C1A]/60 hover:text-[#1C1C1A] transition-colors"
              >
                Sign in
              </button>
              <button
                onClick={() => setShowSignUp(true)}
                className="text-sm bg-[#9B7FA6] text-white px-4 py-2 rounded-lg hover:bg-[#8a6e95] transition-colors shadow-sm font-medium"
              >
                Sign up
              </button>
            </div>
          </div>
        </header>

        <SignInModal
          isOpen={showSignIn}
          onClose={() => setShowSignIn(false)}
          onSwitchToSignUp={() => { setShowSignIn(false); setShowSignUp(true) }}
        />
        <SignUpModal
          isOpen={showSignUp}
          onClose={() => setShowSignUp(false)}
          onSwitchToSignIn={() => { setShowSignUp(false); setShowSignIn(true) }}
        />
      </>
    )
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
          <>
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

            <button
              onClick={signOut}
              aria-label="Sign out"
              className="flex items-center gap-2 text-sm text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75 transition-colors"
            >
              <span className="hidden sm:inline">Sign out</span>
              <LogOut size={16} />
            </button>
          </>
        )}
      </div>
    </header>
  )
}
