

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
    <div className="min-h-screen bg-bg">

      {/* ── Top nav ── */}
      <header className="sticky top-0 z-20 bg-bg/95 backdrop-blur-sm border-b border-edge">
        <div className="max-w-6xl mx-auto px-6 flex items-center h-16 gap-6">

          {/* Logo */}
          <span className="text-base text-fg tracking-tight font-semibold flex-shrink-0">
            Beyond the Vote
          </span>

          {/* Divider */}
          <div className="w-px h-5 bg-fg/15" />

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
                    ? 'text-fg font-medium after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-fg after:rounded-t-full'
                    : 'text-fg/45 hover:text-fg/75'
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
              className="text-sm text-fg/60 hover:text-fg transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={openSignUp}
              className="text-sm bg-accent-deep text-fg px-4 py-2 rounded-lg hover:bg-accent-deep-hover transition-colors font-medium"
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
      <footer className="border-t border-edge py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span className="text-sm text-fg/60 font-semibold tracking-tight">
            Beyond the Vote
          </span>
          <p className="text-xs text-fg/38">
            © 2026 Beyond the Vote. Bringing transparency to democracy.
          </p>
        </div>
      </footer>

    </div>
  )
}
