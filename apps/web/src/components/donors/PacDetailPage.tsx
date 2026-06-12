

import { useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft, ExternalLink, ChevronRight, ArrowUpDown } from 'lucide-react'
import { usePacDetail, useGeneratePacSummary } from '@/hooks/queries/useDonors'
import { MoneyFlowSection } from '@/components/donors/MoneyFlowSection'
interface PacDetailRecipient {
  bioguideId: string
  name: string
  party: string
  state: string
  chamber: string
  amount: number
  direct: number
  ieFor: number
  type: string
}
import DataSourceDisclosure from '@/components/shared/DataSourceDisclosure'
import { PageTransition } from '@/components/ui/motion'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { FEC_DISPLAY_CYCLES, getFecCommitteeUrl, getOpenSecretsUrl } from '@/lib/fec'
import { formatTotal } from '@/lib/format'
import { partyAbbrev, toParty } from '@/lib/party'
import type { Party } from '@/lib/types'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

const RECIPIENTS_PREVIEW = 30

function BackArrow() {
  return <ArrowLeft size={16} strokeWidth={1.8} />
}

function DetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      <Skeleton className="h-4 w-24 mb-8" />
      <Skeleton className="h-6 w-24 rounded-full mb-4" />
      <Skeleton className="h-8 w-2/3 mb-5" />
      <Skeleton className="h-10 w-40 mb-3" />
      <Skeleton className="h-4 w-2/3 mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} padding="none" className="p-5">
            <Skeleton className="h-2.5 w-16 mb-3" />
            <Skeleton className="h-6 w-24" />
          </Card>
        ))}
      </div>
      <Card>
        <Skeleton className="h-5 w-1/4 mb-5" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-4 w-full mb-3" />
        ))}
      </Card>
    </div>
  )
}

/**
 * Recipient breakdown copy. Pure-direct rows get no label (the common case);
 * pure-IE rows get "IE only"; mixed rows get the two amounts.
 */
function breakdownText(r: PacDetailRecipient): string | null {
  if (r.direct > 0 && r.ieFor > 0) {
    return `Direct ${formatTotal(r.direct)} · IE ${formatTotal(r.ieFor)}`
  }
  if (r.direct === 0 && r.ieFor > 0) return 'IE only'
  return null
}

function RecipientRow({ recipient }: { recipient: PacDetailRecipient }) {
  const party = toParty(recipient.party)
  const ps = PARTY_STYLES[party] || { bg: PARTY_STYLES.Independent.bg, text: PARTY_STYLES.Independent.text }
  const breakdown = breakdownText(recipient)

  return (
    <Link
      to="/representatives/$id"
      params={{ id: recipient.bioguideId }}
      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 hover:bg-raised transition-colors group"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm text-fg/75 truncate group-hover:text-accent transition-colors">
            {recipient.name}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${ps.bg} ${ps.text}`}>
            {partyAbbrev(party)}-{recipient.state}
          </span>
          <span className="text-[10px] text-fg/38 flex-shrink-0 capitalize">
            {recipient.chamber}
          </span>
        </div>
        {breakdown && (
          <p className="text-[10px] text-fg/38 mt-0.5 font-mono tabular-nums">{breakdown}</p>
        )}
      </div>
      <span className="text-sm text-fg/60 font-mono tabular-nums flex-shrink-0 min-w-[64px] text-right">
        {formatTotal(recipient.amount)}
      </span>
      <ChevronRight
        size={14}
        strokeWidth={1.8}
        className="text-fg/20 group-hover:text-accent transition-colors flex-shrink-0"
      />
    </Link>
  )
}

/**
 * Single funding-breakdown stat card. Left-aligned label so the three cards
 * align across the row; color accent passed in per category. Callers are
 * responsible for hiding zero-value cards entirely.
 */
function FundingCard({
  label,
  sublabel,
  tooltip,
  amount,
  valueClassName = 'text-fg/80',
}: {
  label: string
  sublabel?: string
  tooltip: 'direct' | 'ieFor' | 'ieAgainst'
  amount: number
  valueClassName?: string
}) {
  return (
    <Card padding="none" className="p-5 text-center">
      <p className="text-[10px] text-fg/50 uppercase tracking-wider mb-2 inline-flex items-center gap-1">
        {label}
        <InfoTooltip term={tooltip} />
      </p>
      <p className={`text-xl sm:text-2xl font-medium font-mono tabular-nums ${valueClassName}`}>
        {formatTotal(amount)}
      </p>
      {sublabel && (
        <p className="text-[10px] text-fg/38 mt-1">{sublabel}</p>
      )}
    </Card>
  )
}

type SortKey = 'amount' | 'name'
type PartyFilter = 'all' | Party

export default function PacDetailPage({ cmteId }: { cmteId: string }) {
  const { data: pac, isLoading: loading, error: _pacError } = usePacDetail(cmteId)
  const summaryMutation = useGeneratePacSummary(cmteId)
  const error = _pacError ? String(_pacError) : null

  // Trigger AI summary generation on demand when PAC loads without one
  useEffect(() => {
    if (pac && !pac.summary && !summaryMutation.isPending && !summaryMutation.isSuccess && !summaryMutation.isError) {
      summaryMutation.mutate()
    }
  }, [pac, summaryMutation.isPending, summaryMutation.isSuccess, summaryMutation.isError])

  const summaryLoading = summaryMutation.isPending

  const [sortKey, setSortKey] = useState<SortKey>('amount')
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all')
  const [showAll, setShowAll] = useState(false)

  const filteredRecipients = useMemo(() => {
    if (!pac) return []
    const list = partyFilter === 'all'
      ? pac.recipients
      : pac.recipients.filter((r: PacDetailRecipient) => toParty(r.party) === partyFilter)
    const sorted = [...list]
    if (sortKey === 'amount') {
      sorted.sort((a, b) => b.amount - a.amount)
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name))
    }
    return sorted
  }, [pac, partyFilter, sortKey])

  const visibleRecipients = showAll
    ? filteredRecipients
    : filteredRecipients.slice(0, RECIPIENTS_PREVIEW)

  // Funding breakdown: hide zero-value cards. Colors are semantic — green for
  // supporting spend, warm red for opposing. Direct stays neutral ink.
  const fundingCards = pac
    ? [
        pac.directTotal > 0 && (
          <FundingCard
            key="direct"
            label="Direct"
            tooltip="direct"
            amount={pac.directTotal}
          />
        ),
        pac.ieForTotal > 0 && (
          <FundingCard
            key="ieFor"
            label="IE Support"
            sublabel="Supporting candidates"
            tooltip="ieFor"
            amount={pac.ieForTotal}
            valueClassName={STATUS_STYLES.Passed.text}
          />
        ),
        pac.ieAgainstTotal > 0 && (
          <FundingCard
            key="ieAgainst"
            label="IE Against"
            sublabel="Opposing candidates"
            tooltip="ieAgainst"
            amount={pac.ieAgainstTotal}
            valueClassName={STATUS_STYLES.Stalled.text}
          />
        ),
      ].filter(Boolean)
    : []

  const partyFilters: Array<{ key: PartyFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'Democrat', label: 'Democrat' },
    { key: 'Republican', label: 'Republican' },
    { key: 'Independent', label: 'Independent' },
  ]

  return (
    <PageTransition>
    <div className="flex flex-col flex-1 min-h-screen">
      <div className="flex flex-col flex-1">
        <main className="flex-1 px-6 pt-10 pb-8">

          {loading ? (
            <DetailSkeleton />
          ) : error || !pac ? (
            <div className="max-w-4xl mx-auto">
              <Link to="/donors" className="inline-flex items-center gap-1.5 text-sm text-fg/50 hover:text-fg/70 transition-colors mb-8">
                <BackArrow /> Top Contributors
              </Link>
              <Card padding="xl" className="text-center">
                <p className="text-fg/45 text-sm">{error ?? 'PAC not found.'}</p>
                <Link to="/donors" className="mt-3 inline-block text-sm text-accent hover:underline underline-offset-2">
                  Back to leaderboard
                </Link>
              </Card>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {/* Back link */}
              <Link to="/donors" className="inline-flex items-center gap-1.5 text-sm text-fg/50 hover:text-fg/70 transition-colors mb-6">
                <BackArrow /> Top Contributors
              </Link>

              {/* PAC Header */}
              <div className="mb-8">
                <h1 className="text-2xl sm:text-3xl font-semibold text-fg mb-2 leading-[1.15] tracking-tight">
                  {pac.name}
                </h1>

                {pac.connectedOrg && (
                  <p className="text-sm text-fg/50">
                    Affiliated with {pac.connectedOrg}
                  </p>
                )}
              </div>

              {/* AI Analysis — background + spending breakdown */}
              {(summaryLoading || pac.summary) && (
                <Card className="mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden="true">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <p className="text-[10px] text-accent uppercase tracking-wider font-medium">AI Analysis</p>
                  </div>
                  {summaryLoading ? (
                    <div className="animate-pulse space-y-3">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3.5 w-11/12" />
                      <Skeleton className="h-3.5 w-4/5" />
                      <Skeleton className="h-3.5 w-full mt-4" />
                      <Skeleton className="h-3.5 w-10/12" />
                      <Skeleton className="h-3.5 w-3/4" />
                    </div>
                  ) : pac.summary ? (
                    <>
                      <div className="text-sm text-fg/70 leading-relaxed space-y-3">
                        {pac.summary.split('\n\n').map((paragraph: string, i: number) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                      </div>
                      <p className="text-[10px] text-fg/50 mt-3">
                        AI-generated from FEC data and general knowledge. Not an official analysis.
                      </p>
                    </>
                  ) : null}
                </Card>
              )}

              {/* Money flow — Follow the Money */}
              <div className="mb-6">
                <MoneyFlowSection cmteId={cmteId} cmteName={pac.name} />
              </div>

              {/* Funding breakdown row — zero-value cards hidden */}
              {fundingCards.length > 0 && (
                <div
                  className={`grid gap-4 mb-8 grid-cols-1 ${
                    fundingCards.length === 1 ? '' : fundingCards.length === 2 ? 'sm:grid-cols-2' : 'sm:grid-cols-3'
                  }`}
                >
                  {fundingCards}
                </div>
              )}

              {/* All Recipients */}
              <div className="mb-10">
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="text-lg font-semibold text-fg tracking-tight">
                    All Recipients
                  </h2>
                  <span className="inline-flex items-center gap-2 text-xs text-fg/38">
                    {pac.recipients.length} candidate{pac.recipients.length !== 1 ? 's' : ''}
                    <span className="text-fg/20">·</span>
                    <span className="inline-flex items-center gap-0.5">
                      FEC {FEC_DISPLAY_CYCLES}
                      <InfoTooltip term="fecCycle" />
                    </span>
                  </span>
                </div>

                {pac.recipients.length === 0 ? (
                  <Card padding="none" className="px-6 py-10 text-center">
                    <p className="text-sm text-fg/45">
                      No candidate recipients in this cycle range.
                    </p>
                  </Card>
                ) : (
                  <>
                    {/* Sort + party filter controls */}
                    <div className="flex items-center gap-2 flex-wrap mb-3">
                      <div className="flex items-center gap-1">
                        {partyFilters.map(f => (
                          <button
                            key={f.key}
                            type="button"
                            onClick={() => setPartyFilter(f.key)}
                            className={`text-xs font-medium px-3 py-1 rounded-full transition-colors ${
                              partyFilter === f.key
                                ? 'bg-accent-deep/10 text-accent'
                                : 'text-fg/45 hover:text-fg/70'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                      <span className="flex-1" />
                      <button
                        type="button"
                        onClick={() => setSortKey(k => (k === 'amount' ? 'name' : 'amount'))}
                        className="inline-flex items-center gap-1.5 text-xs text-fg/55 hover:text-fg/80 transition-colors"
                        aria-label={`Change sort. Currently sorted by ${sortKey === 'amount' ? 'amount' : 'name'}`}
                      >
                        <ArrowUpDown size={12} strokeWidth={1.8} aria-hidden="true" />
                        {sortKey === 'amount' ? 'Sort: Amount' : 'Sort: Name'}
                      </button>
                    </div>

                    <Card padding="none" className="overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 border-b border-edge">
                        <span className="text-[10px] text-fg/50 uppercase tracking-wider">Recipient</span>
                        <span className="text-[10px] text-fg/50 uppercase tracking-wider min-w-[64px] text-right">Total Support</span>
                        <span className="w-[14px]" aria-hidden="true" />
                      </div>
                      {filteredRecipients.length === 0 ? (
                        <div className="px-6 py-10 text-center">
                          <p className="text-sm text-fg/45">
                            No recipients match this filter.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-edge-soft">
                          {visibleRecipients.map((r) => (
                            <RecipientRow key={r.bioguideId} recipient={r} />
                          ))}
                        </div>
                      )}
                    </Card>

                    {filteredRecipients.length > RECIPIENTS_PREVIEW && (
                      <div className="mt-3 text-center">
                        <button
                          type="button"
                          onClick={() => setShowAll(s => !s)}
                          className="text-xs text-accent hover:underline underline-offset-2"
                        >
                          {showAll
                            ? 'Show fewer'
                            : `Show all ${filteredRecipients.length} recipients`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3 flex-wrap mt-6 mb-2">
                <a
                  href={getFecCommitteeUrl(cmteId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${pac.name} on the FEC website (opens in new tab)`}
                  className="inline-flex items-center gap-1 text-xs text-fg/45 hover:text-accent transition-colors"
                >
                  View on FEC <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" />
                </a>
                <span className="text-fg/20">·</span>
                <a
                  href={getOpenSecretsUrl(cmteId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${pac.name} on OpenSecrets (opens in new tab)`}
                  className="inline-flex items-center gap-1 text-xs text-fg/45 hover:text-accent transition-colors"
                >
                  View on OpenSecrets <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" />
                </a>
              </div>
              <DataSourceDisclosure showAiDisclaimer className="mb-10" />
            </div>
          )}
        </main>
      </div>
    </div>
    </PageTransition>
  )
}
