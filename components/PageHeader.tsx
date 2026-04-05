'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function SignOutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export function PageHeader({ title }: { title: string }) {
  const router = useRouter()

  const handleSignOut = async () => {
    await createClient().auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <header className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] min-h-[64px] px-8 flex items-center justify-between">
      <h1 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>{title}</h1>
      <button
        onClick={handleSignOut}
        aria-label="Sign out"
        className="flex items-center gap-2 text-sm text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75 transition-colors"
      >
        <span className="hidden sm:inline">Sign out</span>
        <SignOutIcon />
      </button>
    </header>
  )
}
