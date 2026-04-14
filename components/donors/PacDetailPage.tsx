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

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.025 }}
    >
      <defs>
        <pattern id="topo-pac-detail" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
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
      <rect width="100%" height="100%" fill="url(#topo-pac-detail)" />
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
    <div className="max-w-2xl mx-auto animate-pulse">
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
          <span className="text-sm text-[#1C1C1A]/75 truncate group-hover:text-[#9B7FA6] transition-colors">
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
        className="text-[#1C1C1A]/20 group-hover:text-[#9B7FA6] transition-colors flex-shrink-0"
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
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-5">
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
  const { pac, loading, error } = useFetchPacDetail(cmteId)

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
            valueClassName="text-[#6A9B7B]"
          />
        ),
        pac.ieAgainstTotal > 0 && (
          <FundingCard
            key="ieAgainst"
            label="IE Against"
            sublabel="Opposing candidates"
            tooltip="ieAgainst"
            amount={pac.ieAgainstTotal}
            valueClassName="text-[#B85C38]"
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
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Donors" />
        <main className="flex-1 px-6 py-10">

          {loading ? (
            <DetailSkeleton />
          ) : error || !pac ? (
            <div className="max-w-2xl mx-auto">
              <Link href="/donors" className="inline-flex items-center gap-1.5 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70 transition-colors mb-8">
                <BackArrow /> Top Contributors
              </Link>
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-12 text-center">
                <p className="text-[#1C1C1A]/45 text-sm">{error ?? 'PAC not found.'}</p>
                <Link href="/donors" className="mt-3 inline-block text-sm text-[#9B7FA6] hover:underline underline-offset-2">
                  Back to leaderboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {/* Back link */}
              <Link href="/donors" className="inline-flex items-center gap-1.5 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70 transition-colors mb-8">
                <BackArrow /> Top Contributors
              </Link>

              {/* PAC Header — landing-scale, centered */}
              <div className="text-center mb-10">
                {/* Eyebrow pill */}
                <span className="inline-flex items-center gap-1 text-xs font-medium text-[#9B7FA6] bg-[#9B7FA6]/10 border border-[#9B7FA6]/20 px-3 py-1 rounded-full mb-5 tracking-[0.08em] uppercase">
                  {FEC_DISPLAY_CYCLES}
                  <InfoTooltip term="fecCycle" />
                </span>

                {/* H1 — PAC name */}
                <h1
                  className="text-4xl sm:text-5xl text-[#1C1C1A] mb-4 leading-[1.08] tracking-[-0.02em]"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 700 }}
                >
                  {toTitleCase(pac.name)}
                </h1>

                {/* Subtitle sentence */}
                <p className="text-base sm:text-lg text-[#1C1C1A]/55 leading-relaxed max-w-md mx-auto mb-6">
                  {pac.connectedOrg && (
                    <>
                      Affiliated with {toTitleCase(pac.connectedOrg)}.{' '}
                    </>
                  )}
                  {pac.recipientCount} candidate{pac.recipientCount !== 1 ? 's' : ''} supported this cycle.
                </p>

                {/* External links as an action group */}
                <div className="flex items-center justify-center gap-3 flex-wrap">
                  <a
                    href={getFecCommitteeUrl(cmteId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${toTitleCase(pac.name)} on the FEC website (opens in new tab)`}
                    className="inline-flex items-center gap-1 text-xs text-[#1C1C1A]/45 hover:text-[#9B7FA6] transition-colors"
                  >
                    View on FEC <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                  <span className="text-[#1C1C1A]/20">·</span>
                  <a
                    href={getOpenSecretsUrl(cmteId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View ${toTitleCase(pac.name)} on OpenSecrets (opens in new tab)`}
                    className="inline-flex items-center gap-1 text-xs text-[#1C1C1A]/45 hover:text-[#9B7FA6] transition-colors"
                  >
                    View on OpenSecrets <ExternalLink size={11} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                </div>
              </div>

              {/* AI Summary — positioned as a TL;DR under the hero */}
              {pac.summary && (
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B7FA6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <p className="text-[10px] text-[#9B7FA6] uppercase tracking-wider font-medium">AI Summary</p>
                  </div>
                  <p className="text-sm text-[#1C1C1A]/70 leading-relaxed">
                    {pac.summary}
                  </p>
                  <p className="text-[10px] text-[#1C1C1A]/50 mt-3">
                    AI-generated from FEC contribution data. Describes patterns only — not an official analysis or endorsement.
                  </p>
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
                <h2
                  className="text-3xl text-[#1C1C1A] mb-2 text-center"
                  style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
                >
                  All Recipients
                </h2>
                <p className="text-sm text-[#1C1C1A]/50 text-center mb-8 max-w-md mx-auto tracking-[0.01em]">
                  {pac.recipients.length} candidate{pac.recipients.length !== 1 ? 's' : ''} this PAC supported with direct or independent-expenditure spending.
                </p>

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
                                ? 'bg-[#9B7FA6]/10 text-[#9B7FA6]'
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
                          className="text-xs text-[#9B7FA6] hover:underline underline-offset-2"
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

              <DataSourceDisclosure showAiDisclaimer className="mb-10" />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
