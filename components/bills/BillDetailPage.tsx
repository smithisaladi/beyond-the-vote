'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { SignInModal } from '@/components/auth/SignInModal'
import { SignUpModal } from '@/components/auth/SignUpModal'
import { useAuth } from '@/hooks/useAuth'
import { useTrackedBills } from '@/hooks/useTrackedBills'
import { useFetchBillDetail } from '@/hooks/useFetchBillDetail'
import type { BillDetailStatus } from '@/hooks/useFetchBillDetail'

// ─── Types ────────────────────────────────────────────────────────────────────

type Status = BillDetailStatus

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<Status, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.15]', text: 'text-[#B85C38]' },
}

const PARTY_COLORS: Record<string, string> = {
  D: 'text-[#7B8FA8]',
  R: 'text-[#A87B7B]',
  I: 'text-[#8A8A7A]',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
    >
      <defs>
        <pattern id="topo-bill-detail" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
          <ellipse cx="400" cy="300" rx="380" ry="260" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="400" cy="300" rx="320" ry="210" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="405" cy="295" rx="260" ry="165" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="410" cy="290" rx="205" ry="125" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="415" cy="285" rx="155" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="418" cy="282" rx="110" ry="62"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="110" cy="500" rx="140" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="115" cy="496" rx="95"  ry="58"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="700" cy="90"  rx="160" ry="100" fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="704" cy="87"  rx="110" ry="65"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="707" cy="85"  rx="65"  ry="38"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo-bill-detail)" />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? '#9B7FA6' : 'none'} stroke="#9B7FA6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}

function DetailSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
      <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 sm:p-8 space-y-4">
        <div className="flex gap-3">
          <div className="h-5 w-20 bg-[#E8E3DA] rounded-full" />
          <div className="h-5 w-16 bg-[#E8E3DA] rounded-full" />
        </div>
        <div className="h-8 bg-[#E8E3DA] rounded w-3/4" />
        <div className="h-4 bg-[#E8E3DA] rounded w-1/4" />
      </div>
      <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-32" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-40" />
          <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-48" />
        </div>
        <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 h-64" />
      </div>
    </div>
  )
}

function PartyTag({ party }: { party: string }) {
  const labels: Record<string, string> = { D: 'Democrat', R: 'Republican', I: 'Independent' }
  const colors: Record<string, { bg: string; text: string }> = {
    D: { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' },
    R: { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' },
    I: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  }
  const style = colors[party] ?? colors['I']
  const label = labels[party] ?? party
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      {label}
    </span>
  )
}

function VoteBar({ yeas, nays }: { yeas: number; nays: number }) {
  const total = yeas + nays
  if (total === 0) return null
  const yeaPct = Math.round((yeas / total) * 100)
  const nayPct = 100 - yeaPct
  return (
    <div className="space-y-1.5">
      <div className="flex h-2 rounded-full overflow-hidden bg-[#E8E3DA]">
        <div className="bg-[#6A9B7B] transition-all" style={{ width: `${yeaPct}%` }} />
        <div className="bg-[#B85C38] transition-all" style={{ width: `${nayPct}%` }} />
      </div>
      <div className="flex justify-between text-xs text-[#1C1C1A]/50">
        <span className="text-[#6A9B7B] font-medium">{yeas} Yea</span>
        <span className="text-[#B85C38] font-medium">{nays} Nay</span>
      </div>
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BillDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)
  const [showAllCosponsors, setShowAllCosponsors] = useState(false)

  const { user } = useAuth()
  const { bill, loading, error } = useFetchBillDetail(id)
  const { trackedBills, toggleTrack } = useTrackedBills(user?.id ?? null)
  const tracked = trackedBills.has(id)

  const handleTrack = () => {
    if (!user) {
      setShowSignIn(true)
      return
    }
    toggleTrack(id)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  const formatShortDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="relative flex flex-col overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">

        <main className="flex-1 px-6 py-10">
          {loading ? (
            <DetailSkeleton />
          ) : error ? (
            <div className="max-w-5xl mx-auto">
              <div className="flex-1 flex items-center justify-center py-24">
                <div className="text-center">
                  <p className="text-[#1C1C1A]/40 mb-4">
                    {error === 'Bill not found' ? 'This bill could not be found.' : 'Failed to load bill details.'}
                  </p>
                  <button
                    onClick={() => router.back()}
                    className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
                  >
                    ← Back to bills
                  </button>
                </div>
              </div>
            </div>
          ) : !bill ? null : (
            <div className="max-w-5xl mx-auto space-y-6">

              {/* Back link */}
              <Link
                href="/bills"
                className="inline-flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Bills
              </Link>

              {/* Header card */}
              <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Meta row */}
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="text-xs font-mono text-[#1C1C1A]/40 tracking-wide">{bill.number}</span>
                      <span className="text-xs text-[#1C1C1A]/20">·</span>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${STATUS_STYLES[bill.status].bg} ${STATUS_STYLES[bill.status].text}`}>
                        {bill.status}
                      </span>
                      {bill.policyArea && (
                        <>
                          <span className="text-xs text-[#1C1C1A]/20">·</span>
                          <span className="text-xs text-[#1C1C1A]/40">{bill.policyArea}</span>
                        </>
                      )}
                    </div>

                    {/* Title */}
                    <h1
                      className="text-2xl sm:text-3xl text-[#1C1C1A] leading-snug mb-3 tracking-tight"
                      style={{ fontFamily: 'var(--font-serif)' }}
                    >
                      {bill.title}
                    </h1>

                    {/* Introduced date */}
                    {bill.introducedDate && (
                      <p className="text-sm text-[#1C1C1A]/45">
                        Introduced {formatDate(bill.introducedDate)}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a
                      href={bill.congressGovUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-[#1C1C1A]/50 hover:text-[#1C1C1A] border border-[rgba(28,28,26,0.15)] rounded-lg px-3 py-2 hover:border-[rgba(28,28,26,0.3)] transition-colors"
                    >
                      Congress.gov
                      <ExternalLinkIcon />
                    </a>
                    <button
                      onClick={handleTrack}
                      disabled={false}
                      aria-label={tracked ? 'Stop tracking this bill' : 'Track this bill'}
                      className={`inline-flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 transition-colors ${
                        tracked
                          ? 'bg-[#9B7FA6]/10 text-[#9B7FA6] hover:bg-[#9B7FA6]/15'
                          : 'border border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/60 hover:border-[#9B7FA6]/40 hover:text-[#9B7FA6]'
                      }`}
                    >
                      <BookmarkIcon filled={tracked} />
                      {tracked ? 'Tracking' : 'Track'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {bill.summary && (
                <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 sm:p-8">
                  <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-3">Summary</h2>
                  <p className="text-sm text-[#1C1C1A]/75 leading-relaxed">{bill.summary}</p>
                </div>
              )}

              {/* Main grid */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

                {/* Left column */}
                <div className="space-y-6">

                  {/* Sponsor */}
                  {bill.sponsor && (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6">
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">Sponsor</h2>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[#1C1C1A]">{bill.sponsor.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <PartyTag party={bill.sponsor.party} />
                            <span className="text-xs text-[#1C1C1A]/45">
                              {bill.sponsor.state}
                              {bill.sponsor.district ? `, District ${bill.sponsor.district}` : ''}
                            </span>
                          </div>
                        </div>
                        <Link
                          href={`/representatives/${bill.sponsor.bioguideId}`}
                          className="text-xs text-[#9B7FA6] hover:text-[#8a6e95] transition-colors"
                        >
                          View profile →
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Co-sponsors */}
                  {bill.cosponsors.length > 0 && (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6">
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">
                        Co-sponsors
                        <span className="ml-1.5 text-[#1C1C1A]/30 normal-case tracking-normal font-normal">
                          ({bill.cosponsors.length})
                        </span>
                      </h2>
                      <div className="divide-y divide-[rgba(28,28,26,0.06)]">
                        {(showAllCosponsors ? bill.cosponsors : bill.cosponsors.slice(0, 5)).map(c => (
                          <div key={c.bioguideId} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                            <div>
                              <p className="text-sm text-[#1C1C1A]">{c.name}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className={`text-xs ${PARTY_COLORS[c.party] ?? 'text-[#8A8A7A]'}`}>
                                  {c.party === 'D' ? 'Democrat' : c.party === 'R' ? 'Republican' : 'Independent'}
                                </span>
                                <span className="text-xs text-[#1C1C1A]/30">·</span>
                                <span className="text-xs text-[#1C1C1A]/45">{c.state}</span>
                              </div>
                            </div>
                            <Link
                              href={`/representatives/${c.bioguideId}`}
                              className="text-xs text-[#9B7FA6]/60 hover:text-[#9B7FA6] transition-colors"
                            >
                              →
                            </Link>
                          </div>
                        ))}
                      </div>
                      {bill.cosponsors.length > 5 && (
                        <button
                          onClick={() => setShowAllCosponsors(v => !v)}
                          className="mt-3 text-xs text-[#9B7FA6] hover:text-[#8a6e95]"
                        >
                          {showAllCosponsors ? 'Show fewer' : `Show all ${bill.cosponsors.length}`}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Subjects */}
                  {bill.subjects.length > 0 && (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6">
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-3">Legislative Subjects</h2>
                      <div className="flex flex-wrap gap-2">
                        {bill.subjects.map(subject => (
                          <span
                            key={subject}
                            className="text-xs text-[#1C1C1A]/55 bg-[#F0EBE2] px-2.5 py-1 rounded-full"
                          >
                            {subject}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right column */}
                <div className="space-y-6">

                  {/* Votes */}
                  {bill.votes.length > 0 && (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6">
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">Vote Breakdown</h2>
                      <div className="space-y-5">
                        {bill.votes.map((vote, i) => (
                          <div key={i}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-medium text-[#1C1C1A]/60">{vote.chamber}</span>
                              <span className="text-xs text-[#1C1C1A]/35">{formatShortDate(vote.date)}</span>
                            </div>
                            {vote.yeas !== null && vote.nays !== null ? (
                              <VoteBar yeas={vote.yeas} nays={vote.nays} />
                            ) : (
                              <p className="text-xs text-[#1C1C1A]/30">Vote data unavailable</p>
                            )}
                            {vote.url && (
                              <a
                                href={vote.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[#9B7FA6]/70 hover:text-[#9B7FA6] mt-2 transition-colors"
                              >
                                Full record <ExternalLinkIcon />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status timeline */}
                  {bill.actions.length > 0 && (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6">
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">Timeline</h2>
                      <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[rgba(28,28,26,0.08)]" />
                        <div className="space-y-4">
                          {bill.actions.map((action, i) => (
                            <div key={i} className="flex gap-4 pl-5 relative">
                              {/* Dot */}
                              <div className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#9B7FA6]/40 bg-[#F5F0E8]" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-[#1C1C1A]/35 mb-0.5">{formatShortDate(action.date)}</p>
                                <p className="text-xs text-[#1C1C1A]/65 leading-snug">{action.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </main>
      </div>

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
