

import { Link } from '@tanstack/react-router'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import type { FecTermKey } from '@/lib/fec'
import { formatTotal, toTitleCase } from '@/lib/format'
import { STATUS_STYLES, STAT_MONEY_CLASS } from '@/lib/ui'

interface Donor {
  rank?: number
  name?: string
  cmteId?: string
  cmteName?: string | null
  amount?: string
  category?: string
  summary?: string
  directContribution?: number
  ieFor?: number
  totalSupport?: number
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
  // Simple API shape
  pacDirectTotal?: number
  superpacIeFor?: number
  superpacIeAgainst?: number
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

const UNINFORMATIVE = new Set(['OTHER', 'N/A', 'NONE', 'VARIOUS', 'UNKNOWN', 'NA'])

function cleanList(list: Donor[]): Donor[] {
  return list
    .filter(d => {
      const label = d.name || d.cmteName || ''
      return label && !UNINFORMATIVE.has(label.toUpperCase())
    })
    .slice(0, 6)
}

function donorDisplayName(d: Donor): string {
  return d.name || d.cmteName || 'Unknown'
}

function donorDisplayAmount(d: Donor): string {
  if (d.amount) return d.amount
  if (d.totalSupport != null) return formatTotal(d.totalSupport)
  if (d.directContribution != null) return formatTotal(d.directContribution)
  return '$0'
}

function cycleLabel(bd: FundingBreakdown): string {
  if (bd.minCycle && bd.minCycle !== bd.cycle) return `${bd.minCycle}–${bd.cycle}`
  return String(bd.cycle)
}

/* ── Section label — matches sidebar uppercase eyebrow pattern ── */
function SectionLabel({
  children,
  tooltipTerm,
  meta,
}: {
  children: React.ReactNode
  tooltipTerm?: FecTermKey
  meta?: React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-3">
      <p className="text-xs text-fg/50 uppercase tracking-wide inline-flex items-center gap-1">
        {children}
        {tooltipTerm && <InfoTooltip term={tooltipTerm} />}
      </p>
      {meta && (
        <span className="text-fg/30 uppercase tracking-[0.08em] flex-shrink-0" style={{ fontSize: '0.5625rem' }}>
          {meta}
        </span>
      )}
    </div>
  )
}

/* ── Horizontal bar segment used in funding breakdown ── */
function FundingRow({
  label,
  amount,
  pct,
  color,
  maxPct,
  tooltipTerm,
}: {
  label: string
  amount: number
  pct: number
  color: string
  maxPct: number
  tooltipTerm?: FecTermKey
}) {
  const barWidth = maxPct > 0 ? (pct / maxPct) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-fg/60 w-[130px] flex-shrink-0 truncate inline-flex items-center gap-1">
        {label}
        {tooltipTerm && <InfoTooltip term={tooltipTerm} />}
      </span>
      <div className="flex-1 flex items-center gap-2.5 min-w-0">
        <div className="flex-1 h-1.5 bg-fg/[0.08] rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${barWidth}%`, minWidth: pct > 0 ? 3 : 0 }}
          />
        </div>
        <span className="text-xs text-fg tabular-nums w-8 text-right flex-shrink-0 font-mono">
          {Math.round(pct)}%
        </span>
      </div>
      <span className="text-xs text-fg/38 tabular-nums flex-shrink-0 w-14 text-right font-mono">
        {formatTotal(amount)}
      </span>
    </div>
  )
}

export function DonorTab({ pacDonors, topContributors, fundingBreakdown, fecUrl }: DonorTabProps) {
  // Support both rich (OpenSecrets-style) and simple (FEC-computed) funding data
  const bd = fundingBreakdown && (fundingBreakdown.total > 0 || (fundingBreakdown.pacDirectTotal ?? 0) > 0) ? fundingBreakdown : null
  const cleanPacDonors = cleanList(pacDonors)
  const hasContributors = topContributors.length > 0
  const hasDonorData = hasContributors || cleanPacDonors.length > 0

  if (!hasDonorData && !bd) {
    return (
      <div className="px-6 py-12 text-center">
        <p className="text-[13px] text-fg/45">Donor data unavailable.</p>
        {fecUrl && (
          <a href={fecUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:text-accent/80 mt-2 inline-block">
            View on FEC →
          </a>
        )}
      </div>
    )
  }

  const geoTotal = bd ? bd.inStateTotal + bd.outOfStateTotal : 0
  const hasGeo = bd !== null && geoTotal > 0

  const fundingRows = bd
    ? ([
        { label: 'PAC & Corporate', amount: bd.pac, pct: bd.pacPct, color: 'bg-accent-deep', tooltipTerm: 'pacAndCorporate' as FecTermKey },
        { label: 'Large Individual', amount: bd.individualLarge, pct: bd.individualLargePct, color: 'bg-accent-deep/50', tooltipTerm: 'largeIndividual' as FecTermKey },
        { label: 'Small Donors', amount: bd.individualSmall, pct: bd.individualSmallPct, color: 'bg-accent-deep/25', tooltipTerm: 'smallDonors' as FecTermKey },
        { label: 'Other', amount: bd.other, pct: bd.otherPct, color: 'bg-fg/20', tooltipTerm: 'otherFunding' as FecTermKey },
      ]).filter(r => r.pct > 0)
    : []

  const maxPct = Math.max(...fundingRows.map(r => r.pct), 0)
  const visibleContributors = topContributors.slice(0, 5)

  return (
    <div className="px-5 py-5 sm:px-6 space-y-6">

      {/* ── Funding Breakdown (rich data from OpenSecrets-style source) ── */}
      {bd && bd.total > 0 && (
        <div>
          <SectionLabel meta={`Cycle ${cycleLabel(bd)}`}>
            Funding Breakdown
          </SectionLabel>

          {/* Hero total */}
          <p className={`text-2xl tabular-nums leading-none mb-1 font-mono font-semibold ${STAT_MONEY_CLASS}`}>
            {formatTotal(bd.total)}
          </p>
          <p className="text-accent uppercase tracking-[0.10em] mb-5" style={{ fontSize: '0.5625rem' }}>
            Total receipts
          </p>

          {/* Stacked bar overview */}
          <div className="flex h-2.5 rounded-full overflow-hidden bg-fg/[0.08] mb-5">
            {bd.pacPct > 0 && (
              <div className="bg-accent-deep" style={{ width: `${bd.pacPct}%`, minWidth: 2 }} />
            )}
            {bd.individualLargePct > 0 && (
              <div className="bg-accent-deep/50" style={{ width: `${bd.individualLargePct}%`, minWidth: 2 }} />
            )}
            {bd.individualSmallPct > 0 && (
              <div className="bg-accent-deep/25" style={{ width: `${bd.individualSmallPct}%`, minWidth: 2 }} />
            )}
            {bd.otherPct > 0 && (
              <div className="bg-fg/20" style={{ width: `${bd.otherPct}%`, minWidth: 2 }} />
            )}
          </div>

          {/* Individual breakdown bars */}
          <div className="space-y-2.5">
            {fundingRows.map(row => (
              <FundingRow key={row.label} {...row} maxPct={maxPct} />
            ))}
          </div>
        </div>
      )}

      {/* ── Geographic Breakdown ── */}
      {hasGeo && bd && bd.total > 0 && (
        <div className="border-t border-edge pt-6">
          <SectionLabel
            tooltipTerm="inOutState"
            meta={
              <span className="inline-flex items-center gap-0.5">
                Itemized
                <InfoTooltip term="itemized" />
                <span className="mx-0.5">·</span>
                PAC excluded
              </span>
            }
          >
            Geographic Breakdown
          </SectionLabel>

          <div className="grid grid-cols-2 gap-5">
            {/* In-state */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-xs text-fg/50 uppercase tracking-wide">In-state</p>
                <p className="text-[13px] text-accent tabular-nums font-medium font-mono">
                  {Math.round(bd.inStatePct)}%
                </p>
              </div>
              <div className="h-1.5 bg-fg/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-deep rounded-full"
                  style={{ width: `${bd.inStatePct}%` }}
                />
              </div>
              <p className="text-xs text-fg/35 tabular-nums mt-1.5 font-mono">{formatTotal(bd.inStateTotal)}</p>
            </div>

            {/* Out-of-state */}
            <div>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-xs text-fg/50 uppercase tracking-wide">Out-of-state</p>
                <p className="text-[13px] text-fg/70 tabular-nums font-medium font-mono">
                  {Math.round(bd.outOfStatePct)}%
                </p>
              </div>
              <div className="h-1.5 bg-fg/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-fg/25 rounded-full"
                  style={{ width: `${bd.outOfStatePct}%` }}
                />
              </div>
              <p className="text-xs text-fg/35 tabular-nums mt-1.5 font-mono">{formatTotal(bd.outOfStateTotal)}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Contributors ── */}
      {hasContributors && (
        <div className="border-t border-edge pt-6">
          <SectionLabel tooltipTerm="topContributors" meta="By organization">
            Top Contributors
          </SectionLabel>
          <p className="text-fg/35 -mt-1 mb-3" style={{ fontSize: '0.6875rem' }}>
            PAC contributions by parent organization
          </p>

          <div className="divide-y divide-edge-soft">
            {visibleContributors.map(c => {
              const content = (
                <div className="flex items-center gap-2.5 py-2.5">
                  <span
                    className="w-5 h-5 rounded-full bg-fg/[0.06] flex items-center justify-center flex-shrink-0 text-[10px] text-fg/45 tabular-nums font-medium"
                  >
                    {c.rank}
                  </span>
                  <span
                    className={`text-[13px] text-fg leading-snug truncate flex-1 ${
                      c.cmteId ? 'group-hover:text-accent transition-colors' : ''
                    }`}
                  >
                    {toTitleCase(c.orgName)}
                  </span>
                  <span className={`flex-shrink-0 text-[13px] font-medium tabular-nums font-mono ${STAT_MONEY_CLASS}`}>
                    {c.total}
                  </span>
                </div>
              )

              return c.cmteId ? (
                <Link key={`${c.rank}-${c.orgName}`} to="/donors/$cmteId" params={{ cmteId: c.cmteId }} className="block group hover:bg-raised -mx-2 px-2 rounded-lg transition-colors">
                  {content}
                </Link>
              ) : (
                <div key={`${c.rank}-${c.orgName}`}>
                  {content}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Top PAC Donors (from API) ── */}
      {cleanPacDonors.length > 0 && !hasContributors && (
        <div className="border-t border-edge pt-6">
          <SectionLabel tooltipTerm="pacAndCorporate">
            Top PAC Donors
          </SectionLabel>
          <div className="divide-y divide-edge-soft">
            {cleanPacDonors.map((d, i) => {
              const label = donorDisplayName(d)
              const amt = donorDisplayAmount(d)
              const content = (
                <div className="flex items-center gap-2.5 py-2.5">
                  <span className="w-5 h-5 rounded-full bg-fg/[0.06] flex items-center justify-center flex-shrink-0 text-[10px] text-fg/45 tabular-nums font-medium">
                    {i + 1}
                  </span>
                  <span className="text-[13px] text-fg leading-snug truncate flex-1 group-hover:text-accent transition-colors">
                    {label}
                  </span>
                  <span className={`flex-shrink-0 text-[13px] font-medium tabular-nums font-mono ${STAT_MONEY_CLASS}`}>
                    {amt}
                  </span>
                </div>
              )
              return d.cmteId ? (
                <Link key={d.cmteId} to="/donors/$cmteId" params={{ cmteId: d.cmteId }} className="block group hover:bg-raised -mx-2 px-2 rounded-lg transition-colors">
                  {content}
                </Link>
              ) : (
                <div key={`${i}-${label}`}>{content}</div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Simple Funding Summary (when no rich breakdown) ── */}
      {!bd?.total && bd?.pacDirectTotal != null && (
        <div className="border-t border-edge pt-6">
          <SectionLabel>Funding Summary</SectionLabel>
          <div className="space-y-1.5">
            {bd.pacDirectTotal > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-fg/60">PAC Direct</span>
                <span className={`tabular-nums font-mono ${STAT_MONEY_CLASS}`}>{formatTotal(bd.pacDirectTotal)}</span>
              </div>
            )}
            {(bd.superpacIeFor ?? 0) > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-fg/60">Super PAC Support</span>
                <span className={`${STATUS_STYLES.Passed.text} tabular-nums font-mono`}>{formatTotal(bd.superpacIeFor!)}</span>
              </div>
            )}
            {(bd.superpacIeAgainst ?? 0) > 0 && (
              <div className="flex justify-between text-[13px]">
                <span className="text-fg/60">Super PAC Opposition</span>
                <span className={`${STATUS_STYLES.Failed.text} tabular-nums font-mono`}>{formatTotal(bd.superpacIeAgainst!)}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Source Footer ── */}
      {fecUrl && (
        <div className="border-t border-edge pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="text-fg/25 uppercase tracking-[0.10em]" style={{ fontSize: '0.5625rem' }}>
              Source · FEC
            </p>
            <a
              href={fecUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-fg/40 hover:text-accent transition-colors uppercase tracking-[0.08em]"
              style={{ fontSize: '0.5625rem' }}
            >
              View filing →
            </a>
          </div>
          <p className="text-fg/25 mt-1.5" style={{ fontSize: '0.625rem' }}>
            FEC bulk filings. Combines employee donations &amp; PAC contributions by organization.
          </p>
        </div>
      )}
    </div>
  )
}
