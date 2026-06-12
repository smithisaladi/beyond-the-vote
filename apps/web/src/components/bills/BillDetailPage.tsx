

import { useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, Bookmark, ExternalLink } from 'lucide-react'
import { motion } from 'motion/react'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useAuth } from '@/components/auth/AuthContext'
import { useTrackedBills, useTrackBill } from '@/hooks/queries/useDashboard'
import { useBillDetail } from '@/hooks/queries/useBills'
import { TAP_SPRING, PageTransition } from '@/components/ui/motion'
interface BillDetailSponsor {
  name: string | null
  bioguideId: string | null
  party: string | null
}

interface BillDetailCosponsor {
  bioguideId: string
  name: string | null
  party: string | null
  state: string | null
  photoUrl: string | null
  sponsoredAt: string
  originalCosponsor: boolean
}

interface BillAction {
  date: string
  text: string
  type: string | null
}

interface VoteDetail {
  id: string
  date: string
  chamber: string
  question: string | null
  result: string
  yeas: number
  nays: number
  present: number
  notVoting: number
  partyBreakdown: Record<string, { yea: number; nay: number }>
  memberPositions?: MemberPosition[]
  sourceUrl: string | null
}

interface MemberPosition {
  bioguideId: string
  name: string
  party: string
  state: string
  position: string
}

interface BillDetail {
  id: string
  number: string | null
  title: string
  congress: number
  introducedDate: string
  status: string | null
  summary: string | null
  sponsor: BillDetailSponsor | null
  cosponsors: BillDetailCosponsor[]
  policyArea: string | null
  topics: string[]
  congressGovUrl: string | null
  actions: BillAction[]
  lastActionText: string | null
  lastActionDate: string
  votes: VoteDetail[]
}
import { PARTY_STYLES, STATUS_STYLES, getPartyStyle } from '@/lib/ui'
import { slugToTopic } from '@/lib/topics'
import { formatDate, formatShortDate } from '@/lib/format'
import { PartyBadge } from '@/components/shared/PartyBadge'
import BillVoteTally from '@/components/bills/BillVoteTally'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

// ─── Sub-components ───────────────────────────────────────────────────────────

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
    <span className={`text-[10px] font-medium px-1.5 py-px rounded-full ${style.bg} ${style.text}`}>
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
  const { data: trackedData } = useTrackedBills()
  const trackMutation = useTrackBill()
  const trackedBillIds = new Set((trackedData?.bills ?? []).map((b: any) => b.id))
  const tracked = trackedBillIds.has(id)

  const handleTrack = () => {
    if (!user) { openSignIn(); return }
    trackMutation.mutate({ billId: id, track: !tracked })
  }

  return (
    <PageTransition>
    <div className="flex flex-col min-h-screen">
      <div className="flex flex-col flex-1">
        <main className="flex-1 px-6 pt-8 pb-8">
          {loading ? (
            <DetailSkeleton />
          ) : error ? (
            <div className="max-w-4xl mx-auto">
              <div className="flex-1 flex items-center justify-center py-24">
                <div className="text-center">
                  <p className="text-fg/40 mb-4">
                    {error === 'Bill not found' ? 'This bill could not be found.' : 'Failed to load bill details.'}
                  </p>
                  <Link
                    to={backHref as any}
                    className="text-sm text-accent hover:text-accent-deep-hover"
                  >
                    ← {backLabel}
                  </Link>
                </div>
              </div>
            </div>
          ) : !bill ? null : (
            <div className="max-w-4xl mx-auto space-y-5">

              {/* Back link */}
              <Link
                to={backHref as any}
                className="inline-flex items-center gap-2 text-sm text-fg/50 hover:text-fg transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={1.8} />
                {backLabel}
              </Link>

              {/* Header card */}
              <Card padding="none" className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    {/* Meta row */}
                    <div className="flex items-center gap-2 flex-wrap mb-2.5">
                      <span className="text-xs font-mono text-fg/40 tracking-wide">{bill.number}</span>
                      <span className="text-xs text-fg/20">·</span>
                      <span className={`text-[10px] font-medium px-1.5 py-px rounded-full ${(STATUS_STYLES[bill.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Active).bg} ${(STATUS_STYLES[bill.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Active).text}`}>
                        {bill.status}
                      </span>
                      {bill.topics.length > 0 && (
                        <>
                          <span className="text-xs text-fg/20">·</span>
                          <span className="text-[10px] font-medium text-accent bg-accent/[0.12] px-1.5 py-px rounded-full">
                            {slugToTopic(bill.topics[0]) ?? bill.topics[0]}
                          </span>
                        </>
                      )}
                    </div>

                    {/* Title */}
                    <h1 className="text-xl sm:text-2xl text-fg leading-[1.2] mb-2.5 tracking-tight font-semibold">
                      {bill.title}
                    </h1>

                    {/* Introduced date */}
                    {bill.introducedDate && (
                      <p className="text-[13px] text-fg/45">
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
                      className="inline-flex items-center gap-1.5 text-xs text-fg/50 hover:text-fg border border-edge/60 rounded-lg px-3 py-2 hover:border-edge transition-colors"
                    >
                      Congress.gov
                      <ExternalLink size={14} strokeWidth={1.8} />
                    </a>
                    <motion.button
                      onClick={handleTrack}
                      disabled={trackMutation.isPending}
                      aria-label={tracked ? 'Stop tracking this bill' : 'Track this bill'}
                      {...TAP_SPRING}
                      className={`inline-flex items-center gap-2 text-xs font-medium rounded-lg px-3 py-2 transition-colors ${
                        tracked
                          ? 'bg-accent/[0.12] text-accent hover:bg-accent/[0.18]'
                          : 'border border-edge/60 text-fg/60 hover:border-accent/40 hover:text-accent'
                      }`}
                    >
                      <Bookmark
                        size={16}
                        strokeWidth={1.8}
                        className={tracked ? 'text-accent' : 'text-fg/45'}
                        fill={tracked ? 'currentColor' : 'none'}
                      />
                      {tracked ? 'Tracking' : 'Track'}
                    </motion.button>
                  </div>
                </div>
              </Card>

              {/* Summary */}
              {bill.summary && (
                <Card padding="none" className="p-5 sm:p-6">
                  <h2 className="text-[10px] font-medium text-fg/40 uppercase tracking-[0.07em] mb-2.5">Summary</h2>
                  <p className="text-[13px] text-fg/75 leading-relaxed">{bill.summary}</p>
                </Card>
              )}

              {/* Main grid */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5">

                {/* Left column */}
                <div className="space-y-5">

                  {/* Sponsor */}
                  {bill.sponsor && (
                    <Card>
                      <h2 className="text-[10px] font-medium text-fg/40 uppercase tracking-[0.07em] mb-3">Sponsor</h2>
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[13px] font-medium text-fg">{bill.sponsor.name?.replace(/\s*\[.*?\]\s*$/, '')}</p>
                          {bill.sponsor.party && (
                            <div className="flex items-center gap-2 mt-1">
                              <PartyTag party={bill.sponsor.party} />
                            </div>
                          )}
                        </div>
                        <Link
                          to="/representatives/$id"
                          params={{ id: bill.sponsor.bioguideId }}
                          className="text-xs text-accent hover:text-accent-deep-hover transition-colors"
                        >
                          View profile →
                        </Link>
                      </div>
                    </Card>
                  )}

                  {/* Votes */}
                  {bill.votes?.length > 0 && (
                    <Card>
                      <h2 className="text-[10px] font-medium text-fg/40 uppercase tracking-[0.07em] mb-3">Vote Breakdown</h2>
                      <BillVoteTally votes={bill.votes} billId={id} fromParam={fromParam} />
                    </Card>
                  )}

                  {/* Co-sponsors */}
                  {bill.cosponsors?.length > 0 && (
                    <Card>
                      <h2 className="text-[10px] font-medium text-fg/40 uppercase tracking-[0.07em] mb-3">
                        Co-sponsors
                        <span className="ml-1.5 text-fg/30 normal-case tracking-normal font-normal">
                          ({bill.cosponsors.length})
                        </span>
                      </h2>
                      <div className="divide-y divide-edge-soft">
                        {(showAllCosponsors ? bill.cosponsors : bill.cosponsors.slice(0, 5)).map((c: any) => (
                          <div key={c.bioguideId} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                            <div>
                              <p className="text-[13px] text-fg">{c.name.replace(/\s*\[.*?\]\s*$/, '')}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <PartyBadge party={c.party} size="xs" />
                                <span className="text-xs text-fg/30">·</span>
                                <span className="text-xs text-fg/45">{c.state}</span>
                              </div>
                            </div>
                            <Link
                              to="/representatives/$id"
                              params={{ id: c.bioguideId }}
                              className="text-xs text-accent/60 hover:text-accent transition-colors"
                            >
                              →
                            </Link>
                          </div>
                        ))}
                      </div>
                      {bill.cosponsors.length > 5 && (
                        <button
                          onClick={() => setShowAllCosponsors(v => !v)}
                          className="mt-3 text-xs text-accent hover:text-accent-deep-hover"
                        >
                          {showAllCosponsors ? 'Show fewer' : `Show all ${bill.cosponsors.length}`}
                        </button>
                      )}
                    </Card>
                  )}

                  {/* Topics */}
                  {bill.topics?.length > 0 && (
                    <Card>
                      <h2 className="text-[10px] font-medium text-fg/40 uppercase tracking-[0.07em] mb-2.5">Topics</h2>
                      <div className="flex flex-wrap gap-1.5">
                        {bill.topics.map((subject: any) => (
                          <span
                            key={subject}
                            className="text-[10px] text-fg/55 bg-fg/[0.06] px-2 py-0.5 rounded-full"
                          >
                            {subject}
                          </span>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>

                {/* Right column */}
                <div className="space-y-5">

                  {/* Status timeline */}
                  {bill.actions?.length > 0 && (
                    <Card>
                      <h2 className="text-[10px] font-medium text-fg/40 uppercase tracking-[0.07em] mb-3">Timeline</h2>
                      <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-edge" />
                        <div className="space-y-3">
                          {bill.actions.map((action: any, i: number) => (
                            <div key={i} className="flex gap-4 pl-5 relative">
                              {/* Dot */}
                              <div className="absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-accent/40 bg-bg" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-fg/35 mb-0.5">{formatShortDate(action.date)}</p>
                                <p className="text-xs text-fg/65 leading-snug">{action.text}</p>
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
    </PageTransition>
  )
}
