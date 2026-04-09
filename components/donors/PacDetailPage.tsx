'use client'

import { use } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useFetchPacDetail, type PacDetailRecipient } from '@/hooks/useFetchPacDetail'
import { PageHeader } from '@/components/layout/PageHeader'
import DataSourceDisclosure from '@/components/shared/DataSourceDisclosure'
import { PARTY_STYLES } from '@/lib/ui'
import { FEC_DISPLAY_CYCLES, getFecCommitteeUrl, getOpenSecretsUrl } from '@/lib/fec'
import type { Party } from '@/lib/types'

function formatTotal(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function formatAmount(n: number): string {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

function partyAbbrev(party: Party): string {
  if (party === 'Democrat') return 'D'
  if (party === 'Republican') return 'R'
  return 'I'
}

function toParty(p: string): Party {
  if (p === 'Democrat' || p === 'Republican' || p === 'Independent') return p
  return 'Independent'
}

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
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
      <div className="h-8 bg-[#E8E3DA] rounded w-2/3 mb-3" />
      <div className="h-4 bg-[#E8E3DA] rounded w-1/3 mb-6" />
      <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 mb-6">
        <div className="h-4 bg-[#E8E3DA] rounded w-full mb-2" />
        <div className="h-4 bg-[#E8E3DA] rounded w-5/6 mb-2" />
        <div className="h-4 bg-[#E8E3DA] rounded w-3/4" />
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

function RecipientRow({ recipient }: { recipient: PacDetailRecipient }) {
  const party = toParty(recipient.party)
  const ps = PARTY_STYLES[party]
  const showBreakdown = recipient.direct > 0 && recipient.ieFor > 0

  return (
    <Link
      href={`/representatives/${recipient.bioguideId}`}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#F5F0E8]/60 transition-colors"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="text-sm text-[#1C1C1A]/70 truncate">{recipient.name}</span>
          <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${ps.bg} ${ps.text}`}>
            {partyAbbrev(party)}-{recipient.state}
          </span>
          <span className="text-[11px] text-[#1C1C1A]/38 flex-shrink-0 capitalize">
            {recipient.chamber}
          </span>
        </div>
        {showBreakdown && (
          <p className="text-[10px] text-[#1C1C1A]/30 mt-0.5">
            Direct: {formatAmount(recipient.direct)} · IE: {formatAmount(recipient.ieFor)}
          </p>
        )}
      </div>
      <span className="text-sm text-[#1C1C1A]/50 tabular-nums flex-shrink-0">
        {formatAmount(recipient.amount)}
      </span>
    </Link>
  )
}

export default function PacDetailPage({ params }: { params: Promise<{ cmteId: string }> }) {
  const { cmteId } = use(params)
  const { pac, loading, error } = useFetchPacDetail(cmteId)

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
                <BackArrow /> Back to Top Contributors
              </Link>
              <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-12 text-center">
                <p className="text-[#1C1C1A]/40 text-sm">{error ?? 'PAC not found.'}</p>
                <Link href="/donors" className="mt-3 inline-block text-sm text-[#9B7FA6] hover:underline underline-offset-2">
                  Back to leaderboard
                </Link>
              </div>
            </div>
          ) : (
            <div className="max-w-2xl mx-auto">
              {/* Back link */}
              <Link href="/donors" className="inline-flex items-center gap-1.5 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70 transition-colors mb-6">
                <BackArrow /> Top Contributors
              </Link>

              {/* PAC Header */}
              <div className="mb-6">
                <div className="flex items-center gap-2.5 mb-2">
                  <span className="text-[11px] text-[#1C1C1A]/40 bg-[#F5F0E8] border border-[rgba(28,28,26,0.08)] px-2.5 py-1 rounded-full">
                    {FEC_DISPLAY_CYCLES}
                  </span>
                  {pac.connectedOrg && (
                    <span className="text-xs text-[#1C1C1A]/45">
                      {pac.connectedOrg}
                    </span>
                  )}
                </div>
                <h1
                  className="text-3xl text-[#1C1C1A] tracking-tight mb-2"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {pac.name}
                </h1>
                <div className="flex items-center gap-4 text-sm text-[#1C1C1A]/50">
                  <span
                    className="text-lg text-[#1C1C1A]/80 font-medium"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {formatTotal(pac.totalContributions)}
                  </span>
                  <span className="text-[#1C1C1A]/20">·</span>
                  <span>{pac.recipientCount} candidate{pac.recipientCount !== 1 ? 's' : ''} supported</span>
                </div>
                <div className="flex items-center gap-3 mt-2.5">
                  <a
                    href={getFecCommitteeUrl(cmteId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#1C1C1A]/38 hover:text-[#9B7FA6] transition-colors"
                  >
                    View on FEC <ExternalLink size={11} strokeWidth={1.8} />
                  </a>
                  <span className="text-[#1C1C1A]/20">·</span>
                  <a
                    href={getOpenSecretsUrl(cmteId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#1C1C1A]/38 hover:text-[#9B7FA6] transition-colors"
                  >
                    View on OpenSecrets <ExternalLink size={11} strokeWidth={1.8} />
                  </a>
                </div>
              </div>

              {/* Funding breakdown row */}
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-4 text-center">
                  <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-1">Direct</p>
                  <p className="text-base font-medium text-[#1C1C1A]/70" style={{ fontFamily: 'var(--font-serif)' }}>
                    {formatTotal(pac.directTotal)}
                  </p>
                  {pac.totalContributions > 0 && (
                    <p className="text-[10px] text-[#1C1C1A]/30 mt-0.5">{Math.round(pac.directTotal / pac.totalContributions * 100)}%</p>
                  )}
                  <p className="text-[10px] text-[#1C1C1A]/30 mt-1">Given directly to campaigns</p>
                </div>
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-4 text-center">
                  <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-1">IE Support</p>
                  <p className="text-base font-medium text-[#1C1C1A]/70" style={{ fontFamily: 'var(--font-serif)' }}>
                    {formatTotal(pac.ieForTotal)}
                  </p>
                  {pac.totalContributions > 0 && (
                    <p className="text-[10px] text-[#1C1C1A]/30 mt-0.5">{Math.round(pac.ieForTotal / pac.totalContributions * 100)}%</p>
                  )}
                  <p className="text-[10px] text-[#1C1C1A]/30 mt-1">Spent independently to support</p>
                </div>
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-4 text-center">
                  <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-1">IE Against</p>
                  <p className="text-base font-medium text-[#B85C38]/70" style={{ fontFamily: 'var(--font-serif)' }}>
                    {formatTotal(pac.ieAgainstTotal)}
                  </p>
                  {pac.totalContributions > 0 && (
                    <p className="text-[10px] text-[#B85C38]/30 mt-0.5">{Math.round(pac.ieAgainstTotal / pac.totalContributions * 100)}%</p>
                  )}
                  <p className="text-[10px] text-[#1C1C1A]/30 mt-1">Spent independently to oppose</p>
                </div>
              </div>

              {/* AI Summary */}
              {pac.summary && (
                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] p-6 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#9B7FA6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <p className="text-[10px] text-[#9B7FA6] uppercase tracking-wider font-medium">AI Summary</p>
                  </div>
                  <p className="text-sm text-[#1C1C1A]/70 leading-relaxed">
                    {pac.summary}
                  </p>
                  <p className="text-[10px] text-[#1C1C1A]/30 mt-2">
                    AI-generated from FEC contribution data. Describes patterns only — not an official analysis or endorsement.
                  </p>
                </div>
              )}

              {/* All Recipients */}
              <div className="mb-10">
                <div className="flex items-baseline gap-2.5 mb-4">
                  <h2
                    className="text-lg font-semibold text-[#1C1C1A]"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    All Recipients
                  </h2>
                  <span className="text-sm text-[#1C1C1A]/38">{pac.recipients.length}</span>
                </div>

                <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[rgba(28,28,26,0.06)]">
                    <span className="text-[10px] text-[#1C1C1A]/30 uppercase tracking-wider">Recipient</span>
                    <span className="text-[10px] text-[#1C1C1A]/30 uppercase tracking-wider">Total Support</span>
                  </div>
                  <div className="divide-y divide-[rgba(28,28,26,0.05)]">
                    {pac.recipients.map((r) => (
                      <RecipientRow key={r.bioguideId} recipient={r} />
                    ))}
                  </div>
                </div>
              </div>

              <DataSourceDisclosure showAiDisclaimer className="mb-10" />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
