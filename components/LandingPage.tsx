'use client'

import { useState } from 'react'
import { SignInModal } from './SignInModal'
import { SignUpModal } from './SignUpModal'

type Tab = 'representatives' | 'bills'

// ── Decorative background ─────────────────────────────────────────────────────

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
    >
      <defs>
        <pattern id="topo-landing" x="0" y="0" width="900" height="700" patternUnits="userSpaceOnUse">
          <ellipse cx="700" cy="200" rx="420" ry="300" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="700" cy="200" rx="340" ry="240" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="705" cy="197" rx="265" ry="185" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="708" cy="194" rx="195" ry="135" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="711" cy="191" rx="130" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="713" cy="189" rx="72"  ry="50"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="120" cy="580" rx="180" ry="120" fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="124" cy="576" rx="120" ry="78"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="127" cy="573" rx="68"  ry="44"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo-landing)" />
    </svg>
  )
}

// ── Mock preview cards ────────────────────────────────────────────────────────

function MockRepCard({ name, title, party, state, vote }: {
  name: string; title: string; party: string; state: string
  vote?: { bill: string; position: 'Yea' | 'Nay' }
}) {
  const partyColor = party === 'Democrat'
    ? 'bg-[#7B8FA8]/[0.12] text-[#7B8FA8]'
    : party === 'Republican'
    ? 'bg-[#A87B7B]/[0.12] text-[#A87B7B]'
    : 'bg-[#8A8A7A]/[0.12] text-[#8A8A7A]'
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
          <span className="text-sm text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
            {initials}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1C1C1A] truncate" style={{ fontFamily: 'var(--font-serif)' }}>
            {name}
          </p>
          <p className="text-xs text-[#1C1C1A]/50 mt-0.5 truncate">{title}</p>
          <p className="text-xs text-[#1C1C1A]/38">{state}</p>
        </div>
      </div>
      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${partyColor} mb-3`}>
        {party}
      </span>
      {vote && (
        <div className="border-t border-[rgba(28,28,26,0.06)] pt-3">
          <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-1.5">Latest vote</p>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-[#1C1C1A]/70 leading-snug flex-1">{vote.bill}</p>
            <span className={`text-[11px] font-semibold flex-shrink-0 ${vote.position === 'Yea' ? 'text-[#6A9B7B]' : 'text-[#B85C38]'}`}>
              {vote.position}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

function MockBillCard({ number, title, status, category }: {
  number: string; title: string; status: string; category: string
}) {
  const statusColor = status === 'Active' ? 'bg-[#9B7FA6]/[0.12] text-[#9B7FA6]'
    : status === 'Committee' ? 'bg-[#8A8A7A]/[0.12] text-[#8A8A7A]'
    : status === 'Passed' ? 'bg-[#6A9B7B]/[0.12] text-[#6A9B7B]'
    : 'bg-[#B85C38]/[0.12] text-[#B85C38]'
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[11px] font-mono text-[#1C1C1A]/38">{number}</span>
        <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${statusColor}`}>
          {status}
        </span>
      </div>
      <p className="text-sm text-[#1C1C1A] leading-snug mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
        {title}
      </p>
      <span className="inline-block text-[11px] text-[#1C1C1A]/40 bg-[#F5F0E8] border border-[rgba(28,28,26,0.08)] px-2.5 py-1 rounded-full">
        {category}
      </span>
    </div>
  )
}

// ── Feature item ──────────────────────────────────────────────────────────────

function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#9B7FA6]/10 border border-[#9B7FA6]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[#9B7FA6]">{icon}</span>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#1C1C1A] mb-1.5" style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}>{title}</h3>
        <p className="text-sm text-[#1C1C1A]/55 leading-[1.7]">{description}</p>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
function IconBell() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}
function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}
function IconVote() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  )
}
function IconFilter() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}
function IconBookmark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  )
}
function IconTrending() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

// ── Tab content ───────────────────────────────────────────────────────────────

function RepresentativesTab({ onSignUp }: { onSignUp: () => void }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        <TopoBackground />
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-medium text-[#9B7FA6] bg-[#9B7FA6]/10 border border-[#9B7FA6]/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
                Know Your Representative
              </span>
              <h1
                className="text-5xl sm:text-6xl text-[#1C1C1A] mb-6 leading-[1.08] tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
              >
                Know exactly who represents you — and what they stand for
              </h1>
              <p className="text-xl text-[#1C1C1A]/55 mb-9 leading-relaxed max-w-lg">
                Beyond the Ballot connects you directly to your elected officials' voting records,
                positions, and actions — so you can hold them accountable.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 bg-[#9B7FA6] text-white rounded-xl text-sm font-medium hover:bg-[#8a6e95] transition-colors shadow-sm"
                >
                  Get started free
                </button>
                <a
                  href="/representatives"
                  className="px-6 py-3 bg-white border border-[#D6CFC4] text-[#1C1C1A] rounded-xl text-sm font-medium hover:border-[#9B7FA6]/50 hover:text-[#9B7FA6] transition-colors shadow-sm"
                >
                  Find your representatives →
                </a>
              </div>
            </div>

            {/* Preview cards */}
            <div className="flex flex-col gap-3 lg:mt-0 mt-4">
              <MockRepCard
                name="Margaret Chen"
                title="U.S. Senator"
                party="Democrat"
                state="California"
                vote={{ bill: 'Clean Energy Transition Act', position: 'Yea' }}
              />
              <MockRepCard
                name="Robert Harmon"
                title="U.S. Representative"
                party="Republican"
                state="Texas"
                vote={{ bill: 'Federal Budget Reconciliation Act', position: 'Nay' }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white/50 border-y border-[rgba(28,28,26,0.07)]" aria-labelledby="rep-features-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="rep-features-heading"
            className="text-3xl text-[#1C1C1A] mb-2 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Everything you need to stay informed
          </h2>
          <p className="text-sm text-[#1C1C1A]/50 text-center mb-14 max-w-md mx-auto tracking-[0.01em]">
            One platform to find, follow, and understand the people who represent you.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <Feature
              icon={<IconUsers />}
              title="Find your representatives"
              description="Enter your home address to instantly see every federal official who represents you, from senators to your House member."
            />
            <Feature
              icon={<IconVote />}
              title="Track their votes"
              description="See how your representatives vote on every bill — healthcare, climate, defense, education, and more — in clear, plain language."
            />
            <Feature
              icon={<IconBell />}
              title="Get personalized alerts"
              description="Follow specific politicians and receive notifications when they vote on issues that matter to you, so you're never out of the loop."
            />
          </div>
        </div>
      </section>

      {/* Social proof / stat strip */}
      <section className="py-16 px-6" aria-label="Platform statistics">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-6 text-center">
          {[
            { stat: '535', label: 'Members of Congress tracked' },
            { stat: '10,000+', label: 'Bills indexed' },
            { stat: '100%', label: 'Free to get started' },
          ].map(({ stat, label }) => (
            <div key={label}>
              <p className="text-4xl font-semibold text-[#9B7FA6] mb-1.5" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}>
                {stat}
              </p>
              <p className="text-[11px] text-[#1C1C1A]/50 leading-snug uppercase tracking-[0.04em]">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#9B7FA6]/[0.07] border-t border-[#9B7FA6]/15" aria-labelledby="rep-cta-heading">
        <div className="max-w-xl mx-auto text-center">
          <h2
            id="rep-cta-heading"
            className="text-3xl text-[#1C1C1A] mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Democracy works when voters are informed
          </h2>
          <p className="text-base text-[#1C1C1A]/55 mb-8 leading-relaxed">
            Join Beyond the Ballot and start building a clearer picture of who really represents your interests.
          </p>
          <button
            onClick={onSignUp}
            className="px-10 py-3.5 bg-[#9B7FA6] text-white rounded-xl text-sm font-medium hover:bg-[#8a6e95] transition-colors shadow-sm"
          >
            Create your free account
          </button>
        </div>
      </section>
    </div>
  )
}

function BillsTab({ onSignUp }: { onSignUp: () => void }) {
  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden pt-24 pb-20 px-6">
        <TopoBackground />
        <div className="relative z-10 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-12 items-center">
            <div>
              <span className="inline-block text-xs font-medium text-[#9B7FA6] bg-[#9B7FA6]/10 border border-[#9B7FA6]/20 px-3 py-1 rounded-full mb-6 tracking-[0.08em] uppercase">
                Bills Tracker
              </span>
              <h1
                className="text-5xl sm:text-6xl text-[#1C1C1A] mb-6 leading-[1.08] tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
              >
                Follow legislation from introduction to law
              </h1>
              <p className="text-xl text-[#1C1C1A]/55 mb-9 leading-relaxed max-w-lg">
                Track thousands of bills in real time. Understand what's being debated in Congress
                and how it could affect your community before it becomes law.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={onSignUp}
                  className="px-6 py-3 bg-[#9B7FA6] text-white rounded-xl text-sm font-medium hover:bg-[#8a6e95] transition-colors shadow-sm"
                >
                  Start tracking bills
                </button>
                <a
                  href="/bills"
                  className="px-6 py-3 bg-white border border-[#D6CFC4] text-[#1C1C1A] rounded-xl text-sm font-medium hover:border-[#9B7FA6]/50 hover:text-[#9B7FA6] transition-colors shadow-sm"
                >
                  Browse legislation →
                </a>
              </div>
            </div>

            {/* Preview cards */}
            <div className="flex flex-col gap-3 lg:mt-0 mt-4">
              <MockBillCard
                number="H.R. 4521"
                title="America COMPETES Act — Strengthening domestic semiconductor manufacturing and supply chains"
                status="Active"
                category="Economy"
              />
              <MockBillCard
                number="S. 1247"
                title="Clean Energy Transition Act — Accelerating renewable energy adoption and carbon reduction targets"
                status="Committee"
                category="Climate & Environment"
              />
              <MockBillCard
                number="H.R. 7910"
                title="Affordable Housing and Community Development Act"
                status="Passed"
                category="Housing"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-6 bg-white/50 border-y border-[rgba(28,28,26,0.07)]" aria-labelledby="bills-features-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="bills-features-heading"
            className="text-3xl text-[#1C1C1A] mb-2 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Track legislation like a professional
          </h2>
          <p className="text-sm text-[#1C1C1A]/50 text-center mb-14 max-w-md mx-auto tracking-[0.01em]">
            Powerful search and filtering tools make it easy to find what matters to you.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            <Feature
              icon={<IconFilter />}
              title="Search & filter"
              description="Find bills by topic, status, sponsor, date, or keyword. Filter by party, committee, and chamber to narrow down thousands of bills instantly."
            />
            <Feature
              icon={<IconTrending />}
              title="Track progress"
              description="Watch bills move through every stage — introduction, committee markup, floor vote, and final passage — with real-time status updates."
            />
            <Feature
              icon={<IconBookmark />}
              title="Save and follow"
              description="Bookmark the bills you care about. Get notified when a tracked bill advances, stalls, or reaches the President's desk."
            />
          </div>
        </div>
      </section>

      {/* Topic highlights */}
      <section className="py-16 px-6" aria-labelledby="topics-heading">
        <div className="max-w-5xl mx-auto">
          <h2
            id="topics-heading"
            className="text-xl text-[#1C1C1A] mb-7 text-center"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}
          >
            Explore by topic
          </h2>
          <div className="flex flex-wrap gap-2 justify-center">
            {['Climate & Environment', 'Healthcare', 'Economy & Jobs', 'Education', 'Housing', 'Immigration', 'Defense', 'Tech & Privacy', 'Voting Rights', 'Gun Policy'].map(t => (
              <a
                key={t}
                href="/bills"
                className="text-sm font-medium text-[#1C1C1A]/60 bg-white border border-[rgba(28,28,26,0.1)] px-4 py-2 rounded-full hover:border-[#9B7FA6]/50 hover:text-[#9B7FA6] transition-colors tracking-[0.01em]"
              >
                {t}
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 bg-[#9B7FA6]/[0.07] border-t border-[#9B7FA6]/15" aria-labelledby="bills-cta-heading">
        <div className="max-w-xl mx-auto text-center">
          <h2
            id="bills-cta-heading"
            className="text-3xl text-[#1C1C1A] mb-4"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Legislation shapes everyday life
          </h2>
          <p className="text-base text-[#1C1C1A]/55 mb-8 leading-relaxed">
            From healthcare costs to housing prices to climate policy — the bills moving through
            Congress today will affect you tomorrow. Stay ahead of it.
          </p>
          <button
            onClick={onSignUp}
            className="px-10 py-3.5 bg-[#9B7FA6] text-white rounded-xl text-sm font-medium hover:bg-[#8a6e95] transition-colors shadow-sm"
          >
            Create your free account
          </button>
        </div>
      </section>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function LandingPage() {
  const [tab, setTab] = useState<Tab>('representatives')
  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

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
            Beyond the Ballot
          </span>

          {/* Divider */}
          <div className="w-px h-5 bg-[rgba(28,28,26,0.15)]" />

          {/* Tab nav */}
          <nav className="flex gap-1 flex-1 h-full items-stretch" aria-label="Main navigation">
            {([
              { id: 'representatives', label: 'Know Your Representative' },
              { id: 'bills', label: 'Bills' },
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
              onClick={() => setShowSignIn(true)}
              className="text-sm text-[#1C1C1A]/60 hover:text-[#1C1C1A] transition-colors"
            >
              Sign in
            </button>
            <button
              onClick={() => setShowSignUp(true)}
              className="text-sm bg-[#9B7FA6] text-white px-4 py-2 rounded-lg hover:bg-[#8a6e95] transition-colors shadow-sm font-medium"
            >
              Sign up free
            </button>
          </div>
        </div>
      </header>

      {/* ── Tab content ── */}
      <main id="main-content">
        {tab === 'representatives'
          ? <RepresentativesTab onSignUp={() => setShowSignUp(true)} />
          : <BillsTab onSignUp={() => setShowSignUp(true)} />
        }
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-[rgba(28,28,26,0.1)] py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <span
            className="text-sm text-[#1C1C1A]/60"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            Beyond the Ballot
          </span>
          <p className="text-xs text-[#1C1C1A]/38">
            © 2026 Beyond the Ballot. Bringing transparency to democracy.
          </p>
        </div>
      </footer>

      {/* ── Auth modals ── */}
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
    </div>
  )
}
