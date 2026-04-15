'use client'

import { use, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, ChevronRight, ArrowUpDown } from 'lucide-react'
import { useFetchPacDetail, type PacDetailRecipient } from '@/hooks/useFetchPacDetail'
import { PageHeader } from '@/components/layout/PageHeader'
import DataSourceDisclosure from '@/components/shared/DataSourceDisclosure'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import { PARTY_STYLES } from '@/lib/ui'
import { FEC_DISPLAY_CYCLES, getFecCommitteeUrl, getOpenSecretsUrl } from '@/lib/fec'
import { formatTotal, toTitleCase } from '@/lib/format'
import { partyAbbrev, toParty } from '@/lib/party'
import type { Party } from '@/lib/types'

const RECIPIENTS_PREVIEW = 30

function DotGridBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="dot-grid-pac-detail" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="12" cy="12" r="1.2" fill="#1C1C1A" opacity="0.18" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dot-grid-pac-detail)" />
    </svg>
  )
}

function BackArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}

function DetailSkeleton() {
  return (
    <div className="max-w-4xl mx-auto animate-pulse">
      <div className="h-4 w-24 bg-[#E8E3DA] rounded mb-8" />
      <div className="h-6 w-24 bg-[#E8E3DA] rounded-full mb-4" />
      <div className="h-8 bg-[#E8E3DA] rounded w-2/3 mb-5" />
      <div className="h-10 bg-[#E8E3DA] rounded w-40 mb-3" />
      <div className="h-4 bg-[#E8E3DA] rounded w-2/3 mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
            <div className="h-2.5 bg-[#E8E3DA] rounded w-16 mb-3" />
            <div className="h-6 bg-[#E8E3DA] rounded w-24" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6">
        <div className="h-5 bg-[#E8E3DA] rounded w-1/4 mb-5" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-4 bg-[#E8E3DA] rounded w-full mb-3" />
        ))}
      </div>
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
  const ps = PARTY_STYLES[party]
  const breakdown = breakdownText(recipient)

  return (
    <Link
      href={`/representatives/${recipient.bioguideId}`}
      className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3 hover:bg-[#F5F0E8]/60 transition-colors group"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className="text-sm text-[#1C1C1A]/75 truncate group-hover:text-[#7B5E8A] transition-colors">
            {recipient.name}
          </span>
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${ps.bg} ${ps.text}`}>
            {partyAbbrev(party)}-{recipient.state}
          </span>
          <span className="text-[10px] text-[#1C1C1A]/38 flex-shrink-0 capitalize">
            {recipient.chamber}
          </span>
        </div>
        {breakdown && (
          <p className="text-[10px] text-[#1C1C1A]/38 mt-0.5 tabular-nums">{breakdown}</p>
        )}
      </div>
      <span className="text-sm text-[#1C1C1A]/60 tabular-nums flex-shrink-0 min-w-[64px] text-right">
        {formatTotal(recipient.amount)}
      </span>
      <ChevronRight
        size={14}
        strokeWidth={1.8}
        className="text-[#1C1C1A]/20 group-hover:text-[#7B5E8A] transition-colors flex-shrink-0"
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
  valueClassName = 'text-[#1C1C1A]/80',
}: {
  label: string
  sublabel?: string
  tooltip: 'direct' | 'ieFor' | 'ieAgainst'
  amount: number
  valueClassName?: string
}) {
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5 text-center">
      <p className="text-[10px] text-[#1C1C1A]/50 uppercase tracking-wider mb-2 inline-flex items-center gap-1">
        {label}
        <InfoTooltip term={tooltip} />
      </p>
      <p
        className={`text-xl sm:text-2xl font-medium tabular-nums ${valueClassName}`}
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {formatTotal(amount)}
      </p>
      {sublabel && (
        <p className="text-[10px] text-[#1C1C1A]/38 mt-1">{sublabel}</p>
      )}
    </div>
  )
}

type SortKey = 'amount' | 'name'
type PartyFilter = 'all' | Party

export default function PacDetailPage({ params }: { params: Promise<{ cmteId: string }> }) {
  const { cmteId } = use(params)
  const { pac, loading, summaryLoading, error } = useFetchPacDetail(cmteId)

  const [sortKey, setSortKey] = useState<SortKey>('amount')
  const [partyFilter, setPartyFilter] = useState<PartyFilter>('all')
  const [showAll, setShowAll] = useState(false)

  const filteredRecipients = useMemo(() => {
    if (!pac) return []
    const list = partyFilter === 'all'
      ? pac.recipients
      : pac.recipients.filter(r => toParty(r.party) === partyFilter)
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
            valueClassName="text-[#4A8B6F]"
          />
        ),
        pac.ieAgainstTotal > 0 && (
          <FundingCard
            key="ieAgainst"
            label="IE Against"
            sublabel="Opposing candidates"
            tooltip="ieAgainst"
            amount={pac.ieAgainstTotal}
            valueClassName="text-[#C4553A]"
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
    <div className="relative flex flex-col flex-1 min-h-screen overflow-hidden">
      <DotGridBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Donors" />
        <main className="flex-1 px-6 pt-10 pb-8">

          {loading ? (
            <DetailSkeleton />
          ) : error || !pac ? (
            <div className="max-w-4xl mx-auto">
              <Link href="/donors" className="inline-flex items-center gap-1.5 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70 transition-colors mb-8">
                <BackArrow /> Top Contributors
              </Link>
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-12 text-center">
                <p className="text-[#1C1C1A]/45 text-sm">{error ?? 'PAC not found.'}</p>
                <Link href="/donors" className="mt-3 inline-block text-sm text-[#7B5E8A] hover:underline underline-offset-2">
                  Back to leaderboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              {/* Back link */}
              <Link href="/donors" className="inline-flex items-center gap-1.5 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70 transition-colors mb-6">
                <BackArrow /> Top Contributors
              </Link>

              {/* PAC Header */}
              <div className="mb-8">
                <h1
                  className="text-2xl sm:text-3xl text-[#1C1C1A] mb-2 leading-[1.15] tracking-[-0.01em]"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
                >
                  {toTitleCase(pac.name)}
                </h1>

                {pac.connectedOrg && (
                  <p className="text-sm text-[#1C1C1A]/50">
                    Affiliated with {toTitleCase(pac.connectedOrg)}
                  </p>
                )}
              </div>

              {/* AI Analysis — background + spending breakdown */}
              {(summaryLoading || pac.summary) && (
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7B5E8A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <p className="text-[10px] text-[#7B5E8A] uppercase tracking-wider font-medium">AI Analysis</p>
                  </div>
                  {summaryLoading ? (
                    <div className="animate-pulse space-y-3">
                      <div className="h-3.5 bg-[#E8E3DA] rounded w-full" />
                      <div className="h-3.5 bg-[#E8E3DA] rounded w-11/12" />
                      <div className="h-3.5 bg-[#E8E3DA] rounded w-4/5" />
                      <div className="h-3.5 bg-[#E8E3DA] rounded w-full mt-4" />
                      <div className="h-3.5 bg-[#E8E3DA] rounded w-10/12" />
                      <div className="h-3.5 bg-[#E8E3DA] rounded w-3/4" />
                    </div>
                  ) : (
                    <>
                      <div className="text-sm text-[#1C1C1A]/70 leading-relaxed space-y-3">
                        {pac.summary.split('\n\n').map((paragraph, i) => (
                          <p key={i}>{paragraph}</p>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#1C1C1A]/50 mt-3">
                        AI-generated from FEC data and general knowledge. Not an official analysis.
                      </p>
                    </>
                  )}
                </div>
              )}

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
                  <h2
                    className="text-lg text-[#1C1C1A]"
                    style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
                  >
                    All Recipients
                  </h2>
                  <span className="inline-flex items-center gap-2 text-xs text-[#1C1C1A]/38">
                    {pac.recipients.length} candidate{pac.recipients.length !== 1 ? 's' : ''}
                    <span className="text-[#1C1C1A]/20">·</span>
                    <span className="inline-flex items-center gap-0.5">
                      FEC {FEC_DISPLAY_CYCLES}
                      <InfoTooltip term="fecCycle" />
                    </span>
                  </span>
                </div>

                {pac.recipients.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] px-6 py-10 text-center">
                    <p className="text-sm text-[#1C1C1A]/45">
                      No candidate recipients in this cycle range.
                    </p>
                  </div>
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
                                ? 'bg-[#7B5E8A]/10 text-[#7B5E8A]'
                                : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70'
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
                        className="inline-flex items-center gap-1.5 text-xs text-[#1C1C1A]/55 hover:text-[#1C1C1A]/80 transition-colors"
                        aria-label={`Change sort. Currently sorted by ${sortKey === 'amount' ? 'amount' : 'name'}`}
                      >
                        <ArrowUpDown size={12} strokeWidth={1.8} aria-hidden="true" />
                        {sortKey === 'amount' ? 'Sort: Amount' : 'Sort: Name'}
                      </button>
                    </div>

                    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
                      <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-2 border-b border-[rgba(28,28,26,0.06)]">
                        <span className="text-[10px] text-[#1C1C1A]/50 uppercase tracking-wider">Recipient</span>
                        <span className="text-[10px] text-[#1C1C1A]/50 uppercase tracking-wider min-w-[64px] text-right">Total Support</span>
                        <span className="w-[14px]" aria-hidden="true" />
                      </div>
                      {filteredRecipients.length === 0 ? (
                        <div className="px-6 py-10 text-center">
                          <p className="text-sm text-[#1C1C1A]/45">
                            No recipients match this filter.
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[rgba(28,28,26,0.05)]">
                          {visibleRecipients.map((r) => (
                            <RecipientRow key={r.bioguideId} recipient={r} />
                          ))}
                        </div>
                      )}
                    </div>

                    {filteredRecipients.length > RECIPIENTS_PREVIEW && (
                      <div className="mt-3 text-center">
                        <button
                          type="button"
                          onClick={() => setShowAll(s => !s)}
                          className="text-xs text-[#7B5E8A] hover:underline underline-offset-2"
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
                  aria-label={`View ${toTitleCase(pac.name)} on the FEC website (opens in new tab)`}
                  className="inline-flex items-center gap-1 text-xs text-[#1C1C1A]/45 hover:text-[#7B5E8A] transition-colors"
                >
                  View on FEC <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" />
                </a>
                <span className="text-[#1C1C1A]/20">·</span>
                <a
                  href={getOpenSecretsUrl(cmteId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`View ${toTitleCase(pac.name)} on OpenSecrets (opens in new tab)`}
                  className="inline-flex items-center gap-1 text-xs text-[#1C1C1A]/45 hover:text-[#7B5E8A] transition-colors"
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
  )
}
