'use client'

import { useState } from 'react'
import Link from 'next/link'

type Party = 'Democrat' | 'Republican' | 'Independent'
type BillStatus = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'

const PARTY_STYLES: Record<Party, { bg: string; text: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
}

const STATUS_STYLES: Record<BillStatus, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
}

const MOCK_FOLLOWING = [
  {
    id: '1',
    name: 'Margaret Chen',
    title: 'U.S. Senator',
    party: 'Democrat' as Party,
    state: 'California',
    latestVote: { bill: 'Infrastructure Investment Act', date: 'Mar 15, 2025', vote: 'Yea' as const },
    alert: false,
  },
  {
    id: '2',
    name: 'Robert Harmon',
    title: 'U.S. Senator',
    party: 'Republican' as Party,
    state: 'California',
    latestVote: { bill: 'Defense Appropriations Act', date: 'Feb 10, 2025', vote: 'Yea' as const },
    alert: false,
  },
  {
    id: '3',
    name: 'Diana Reyes',
    title: 'U.S. Representative',
    party: 'Democrat' as Party,
    state: 'California',
    latestVote: { bill: 'Digital Privacy Protection Act', date: 'Jan 22, 2025', vote: 'Nay' as const },
    alert: true,
  },
]

const MOCK_ACTIVITY = [
  {
    id: 'a1',
    politician: 'Sen. Margaret Chen',
    action: 'voted Yea on',
    subject: 'Infrastructure Investment Act',
    date: 'Mar 15, 2025',
    isAlert: false,
  },
  {
    id: 'a2',
    politician: null,
    action: 'Status updated to Active —',
    subject: 'Clean Energy Transition Act (S. 1247)',
    date: 'Mar 18, 2025',
    isAlert: false,
  },
  {
    id: 'a3',
    politician: 'Rep. Diana Reyes',
    action: 'voted Nay on',
    subject: 'Digital Privacy Protection Act',
    date: 'Jan 22, 2025',
    isAlert: true,
  },
  {
    id: 'a4',
    politician: null,
    action: 'Passed committee —',
    subject: 'Universal Pre-K Funding Act (H.R. 4401)',
    date: 'Mar 5, 2025',
    isAlert: false,
  },
  {
    id: 'a5',
    politician: 'Sen. Robert Harmon',
    action: 'voted Yea on',
    subject: 'Defense Appropriations Act',
    date: 'Feb 10, 2025',
    isAlert: false,
  },
  {
    id: 'a6',
    politician: null,
    action: 'Stalled in committee —',
    subject: 'Affordable Housing Development Act (S. 892)',
    date: 'Jan 30, 2025',
    isAlert: true,
  },
]

const MOCK_TRACKED_BILLS = [
  { id: 'tb1', number: 'S. 1247',  title: 'Clean Energy Transition Act',         status: 'Active' as BillStatus,    lastAction: 'Mar 18, 2025', category: 'Environment' },
  { id: 'tb2', number: 'H.R. 4401', title: 'Universal Pre-K Funding Act',          status: 'Committee' as BillStatus, lastAction: 'Mar 5, 2025',  category: 'Education'   },
  { id: 'tb3', number: 'S. 892',   title: 'Affordable Housing Development Act',   status: 'Stalled' as BillStatus,   lastAction: 'Jan 30, 2025', category: 'Housing'     },
  { id: 'tb4', number: 'H.R. 3892', title: 'Small Business Tax Relief Act',        status: 'Committee' as BillStatus, lastAction: 'Mar 12, 2025', category: 'Economy'     },
]

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0][0]
  return (
    <div className="w-11 h-11 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-sm text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

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

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  )
}

function IconBell() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}

export default function DashboardPage() {
  const [notifCount, setNotifCount] = useState(3)

  const navItems = [
    { label: 'Dashboard',       href: '/dashboard',       icon: <IconHome />,     active: true  },
    { label: 'Representatives', href: '/representatives', icon: <IconUsers />,    active: false },
    { label: 'Bills',           href: '/bills',           icon: <IconFileText />, active: false },
    { label: 'Settings',        href: '#',                icon: <IconSettings />, active: false },
  ]

  return (
    <div className="flex min-h-screen bg-[#F5F0E8]">

      {/* ── Left sidebar ── */}
      <aside className="fixed top-0 left-0 h-full w-58 flex flex-col bg-[#EAE5DB] border-r border-[#D6CFC4] z-20" style={{ width: '228px' }}>

        {/* Brand */}
        <div className="px-5 py-5 border-b border-[#D6CFC4]">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#9B7FA6] rounded flex items-center justify-center flex-shrink-0">
              <span className="text-white font-bold text-xs">BB</span>
            </div>
            <span className="text-sm font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
              Beyond the Ballot
            </span>
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-0.5">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                item.active
                  ? 'bg-[#9B7FA6]/[0.12] text-[#9B7FA6] font-medium'
                  : 'text-[#1C1C1A]/55 hover:text-[#1C1C1A] hover:bg-[#D6CFC4]/50'
              }`}
            >
              <span className={item.active ? 'text-[#9B7FA6]' : 'text-[#1C1C1A]/35'}>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Following summary */}
        <div className="px-5 py-5 border-t border-[#D6CFC4]">
          <p className="text-[10px] text-[#1C1C1A]/40 uppercase tracking-widest mb-2">Activity</p>
          <div className="flex flex-col gap-1">
            <p className="text-xs text-[#1C1C1A]/60">
              <span className="text-[#9B7FA6] font-semibold">{MOCK_FOLLOWING.length}</span> politicians followed
            </p>
            <p className="text-xs text-[#1C1C1A]/60">
              <span className="text-[#9B7FA6] font-semibold">{MOCK_TRACKED_BILLS.length}</span> bills tracked
            </p>
          </div>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-h-screen" style={{ marginLeft: '228px' }}>

        {/* Top bar */}
        <header className="sticky top-0 z-10 bg-[#F5F0E8]/90 backdrop-blur-sm border-b border-[rgba(28,28,26,0.08)] px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Dashboard</h1>
            <p className="text-[11px] text-[#1C1C1A]/38 mt-0.5">Friday, April 4, 2026</p>
          </div>

          <div className="flex items-center gap-5">
            {/* Notification bell */}
            <button
              onClick={() => setNotifCount(0)}
              className="relative text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 transition-colors"
              aria-label="Notifications"
            >
              <IconBell />
              {notifCount > 0 && (
                <span className="absolute -top-1 -right-1 w-[17px] h-[17px] bg-[#B85C38] text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {notifCount}
                </span>
              )}
            </button>

            {/* User avatar */}
            <div className="flex items-center gap-2.5 cursor-pointer group">
              <div className="w-8 h-8 rounded-full bg-[#9B7FA6]/20 border border-[#9B7FA6]/30 flex items-center justify-center">
                <span className="text-xs font-semibold text-[#9B7FA6]" style={{ fontFamily: 'var(--font-serif)' }}>JD</span>
              </div>
              <span className="text-sm text-[#1C1C1A]/60 group-hover:text-[#1C1C1A] transition-colors">Jane Doe</span>
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 px-8 py-8">
          <div className="max-w-5xl">

            {/* ── Following politicians ── */}
            <section className="mb-10">
              <div className="flex items-baseline gap-2.5 mb-5">
                <h2 className="text-base text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Following</h2>
                <span className="text-sm text-[#1C1C1A]/38">{MOCK_FOLLOWING.length} politicians</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {MOCK_FOLLOWING.map((pol) => {
                  const badge = PARTY_STYLES[pol.party]
                  return (
                    <Link key={pol.id} href={`/representatives/${pol.id}`} className="group">
                      <div className="bg-white rounded-xl border border-[#D6CFC4] p-5 flex flex-col gap-4 hover:shadow-sm transition-shadow h-full">

                        {/* Header */}
                        <div className="flex items-start gap-3">
                          <Initials name={pol.name} />
                          <div className="flex-1 min-w-0">
                            <p
                              className="text-sm font-medium text-[#1C1C1A] truncate group-hover:text-[#9B7FA6] transition-colors"
                              style={{ fontFamily: 'var(--font-serif)' }}
                            >
                              {pol.name}
                            </p>
                            <p className="text-xs text-[#1C1C1A]/50 truncate mt-0.5">{pol.title}</p>
                            <p className="text-xs text-[#1C1C1A]/38">{pol.state}</p>
                          </div>
                          {pol.alert && (
                            <div className="w-2 h-2 rounded-full bg-[#B85C38] flex-shrink-0 mt-1.5" title="New activity" />
                          )}
                        </div>

                        {/* Party */}
                        <span className={`self-start text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                          {pol.party}
                        </span>

                        {/* Latest vote */}
                        <div className="border-t border-[rgba(28,28,26,0.06)] pt-3.5">
                          <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-2">Latest vote</p>
                          <div className="flex items-start gap-2">
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 leading-tight ${
                              pol.latestVote.vote === 'Yea'
                                ? 'bg-[#9B7FA6]/[0.12] text-[#9B7FA6]'
                                : 'bg-[#B85C38]/[0.12] text-[#B85C38]'
                            }`}>
                              {pol.latestVote.vote}
                            </span>
                            <p className="text-xs text-[#1C1C1A]/65 leading-snug">{pol.latestVote.bill}</p>
                          </div>
                          <p className="text-[11px] text-[#1C1C1A]/32 mt-2">{pol.latestVote.date}</p>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>

            {/* ── Lower two-column ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_288px] gap-6">

              {/* Activity feed */}
              <section>
                <div className="flex items-baseline gap-2.5 mb-5">
                  <h2 className="text-base text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Activity</h2>
                  <span className="text-sm text-[#1C1C1A]/38">Recent updates</span>
                </div>

                <div className="bg-white rounded-xl border border-[#D6CFC4] overflow-hidden">
                  {MOCK_ACTIVITY.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-4 px-6 py-4 ${
                        idx < MOCK_ACTIVITY.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''
                      }`}
                    >
                      {/* Dot */}
                      <div className={`w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0 ${item.isAlert ? 'bg-[#B85C38]' : 'bg-[#9B7FA6]/50'}`} />

                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#1C1C1A]/70 leading-snug">
                          {item.politician && (
                            <span className="text-[#1C1C1A] font-medium">{item.politician} </span>
                          )}
                          <span className="text-[#1C1C1A]/45">{item.action} </span>
                          <span className="text-[#1C1C1A]/80">{item.subject}</span>
                        </p>
                      </div>

                      <span className="text-[11px] text-[#1C1C1A]/32 flex-shrink-0 mt-0.5 whitespace-nowrap">{item.date}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* Tracked bills */}
              <section>
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-base text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Tracked Bills</h2>
                    <span className="text-sm text-[#1C1C1A]/38">{MOCK_TRACKED_BILLS.length}</span>
                  </div>
                  <Link href="/bills" className="text-xs text-[#9B7FA6] hover:underline underline-offset-2">View all</Link>
                </div>

                <div className="bg-white rounded-xl border border-[#D6CFC4] overflow-hidden">
                  {MOCK_TRACKED_BILLS.map((bill, idx) => {
                    const s = STATUS_STYLES[bill.status]
                    return (
                      <div
                        key={bill.id}
                        className={`px-5 py-4 ${idx < MOCK_TRACKED_BILLS.length - 1 ? 'border-b border-[rgba(28,28,26,0.05)]' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-[11px] font-mono text-[#1C1C1A]/38">{bill.number}</span>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                            {bill.status}
                          </span>
                        </div>
                        <p className="text-sm text-[#1C1C1A] leading-snug mb-2.5" style={{ fontFamily: 'var(--font-serif)' }}>
                          {bill.title}
                        </p>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-[#1C1C1A]/40">{bill.category}</span>
                          <span className="text-[11px] text-[#1C1C1A]/30">{bill.lastAction}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
