'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { SignInModal } from './SignInModal'
import { SignUpModal } from './SignUpModal'

const NAV_LINKS = [
  { href: '/',                label: 'Home'          },
  { href: '/representatives', label: 'Find My Reps'  },
  { href: '/bills',           label: 'Bills'         },
  { href: '/representatives', label: 'Politicians'   },
]

function IconMenu({ open }: { open: boolean }) {
  return open ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

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

export function Navigation() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser]         = useState<User | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
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
    <>
      <nav className="w-full bg-[#F5F0E8] border-b border-[#D6CFC4] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between gap-6">

          {/* Logo — wordmark only */}
          <Link href="/" className="flex-shrink-0">
            <span
              className="text-xl font-semibold text-[#1C1C1A] tracking-tight"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              Beyond the Ballot
            </span>
          </Link>

          {/* Center nav links — desktop only */}
          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href
              return (
                <Link
                  key={label}
                  href={href}
                  className={`text-sm relative group transition-colors ${active ? 'text-[#1C1C1A]' : 'text-[#1C1C1A]/70 hover:text-[#1C1C1A]'}`}
                >
                  {label}
                  <span className={`absolute -bottom-[1px] left-0 h-[2px] bg-[#9B7FA6] transition-all duration-200 ${active ? 'w-full' : 'w-0 group-hover:w-full'}`} />
                </Link>
              )
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="hidden md:flex items-center px-4 py-1.5 rounded-lg border border-[#1C1C1A]/25 text-sm text-[#1C1C1A] hover:border-[#1C1C1A]/50 transition-colors"
                >
                  Dashboard
                </Link>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-[#9B7FA6] flex items-center justify-center text-white text-xs font-semibold select-none">
                    {getInitials(user)}
                  </div>
                  <button
                    onClick={handleSignOut}
                    className="hidden md:block text-sm text-[#1C1C1A]/60 hover:text-[#1C1C1A] transition-colors"
                  >
                    Sign Out
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Sign In — ghost outline, hidden on mobile */}
                <button
                  onClick={() => setShowSignIn(true)}
                  className="hidden md:flex items-center px-4 py-1.5 rounded-lg border border-[#1C1C1A]/25 text-sm text-[#1C1C1A] hover:border-[#1C1C1A]/50 transition-colors"
                >
                  Sign In
                </button>

                {/* Sign Up — filled mauve */}
                <button
                  onClick={() => setShowSignUp(true)}
                  className="px-4 py-1.5 rounded-lg bg-[#9B7FA6] text-white text-sm hover:bg-[#8a6e95] transition-colors"
                >
                  Sign Up
                </button>
              </>
            )}

            {/* Hamburger — mobile only */}
            <button
              className="md:hidden p-1.5 text-[#1C1C1A]/60 hover:text-[#1C1C1A] transition-colors"
              onClick={() => setMenuOpen(o => !o)}
              aria-label="Toggle menu"
            >
              <IconMenu open={menuOpen} />
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="md:hidden border-t border-[#D6CFC4] bg-[#F5F0E8] px-6 py-4 flex flex-col gap-1">
            {NAV_LINKS.map(({ href, label }) => {
              const active = pathname === href
              return (
                <Link
                  key={label}
                  href={href}
                  onClick={() => setMenuOpen(false)}
                  className={`py-2.5 text-sm transition-colors border-b border-[#D6CFC4]/60 last:border-0 ${active ? 'text-[#1C1C1A] font-medium' : 'text-[#1C1C1A]/70 hover:text-[#1C1C1A]'}`}
                >
                  {label}
                </Link>
              )
            })}
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={() => setMenuOpen(false)}
                  className="py-2.5 text-sm text-[#1C1C1A]/70 hover:text-[#1C1C1A] transition-colors border-b border-[#D6CFC4]/60"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => { setMenuOpen(false); handleSignOut() }}
                  className="mt-2 py-2.5 text-sm text-[#1C1C1A]/70 hover:text-[#1C1C1A] transition-colors text-left"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <button
                onClick={() => { setMenuOpen(false); setShowSignIn(true) }}
                className="mt-2 py-2.5 text-sm text-[#1C1C1A]/70 hover:text-[#1C1C1A] transition-colors text-left"
              >
                Sign In
              </button>
            )}
          </div>
        )}
      </nav>

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
