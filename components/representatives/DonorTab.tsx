'use client'

import Link from 'next/link'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import type { FecTermKey } from '@/lib/fec'
import { toTitleCase as formatTitleCase, formatTotal } from '@/lib/format'

interface Donor {
  rank: number
  name: string
  amount: string
  category: string
  summary?: string
}

interface FundingBreakdown {
  pac: number
  pacPct: number
  individualLarge: number
  individualLargePct: number
  individualSmall: number
  individualSmallPct: number
  partyContributions: number
  partyContributionsPct: number
  selfFunded: number
  selfFundedPct: number
  other: number
  otherPct: number
  total: number
  superPacFor: number
  superPacAgainst: number
  inStateTotal: number
  outOfStateTotal: number
  inStatePct: number
  outOfStatePct: number
  cycle: number
  minCycle?: number
}

interface TopContributor {
  rank: number
  orgName: string
  total: string
  cmteId?: string | null
}

interface DonorTabProps {
  pacDonors: Donor[]
  topContributors: TopContributor[]
  fundingBreakdown?: FundingBreakdown | null
  fecUrl?: string | null
}

// Restore acronym casing on org names. The upstream pipeline title-cases
// strings naively (e.g. "Microsoft Corp Pac"), stripping PAC / LLC / NRA /
// AT&T / etc. Re-uppercasing then running the shared acronym-aware
// toTitleCase from @/lib/format recovers the correct casing.
function prettyOrgName(s: string): string {
  return formatTitleCase(s.toUpperCase())
}


const UNINFORMATIVE = new Set(['Other', 'N/A', 'None', 'Various', 'Unknown', 'Na'])

function cleanList(list: Donor[]): Donor[] {
  return list
    .map(d => ({ ...d, name: prettyOrgName(d.name) }))
    .filter(d => !UNINFORMATIVE.has(d.name))
    .slice(0, 6)
}

// Hairline top-rule + tiny serif-uppercase label (left) with optional right-side meta.
// The editorial "section head" — used for geo, top contributors, and any future section.
function SectionHeader({
  children,
  tooltipTerm,
  right,
}: {
  children: React.ReactNode
  tooltipTerm?: FecTermKey
  right?: React.ReactNode
}) {
  return (
    <div className="border-t border-[rgba(28,28,26,0.10)] pt-4 mb-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide inline-flex items-center gap-1">
          {children}
          {tooltipTerm && <InfoTooltip term={tooltipTerm} />}
        </p>
        {right && (
          <span
            className="text-[#1C1C1A]/30 uppercase tracking-[0.08em] inline-flex items-center gap-1 flex-shrink-0"
            style={{ fontSize: '0.5625rem' }}
          >
            {right}
          </span>
        )}
      </div>
    </div>
  )
}

// The dotted-leader primitive: [content] .................. [content]
// A table-of-contents / ledger convention — the editorial signature move.
function LedgerRow({
  left,
  right,
  className = '',
}: {
  left: React.ReactNode
  right: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-baseline gap-1 ${className}`}>
      <span className="shrink-0 max-w-[65%]">{left}</span>
      <span
        className="flex-1 min-w-4 self-end mb-[3px]"
        style={{ borderBottom: '1px dotted rgba(28,28,26,0.18)' }}
      />
      <span className="shrink-0">{right}</span>
    </div>
  )
}

// Cycle label: "2023–2024" if the summary spans multiple cycles, else just the cycle.
function cycleLabel(bd: FundingBreakdown): string {
  if (bd.minCycle && bd.minCycle !== bd.cycle) return `${bd.minCycle}–${bd.cycle}`
  return String(bd.cycle)
}

export function DonorTab({ pacDonors, topContributors, fundingBreakdown, fecUrl }: DonorTabProps) {
  const bd = fundingBreakdown && fundingBreakdown.total > 0 ? fundingBreakdown : null
  const cleanPacDonors = cleanList(pacDonors)
  const hasContributors = topContributors.length > 0
  const hasDonorData   = hasContributors || cleanPacDonors.length > 0

  if (!hasDonorData && !bd) {
    return (
      <div className="px-6 py-8 text-center">
        <p className="text-sm text-[#1C1C1A]/40 mb-2">Donor data unavailable.</p>
        {fecUrl && (
          <a href={fecUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#7B5E8A] hover:text-[#6A4F78]">
            View on FEC →
          </a>
        )}
      </div>
    )
  }

  const geoTotal = bd ? bd.inStateTotal + bd.outOfStateTotal : 0
  const hasGeo = bd !== null && geoTotal > 0

  const fundingLegend: { color: string; label: string; pct: number }[] = bd
    ? [
        { color: 'bg-[#7B5E8A]',    label: 'PAC & Corporate',      pct: bd.pacPct },
        { color: 'bg-[#7B5E8A]/45', label: 'Large Individual',     pct: bd.individualLargePct },
        { color: 'bg-[#7B5E8A]/20', label: 'Small Donors (<$200)', pct: bd.individualSmallPct },
        { color: 'bg-[#E8E3DA] border border-[rgba(28,28,26,0.08)]', label: 'Other', pct: bd.otherPct },
      ]
    : []

  const visibleContributors = topContributors.slice(0, 5)

  return (
    <div className="px-6 py-6 sm:px-8">

      {/* ── §1 Funding Breakdown (custom eyebrow, hero total, stacked bar, ledger legend) ── */}
      {bd && (
        <div className="mb-8">
          {/* Eyebrow row: title · cycle */}
          <div className="flex items-baseline justify-between gap-4 mb-3">
            <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide">
              Funding Breakdown
            </p>
            <span
              className="text-[#1C1C1A]/30 uppercase tracking-[0.08em] tabular-nums flex-shrink-0"
              style={{ fontSize: '0.5625rem' }}
            >
              Cycle {cycleLabel(bd)}
            </span>
          </div>

          {/* Hero total */}
          <p
            className="text-[#1C1C1A] tabular-nums leading-none"
            style={{ fontFamily: 'var(--font-serif)', fontSize: '1.75rem', fontWeight: 600 }}
          >
            {formatTotal(bd.total)}
          </p>
          <p
            className="text-[#1C1C1A]/35 uppercase tracking-[0.10em] mt-1.5 mb-4"
            style={{ fontSize: '0.5625rem' }}
          >
            Total receipts
          </p>

          {/* Stacked bar — architectural corners */}
          <div className="flex h-2 rounded-sm overflow-hidden bg-[#E8E3DA] mb-4">
            {bd.pacPct > 0 && (
              <div className="bg-[#7B5E8A]" style={{ width: `${bd.pacPct}%`, minWidth: 2 }} />
            )}
            {bd.individualLargePct > 0 && (
              <div className="bg-[#7B5E8A]/45" style={{ width: `${bd.individualLargePct}%`, minWidth: 2 }} />
            )}
            {bd.individualSmallPct > 0 && (
              <div className="bg-[#7B5E8A]/20" style={{ width: `${bd.individualSmallPct}%`, minWidth: 2 }} />
            )}
            {bd.otherPct > 0 && (
              <div className="bg-[#E8E3DA]" style={{ width: `${bd.otherPct}%`, minWidth: 2 }} />
            )}
          </div>

          {/* Legend as stacked ledger rows with dotted leaders */}
          <div className="space-y-2">
            {fundingLegend.map(row => (
              <LedgerRow
                key={row.label}
                left={
                  <span className="inline-flex items-center gap-2 text-xs text-[#1C1C1A]/60 truncate">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.color}`} />
                    <span className="truncate">{row.label}</span>
                  </span>
                }
                right={
                  <span
                    className="text-xs text-[#1C1C1A] tabular-nums"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {Math.round(row.pct)}%
                  </span>
                }
              />
            ))}
          </div>
        </div>
      )}

      {/* ── §2 Geographic breakdown: two-column stat pair ── */}
      {hasGeo && bd && (
        <div className="mb-8">
          <SectionHeader
            right={
              <>
                <span className="inline-flex items-center gap-0.5">
                  Itemized
                  <InfoTooltip term="itemized" />
                </span>
                <span>· PAC excluded</span>
              </>
            }
          >
            Geographic Breakdown
          </SectionHeader>

          <div className="flex gap-6">
            {/* In-state (accent) */}
            <div className="flex-1 min-w-0">
              <p
                className="text-[#7B5E8A] tabular-nums leading-none"
                style={{ fontFamily: 'var(--font-serif)', fontSize: '1.875rem', fontWeight: 600 }}
              >
                {Math.round(bd.inStatePct)}%
              </p>
              <p
                className="text-[#1C1C1A]/50 uppercase tracking-[0.08em] mt-2"
                style={{ fontSize: '0.625rem' }}
              >
                In-state
              </p>
              <p className="text-xs text-[#1C1C1A]/35 tabular-nums mt-0.5">
                {formatTotal(bd.inStateTotal)}
              </p>
            </div>

            {/* Out-of-state (neutral) */}
            <div className="flex-1 min-w-0">
              <p
                className="text-[#1C1C1A]/70 tabular-nums leading-none"
                style={{ fontFamily: 'var(--font-serif)', fontSize: '1.875rem', fontWeight: 600 }}
              >
                {Math.round(bd.outOfStatePct)}%
              </p>
              <p
                className="text-[#1C1C1A]/50 uppercase tracking-[0.08em] mt-2"
                style={{ fontSize: '0.625rem' }}
              >
                Out-of-state
              </p>
              <p className="text-xs text-[#1C1C1A]/35 tabular-nums mt-0.5">
                {formatTotal(bd.outOfStateTotal)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── §3 Top Contributors: the centerpiece ── */}
      {hasContributors && (
        <div>
          <SectionHeader tooltipTerm="topContributors" right="By organization">
            Top Contributors
          </SectionHeader>
          <p
            className="text-[#1C1C1A]/35 -mt-2 mb-2"
            style={{ fontSize: '0.6875rem' }}
          >
            Employee donations & PAC contributions by organization
          </p>

          <ul className="divide-y divide-[rgba(28,28,26,0.05)]">
            {visibleContributors.map(c => {
              const row = (
                <div className="flex items-center justify-between gap-3 py-2.5">
                  <span
                    className={`text-sm text-[#1C1C1A] leading-snug truncate ${
                      c.cmteId ? 'group-hover:text-[#7B5E8A] transition-colors' : ''
                    }`}
                  >
                    {prettyOrgName(c.orgName)}
                  </span>
                  <span
                    className="flex-shrink-0 text-base font-medium text-[#1C1C1A] tabular-nums"
                    style={{ fontFamily: 'var(--font-serif)' }}
                  >
                    {c.total}
                  </span>
                </div>
              )

              return (
                <li key={`${c.rank}-${c.orgName}`}>
                  {c.cmteId ? (
                    <Link href={`/donors/${c.cmteId}`} className="block group">
                      {row}
                    </Link>
                  ) : (
                    row
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── §4 Footer ── */}
      {fecUrl && (
        <div className="mt-6 pt-4 border-t border-[rgba(28,28,26,0.10)]">
          <div className="flex items-baseline justify-between gap-4">
            <p
              className="text-[#1C1C1A]/25 uppercase tracking-[0.10em]"
              style={{ fontSize: '0.5625rem', fontFamily: 'var(--font-serif)' }}
            >
              Source · FEC
            </p>
            <a
              href={fecUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1C1C1A]/40 hover:text-[#7B5E8A] transition-colors uppercase tracking-[0.08em]"
              style={{ fontSize: '0.5625rem' }}
            >
              View filing →
            </a>
          </div>
          <p className="text-[#1C1C1A]/25 mt-1.5" style={{ fontSize: '0.625rem' }}>
            FEC bulk filings. Combines employee donations &amp; PAC contributions by organization.
          </p>
        </div>
      )}
    </div>
  )
}
