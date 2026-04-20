'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { SignInModal } from '@/components/auth/SignInModal'
import { SignUpModal } from '@/components/auth/SignUpModal'
import { useAuth } from '@/hooks/useAuth'
import { useFollowPolitician } from '@/hooks/useFollowPolitician'
import { useFetchPoliticianDetail, type Politician } from '@/hooks/useFetchPoliticianDetail'
import type { DonorAlignment } from '@/hooks/useFetchPoliticianDetail'
import { DonorTab } from '@/components/representatives/DonorTab'
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { isFinalPassageVote } from '@/lib/votes'
import { formatBillId } from '@/lib/bills'
import { PageHeader } from '@/components/layout/PageHeader'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = 'votes' | 'bills' | 'donors'

// ─── Sub-components ───────────────────────────────────────────────────────────

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0]?.[0] ?? '?'
  return (
    <div className="w-24 h-24 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-2xl text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <Skeleton className="h-5 w-28" />
      <Card padding="none" className="p-6 sm:p-8">
        <div className="flex gap-6">
          <Skeleton className="w-24 h-24 rounded-full flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="w-24 h-9 rounded-lg flex-shrink-0" />
        </div>
      </Card>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <Card padding="none" className="h-64" />
        <Card padding="none" className="h-64" />
      </div>
    </div>
  )
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-[#1C1C1A]/40 mb-4">{message}</p>
        <Link
          href="/representatives"
          className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]"
        >
          ← Back to representatives
        </Link>
      </div>
    </div>
  )
}

function DonorAlignmentPanel({ alignments }: { alignments: DonorAlignment[] }) {
  const [open, setOpen] = useState(false)

  if (alignments.length === 0) return null

  return (
    <div className="mt-2 border border-[rgba(28,28,26,0.07)] rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-[#FAF8F5] hover:bg-[#F5F1EB] transition-colors"
      >
        <span className="text-xs text-[#1C1C1A]/50 font-medium flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
          Donor alignment · {alignments.length} connection{alignments.length !== 1 ? 's' : ''}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={`text-[#1C1C1A]/30 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-3 py-2 bg-white space-y-2.5">
          {alignments.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${a.voteAligns ? 'bg-[#6BAE7A]' : 'bg-[#D4924A]'}`} />
              <div className="min-w-0">
                <p className="text-xs text-[#1C1C1A]/70 leading-relaxed">
                  <span className="font-medium text-[#1C1C1A]">{a.donorName}</span>
                  {a.donorAmount != null && (
                    <span className="text-[#1C1C1A]/40 ml-1">(${a.donorAmount.toLocaleString()})</span>
                  )}
                  {' — '}{a.explanation}
                </p>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-[#1C1C1A]/30 pt-1 border-t border-[rgba(28,28,26,0.06)]">
            AI-generated from FEC data. Shows contribution patterns, not proven influence or intent.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function RepresentativeDetailPage({ id, initialPolitician }: { id: string; initialPolitician?: Politician | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const tabParam = searchParams.get('tab')
  const activeTab: Tab = tabParam === 'bills' || tabParam === 'donors' ? tabParam : 'votes'
  const setActiveTab = useCallback((tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'votes') params.delete('tab')
    else params.set('tab', tab)
    const qs = params.toString()
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false })
  }, [router, pathname, searchParams])
  const [voteFilter, setVoteFilter] = useState<'final' | 'all'>('final')
  const [voteLimits, setVoteLimits] = useState<{ final: number; all: number }>({ final: 10, all: 10 })
  const [photoError, setPhotoError] = useState(false)
  const [authModal, setAuthModal] = useState<'signin' | 'signup' | null>(null)

  const { user } = useAuth()
  const { politician, loading, error } = useFetchPoliticianDetail(id, initialPolitician)
  const { following, loading: followLoading, toggleFollow: handleFollow } = useFollowPolitician(
    id,
    user?.id ?? null,
    () => setAuthModal('signin'),
  )

  // Reset photo error when navigating to a different politician
  useEffect(() => {
    setPhotoError(false)
  }, [id])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'votes', label: 'Recent Votes' },
    { key: 'bills', label: 'Sponsored Bills' },
    { key: 'donors', label: 'Donor Profile' },
  ]

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-rep-detail" />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Politicians" />

        <main className="flex-1 px-6 pt-16 pb-8">
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <ErrorState
              message={error === 'Politician not found' ? 'Representative not found.' : 'Failed to load representative data.'}
            />
          ) : !politician ? null : (
            <div className="max-w-5xl mx-auto space-y-6">

              {/* Back link */}
              <Link
                href="/representatives"
                className="flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Back to representatives
              </Link>

              {/* Hero card */}
              <Card padding="none" className="p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  {politician.photo && !photoError
                    ? <Image src={politician.photo} alt={politician.name} width={96} height={96} className="rounded-full object-cover flex-shrink-0" onError={() => setPhotoError(true)} />
                    : <Initials name={politician.name} />
                  }

                  <div className="flex-1 text-center sm:text-left">
                    <h1
                      className="text-2xl sm:text-3xl text-[#1C1C1A] mb-1 leading-[1.15] tracking-[-0.01em]"
                      style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
                    >
                      {politician.name}
                    </h1>
                    <p className="text-base text-[#1C1C1A]/60 mb-3">{politician.title}</p>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start mb-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PARTY_STYLES[politician.party].bg} ${PARTY_STYLES[politician.party].text}`}>
                        {politician.party}
                      </span>
                      <span className="text-xs text-[#1C1C1A]/40">·</span>
                      <span className="text-xs text-[#1C1C1A]/50">{politician.state}</span>
                      {politician.district && (
                        <>
                          <span className="text-xs text-[#1C1C1A]/40">·</span>
                          <span className="text-xs text-[#1C1C1A]/50">{politician.district}</span>
                        </>
                      )}
                      {politician.since && (
                        <>
                          <span className="text-xs text-[#1C1C1A]/40">·</span>
                          <span className="text-xs text-[#1C1C1A]/40">Since {politician.since}</span>
                        </>
                      )}
                    </div>

                    {/* Contact info */}
                    <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
                      {politician.website && (
                        <a
                          href={politician.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-[#7B5E8A] hover:text-[#6A4F78] transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                          </svg>
                          Official website
                        </a>
                      )}
                      {politician.phone && (
                        <a
                          href={`tel:${politician.phone}`}
                          className="flex items-center gap-1.5 text-xs text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                          </svg>
                          {politician.phone}
                        </a>
                      )}
                      {politician.address && (
                        <span className="flex items-center gap-1.5 text-xs text-[#1C1C1A]/40">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {politician.address}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Follow button */}
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`flex-shrink-0 px-6 py-2.5 rounded-lg text-sm border transition-colors disabled:opacity-60 ${
                      following
                        ? 'bg-[#7B5E8A] border-[#7B5E8A] text-white'
                        : 'bg-transparent border-[#7B5E8A] text-[#7B5E8A] hover:bg-[#7B5E8A] hover:text-white'
                    }`}
                  >
                    {following ? 'Following ✓' : 'Follow'}
                  </button>
                </div>
              </Card>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

                {/* Tab panel */}
                <Card padding="none" className="overflow-hidden">
                  <div className="flex border-b border-[rgba(28,28,26,0.08)]" role="tablist">
                    {tabs.map(tab => (
                      <button
                        key={tab.key}
                        role="tab"
                        aria-selected={activeTab === tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                          activeTab === tab.key
                            ? 'border-[#7B5E8A] text-[#1C1C1A]'
                            : 'border-transparent text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="divide-y divide-[rgba(28,28,26,0.06)]">

                    {/* Votes */}
                    {activeTab === 'votes' && (() => {
                      const allVotes = politician.votes ?? []
                      const totalCount = allVotes.length
                      const filteredVotes = voteFilter === 'all'
                        ? allVotes
                        : allVotes.filter(v => isFinalPassageVote(v.question))
                      return (
                        <>
                          {totalCount > 0 && (
                            <div className="px-6 pt-4 pb-3 flex items-center justify-center gap-3">
                              <span className="text-[10px] uppercase tracking-[0.14em] text-[#1C1C1A]/38 font-medium select-none">
                                Filter
                              </span>
                              <div
                                role="tablist"
                                aria-label="Filter votes"
                                className="flex items-center gap-1"
                              >
                                {(['final', 'all'] as const).map(f => {
                                  const active = voteFilter === f
                                  return (
                                    <button
                                      key={f}
                                      role="tab"
                                      aria-selected={active}
                                      onClick={() => setVoteFilter(f)}
                                      className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                                        active
                                          ? 'bg-[#7B5E8A]/10 text-[#7B5E8A] border-[#7B5E8A]/20'
                                          : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 border-transparent'
                                      }`}
                                    >
                                      {f === 'final' ? 'Final' : 'All'}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {filteredVotes.length === 0 ? (
                            <p className="px-6 py-8 text-sm text-[#1C1C1A]/40 text-center">
                              {voteFilter === 'final' ? 'No final passage votes found.' : 'No recent votes found.'}
                            </p>
                          ) : (() => {
                            const limit = voteLimits[voteFilter]
                            const visibleVotes = filteredVotes.slice(0, limit)
                            const hasMore = filteredVotes.length > limit
                            const remaining = filteredVotes.length - limit
                            return (
                              <>
                                {visibleVotes.map(v => {
                                  const question = v.question?.replace(/^On /i, '') ?? ''
                                  const displayTitle = v.billTitle
                                    ? `${question}: ${v.billTitle}`
                                    : v.billId ? `${question}: ${formatBillId(v.billId)}` : v.bill
                                  return (
                                    <div key={v.id} className="px-6 py-4">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          {v.billId ? (
                                            <Link
                                              href={`/bills/${v.billId}?from=/representatives/${id}`}
                                              className="text-sm text-[#1C1C1A] hover:text-[#7B5E8A] hover:underline transition-colors"
                                            >
                                              {displayTitle}
                                            </Link>
                                          ) : (
                                            <p className="text-sm text-[#1C1C1A]">{displayTitle}</p>
                                          )}
                                          <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{v.date}</p>
                                        </div>
                                        <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ml-4 ${
                                          v.vote === 'Yea' ? 'bg-[#68B085]/[0.12] text-[#68B085]' : 'bg-[#B85C38]/[0.12] text-[#B85C38]'
                                        }`}>
                                          {v.vote}
                                        </span>
                                      </div>
                                      {(v.donorAlignments?.length ?? 0) > 0 && (
                                        <DonorAlignmentPanel alignments={v.donorAlignments} />
                                      )}
                                    </div>
                                  )
                                })}
                                {hasMore && (
                                  <div className="px-6 py-4 flex justify-center">
                                    <button
                                      onClick={() =>
                                        setVoteLimits(prev => ({ ...prev, [voteFilter]: prev[voteFilter] + 10 }))
                                      }
                                      className="text-xs font-medium text-[#7B5E8A] hover:text-[#6A4F78] border border-[#7B5E8A]/30 rounded-lg px-4 py-2 hover:bg-[#7B5E8A]/5 transition-colors"
                                    >
                                      Load {Math.min(10, remaining)} more
                                    </button>
                                  </div>
                                )}
                              </>
                            )
                          })()}
                        </>
                      )
                    })()}

                    {/* Bills */}
                    {activeTab === 'bills' && (
                      (politician.bills?.length ?? 0) === 0 ? (
                        <p className="px-6 py-8 text-sm text-[#1C1C1A]/40 text-center">No sponsored bills found.</p>
                      ) : politician.bills.map(b => (
                        <Link key={b.id} href={`/bills/${b.id}?from=/representatives/${id}`} className="flex items-center justify-between px-6 py-4 hover:bg-[#F5F0E8]/60 transition-colors">
                          <div className="min-w-0 flex-1 mr-4">
                            <p className="text-sm text-[#1C1C1A] hover:text-[#7B5E8A] transition-colors line-clamp-2" title={b.name}>{b.name}</p>
                            <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{b.number} · {b.date}</p>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${(STATUS_STYLES[b.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Committee).bg} ${(STATUS_STYLES[b.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Committee).text}`}>
                            {b.status}
                          </span>
                        </Link>
                      ))
                    )}

                    {/* Donors */}
                    {activeTab === 'donors' && (
                      <DonorTab
                        pacDonors={politician.pacDonors ?? []}
                        topContributors={politician.topContributors ?? []}
                        fundingBreakdown={politician.fundingBreakdown}
                        fecUrl={politician.fecUrl}
                      />
                    )}
                  </div>
                </Card>

                {/* Sidebar */}
                <div className="space-y-4">

                  {/* Stats */}
                  <Card className="flex flex-col gap-6">
                    <div>
                      <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-1">Years in Office</p>
                      <p className="text-3xl font-medium text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                        {politician.stats.yearsInOffice}
                      </p>
                    </div>

                    {politician.stats.attendance !== null && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide">Attendance Rate</p>
                          <p className="text-sm font-medium text-[#1C1C1A]">{politician.stats.attendance}%</p>
                        </div>
                        <div className="h-1.5 bg-[#E8E3DA] rounded-full overflow-hidden">
                          <div className="h-full bg-[#7B5E8A] rounded-full" style={{ width: `${politician.stats.attendance}%` }} />
                        </div>
                      </div>
                    )}

                    {politician.stats.ideologyScore !== null && (
                      <div>
                        <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-3 flex items-center gap-1">
                          Ideology Score
                          <InfoTooltip
                            label="About the ideology score"
                            content={
                              <>
                                <p className="text-[11px] font-semibold text-[#1C1C1A] mb-0.5">DW-NOMINATE</p>
                                Score from roll-call votes: <span className="font-mono">−1</span> (most progressive) to <span className="font-mono">+1</span> (most conservative).
                                {' '}
                                <a href="https://voteview.com/about" target="_blank" rel="noopener noreferrer" className="text-[#7B5E8A] hover:underline">Source: VoteView</a>
                              </>
                            }
                          />
                        </p>
                        <div className="relative h-1.5 bg-gradient-to-r from-[#5E85A8] to-[#A87B7B] rounded-full mb-2">
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#7B5E8A] rounded-full shadow-sm"
                            style={{ left: `calc(${((politician.stats.ideologyScore + 1) / 2) * 100}% - 6px)` }}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#5E85A8]">Progressive</span>
                          <span className="text-xs text-[#A87B7B]">Conservative</span>
                        </div>
                      </div>
                    )}

                    {politician.nextElectionYear && (
                      <div>
                        <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-1">Next Election</p>
                        <p className="text-2xl font-medium text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                          {politician.nextElectionYear}
                        </p>
                      </div>
                    )}
                  </Card>

                  {/* Committees */}
                  {politician.committees.length > 0 && (
                    <Card>
                      <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-3">Committees</p>
                      <ul className="space-y-2">
                        {politician.committees.map((c, i) => (
                          <li key={i} className="flex flex-col gap-0.5">
                            {c.url ? (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[#1C1C1A] hover:text-[#7B5E8A] transition-colors leading-snug"
                              >
                                {c.name}
                              </a>
                            ) : (
                              <span className="text-sm text-[#1C1C1A] leading-snug">{c.name}</span>
                            )}
                            {c.title && (
                              <span className="text-xs text-[#1C1C1A]/40">{c.title}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </Card>
                  )}
                </div>

              </div>
            </div>
          )}
        </main>
      </div>

      <SignInModal
        isOpen={authModal === 'signin'}
        onClose={() => setAuthModal(null)}
        onSwitchToSignUp={() => setAuthModal('signup')}
      />
      <SignUpModal
        isOpen={authModal === 'signup'}
        onClose={() => setAuthModal(null)}
        onSwitchToSignIn={() => setAuthModal('signin')}
      />
    </div>
  )
}
