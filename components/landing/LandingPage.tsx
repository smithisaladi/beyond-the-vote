'use client'

import { useState } from 'react'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { RepresentativesTab } from './tabs/RepresentativesTab'
import { BillsTab } from './tabs/BillsTab'
import { DonorsTab } from './tabs/DonorsTab'

type Tab = 'representatives' | 'bills' | 'donors'

export function LandingPage() {
  const [tab, setTab] = useState<Tab>('representatives')
  const { openSignIn, openSignUp } = useAuthModal()

  return (
    <div className="min-h-screen bg-[#F5F0E8]">

      {/* ── Top nav ── */}
      <header className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-sm border-b border-[rgba(28,28,26,0.1)]">
        <div className="max-w-6xl mx-auto px-6 flex items-center h-16 gap-6">

          {/* Logo */}
          <span
            className="text-base text-[#1C1C1A] tracking-[0.01em] flex-shrink-0"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Beyond the Vote
          </span>

          {/* Divider */}
          <div className="w-px h-5 bg-[rgba(28,28,26,0.15)]" />

          {/* Tab nav */}
          <nav className="flex gap-1 flex-1 h-full items-stretch" aria-label="Main navigation">
            {([
              { id: 'representatives', label: 'Know Your Representative' },
              { id: 'bills', label: 'Bills' },
              { id: 'donors', label: 'Donors' },
            ] as { id: Tab; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`px-4 text-sm transition-colors relative ${
                  tab === id
                    ? 'text-[#1C1C1A] font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-[#1C1C1A] after:rounded-t-full'
                    : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/75'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Auth CTAs */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              onClick={openSignIn}
              className="text-sm text-[#1C1C1A]/60 hover:text-[#1C1C1A] transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={openSignUp}
              className="text-sm bg-[#7B5E8A] text-white px-4 py-2 rounded-lg hover:bg-[#6A4F78] transition-colors shadow-sm font-medium"
            >
              Sign up
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab content ── */}
      <main id="main-content">
        {tab === 'representatives'
          ? <RepresentativesTab onSignUp={openSignUp} />
          : tab === 'bills'
          ? <BillsTab onSignUp={openSignUp} />
          : <DonorsTab onSignUp={openSignUp} />
        }
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[rgba(28,28,26,0.1)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span
            className="text-sm text-[#1C1C1A]/60"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Beyond the Vote
          </span>
          <p className="text-xs text-[#1C1C1A]/38">
            © 2026 Beyond the Vote. Bringing transparency to democracy.
          </p>
        </div>
      </footer>

    </div>
  )
}
