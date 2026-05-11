

import { useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useAuth } from '@/components/auth/AuthContext'
import { useTrackedBills } from '@/hooks/queries/useDashboard'
import { useBillDetail } from '@/hooks/queries/useBills'
// TODO: define BillDetail type properly
type BillDetail = any
import { PARTY_STYLES, STATUS_STYLES, getPartyStyle } from '@/lib/ui'
import { slugToTopic } from '@/lib/topics'
import { formatDate, formatShortDate } from '@/lib/format'
import { PartyBadge } from '@/components/shared/PartyBadge'
import BillVoteTally from '@/components/bills/BillVoteTally'
import { PageHeader } from '@/components/layout/PageHeader'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

// ─── Sub-components ───────────────────────────────────────────────────────────

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? '#7B5E8A' : 'none'} stroke="#7B5E8A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <Skeleton className="h-5 w-28" />
      <Card padding="none" className="p-6 sm:p-8 space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/4" />
      </Card>
      <Card className="h-32" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        <div className="space-y-6">
          <Card className="h-40" />
          <Card className="h-48" />
        </div>
        <Card className="h-64" />
      </div>
    </div>
  )
}

function PartyTag({ party }: { party: string }) {
  const style = getPartyStyle(party)
  return (
    <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  )
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function BillDetailPage({ id, initialBill }: { id: string; initialBill?: BillDetail | null }) {
  const searchParams = useSearch({ strict: false }) as Record<string, string>
  const fromParam = searchParams['from'] ?? null
  // If navigated from a rep page, back goes there; otherwise back to /bills
  const backHref = fromParam?.startsWith('/representatives/') ? fromParam : '/bills'
  const backLabel = fromParam?.startsWith('/representatives/') ? 'Back to representative' : 'Back to bills'

  const { openSignIn } = useAuthModal()
  const [showAllCosponsors, setShowAllCosponsors] = useState(false)

  const { user } = useAuth()
  const { data: bill, isLoading: loading, error: _billError } = useBillDetail(id)
  const error = _billError ? String(_billError) : null
  // TODO: useTrackedBills returns different shape from React Query
  const { data: _trackedData } = useTrackedBills()
  const trackedBills = new Set<string>()
  const toggleTrack = (_billId: string) => {}
  const tracked = trackedBills.has(id)

  const handleTrack = () => {
    if (!user) {
      openSignIn()
      return
    }
    toggleTrack(id)
  }

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-bill-detail" />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Bills Tracker" />

        <main className="flex-1 px-6 pt-16 pb-8">
          {loading ? (
            <DetailSkeleton />
          ) : error ? (
            <div className="max-w-4xl mx-auto">
              <div className="flex-1 flex items-center justify-center py-24">
                <div className="text-center">
                  <p className="text-[#1C1C1A]/40 mb-4">
                    {error === 'Bill not found' ? 'This bill could not be found.' : 'Failed to load bill details.'}
                  </p>
                  <Link
                    href={backHref}
                    className="text-sm text-[#7B5E8A] hover:text-[#6A4F78]"
                  >
                    ← {backLabel}
                  </Link>
                </div>
              </div>
            </div>
          ) : !bill ? null : (
            <div className="max-w-4xl mx-auto space-y-6">

              {/* Back link */}
              <Link
                href={backHref}
                className="inline-flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                {backLabel}
              </Link>

              {/* Header card */}
              <Card padding="none" className="p-6 sm:p-8">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Meta row */}
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <span className="text-xs font-mono text-[#1C1C1A]/40 tracking-wide">{bill.number}</span>
                      <span className="text-xs text-[#1C1C1A]/20">·</span>
                      <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${(STATUS_STYLES[bill.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Active).bg} ${(STATUS_STYLES[bill.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Active).text}`}>
                        {bill.status}
                      </span>
                      {bill.topics.length > 0 && (
                        <>
                          <span className="text-xs text-[#1C1C1A]/20">·</span>
                          <span className="text-xs font-medium text-[#7B5E8A] bg-[#7B5E8A]/[0.12] px-2.5 py-0.5 rounded-full">
                            {slugToTopic(bill.topics[0]) ?? bill.topics[0]}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Title */}
                    <h1
                      className="text-2xl sm:text-3xl text-[#1C1C1A] leading-[1.2] mb-3 tracking-tight"
                      style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
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
                          ? 'bg-[#7B5E8A]/10 text-[#7B5E8A] hover:bg-[#7B5E8A]/15'
                          : 'border border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/60 hover:border-[#7B5E8A]/40 hover:text-[#7B5E8A]'
                      }`}
                    >
                      <BookmarkIcon filled={tracked} />
                      {tracked ? 'Tracking' : 'Track'}
                    </button>
                  </div>
                </div>
              </Card>

              {/* Summary */}
              {bill.summary && (
                <Card padding="none" className="p-6 sm:p-8">
                  <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-3">Summary</h2>
                  <p className="text-sm text-[#1C1C1A]/75 leading-relaxed">{bill.summary}</p>
                </Card>
              )}

              {/* Main grid */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">

                {/* Left column */}
                <div className="space-y-6">

                  {/* Sponsor */}
                  {bill.sponsor && (
                    <Card>
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">Sponsor</h2>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-[#1C1C1A]">{bill.sponsor.name.replace(/\s*\[.*?\]\s*$/, '')}</p>
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
                          className="text-xs text-[#7B5E8A] hover:text-[#6A4F78] transition-colors"
                        >
                          View profile →
                        </Link>
                      </div>
                    </Card>
                  )}

                  {/* Votes */}
                  {bill.votes.length > 0 && (
                    <Card>
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">Vote Breakdown</h2>
                      <BillVoteTally votes={bill.votes} billId={id} fromParam={fromParam} />
                    </Card>
                  )}

                  {/* Co-sponsors */}
                  {bill.cosponsors.length > 0 && (
                    <Card>
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
                              <p className="text-sm text-[#1C1C1A]">{c.name.replace(/\s*\[.*?\]\s*$/, '')}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <PartyBadge party={c.party} size="xs" />
                                <span className="text-xs text-[#1C1C1A]/30">·</span>
                                <span className="text-xs text-[#1C1C1A]/45">{c.state}</span>
                              </div>
                            </div>
                            <Link
                              href={`/representatives/${c.bioguideId}`}
                              className="text-xs text-[#7B5E8A]/60 hover:text-[#7B5E8A] transition-colors"
                            >
                              →
                            </Link>
                          </div>
                        ))}
                      </div>
                      {bill.cosponsors.length > 5 && (
                        <button
                          onClick={() => setShowAllCosponsors(v => !v)}
                          className="mt-3 text-xs text-[#7B5E8A] hover:text-[#6A4F78]"
                        >
                          {showAllCosponsors ? 'Show fewer' : `Show all ${bill.cosponsors.length}`}
                        </button>
                      )}
                    </Card>
                  )}

                  {/* Subjects */}
                  {bill.subjects.length > 0 && (
                    <Card>
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
                    </Card>
                  )}
                </div>

                {/* Right column */}
                <div className="space-y-6">

                  {/* Status timeline */}
                  {bill.actions.length > 0 && (
                    <Card>
                      <h2 className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-4">Timeline</h2>
                      <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-[rgba(28,28,26,0.08)]" />
                        <div className="space-y-4">
                          {bill.actions.map((action, i) => (
                            <div key={i} className="flex gap-4 pl-5 relative">
                              {/* Dot */}
                              <div className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-[#7B5E8A]/40 bg-[#F5F0E8]" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-[#1C1C1A]/35 mb-0.5">{formatShortDate(action.date)}</p>
                                <p className="text-xs text-[#1C1C1A]/65 leading-snug">{action.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              </div>

            </div>
          )}
        </main>
      </div>

    </div>
  )
}
