'use client'

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
  cycle: number
  minCycle?: number
}

interface TopContributor {
  rank: number
  orgName: string
  total: string
}

interface DonorTabProps {
  pacDonors: Donor[]
  topContributors: TopContributor[]
  fundingBreakdown?: FundingBreakdown | null
  fecUrl?: string | null
}

// FEC data comes in ALL CAPS — convert to Title Case only if all-uppercase
function toTitleCase(s: string): string {
  const t = s.trim()
  if (t !== t.toUpperCase()) return t
  return t.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase())
}

function formatTotal(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${n.toLocaleString()}`
}

function fundingVerdict(bd: FundingBreakdown): { label: string; description: string } {
  if (bd.total <= 0) return { label: '', description: '' }
  const pacPct  = Math.round(bd.pacPct)
  const smallPct = Math.round(bd.individualSmallPct)
  const selfPct = Math.round(bd.selfFundedPct)
  const individualPct = Math.round(bd.individualLargePct + bd.individualSmallPct)

  if (pacPct >= 60)   return { label: 'Corporate-backed', description: `${pacPct}% of funding comes from PACs and corporate donors.` }
  if (smallPct >= 40) return { label: 'Grassroots-funded', description: `Primarily small-donor funded — ${smallPct}% from donations under $200.` }
  if (selfPct >= 25)  return { label: 'Self-funded', description: `Significantly self-funded — ${selfPct}% from the candidate's own money.` }
  return { label: 'Mixed funding', description: `${pacPct}% PAC money, ${individualPct}% from individual donors.` }
}

const UNINFORMATIVE = new Set(['Other', 'N/A', 'None', 'Various', 'Unknown', 'Na'])

function cleanList(list: Donor[]): Donor[] {
  return list
    .map(d => ({ ...d, name: toTitleCase(d.name) }))
    .filter(d => !UNINFORMATIVE.has(d.name))
    .slice(0, 6)
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
          <a href={fecUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#9B7FA6] hover:text-[#8a6e95]">
            View on FEC →
          </a>
        )}
      </div>
    )
  }

  const verdict = bd ? fundingVerdict(bd) : null

  return (
    <div className="p-5">

      {/* ── Funding Split ── */}
      {bd && (
        <div className="grid grid-cols-3 gap-3 mb-7">
          {/* Top row — primary sources */}
          <div className="bg-[#9B7FA6]/5 rounded-lg p-4 border border-[#9B7FA6]/10">
            <div
              className="text-[#9B7FA6] mb-0.5"
              style={{ fontSize: '2.25rem', fontWeight: 600, lineHeight: 1, fontFamily: 'var(--font-serif)' }}
            >
              {Math.round(bd.pacPct)}%
            </div>
            <div className="text-[#1C1C1A]/70 text-xs">PAC &amp; Corporate</div>
          </div>

          <div className="bg-[#E8E3DA]/40 rounded-lg p-4 border border-[rgba(28,28,26,0.08)]">
            <div
              className="text-[#1C1C1A]/70 mb-0.5"
              style={{ fontSize: '2.25rem', fontWeight: 600, lineHeight: 1, fontFamily: 'var(--font-serif)' }}
            >
              {Math.round(bd.individualLargePct)}%
            </div>
            <div className="text-[#1C1C1A]/60 text-xs">Large Individual</div>
          </div>

          <div className="bg-[#E8E3DA]/40 rounded-lg p-4 border border-[rgba(28,28,26,0.08)]">
            <div
              className="text-[#1C1C1A]/70 mb-0.5"
              style={{ fontSize: '2.25rem', fontWeight: 600, lineHeight: 1, fontFamily: 'var(--font-serif)' }}
            >
              {Math.round(bd.individualSmallPct)}%
            </div>
            <div className="text-[#1C1C1A]/60 text-xs">Small Donors (&lt;$200)</div>
          </div>

          {/* Bottom row — secondary sources */}
          <div className="bg-[#E8E3DA]/40 rounded-lg p-3 border border-[rgba(28,28,26,0.08)]">
            <div
              className="text-[#1C1C1A]/55 mb-0.5"
              style={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1, fontFamily: 'var(--font-serif)' }}
            >
              {Math.round(bd.partyContributionsPct)}%
            </div>
            <div className="text-[#1C1C1A]/45 text-xs">Party</div>
          </div>

          <div className="bg-[#E8E3DA]/40 rounded-lg p-3 border border-[rgba(28,28,26,0.08)]">
            <div
              className="text-[#1C1C1A]/55 mb-0.5"
              style={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1, fontFamily: 'var(--font-serif)' }}
            >
              {Math.round(bd.selfFundedPct)}%
            </div>
            <div className="text-[#1C1C1A]/45 text-xs">Self-Funded</div>
          </div>

          <div className="bg-[#E8E3DA]/40 rounded-lg p-3 border border-[rgba(28,28,26,0.08)]">
            <div
              className="text-[#1C1C1A]/55 mb-0.5"
              style={{ fontSize: '1.5rem', fontWeight: 600, lineHeight: 1, fontFamily: 'var(--font-serif)' }}
            >
              {Math.round(bd.otherPct)}%
            </div>
            <div className="text-[#1C1C1A]/45 text-xs">Other</div>
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      {bd && verdict && (
        <div className="mb-6 pb-6 border-b border-[rgba(28,28,26,0.06)]">
          <p className="text-[#1C1C1A]/80 leading-relaxed text-sm">
            <span className="font-medium text-[#1C1C1A]">{verdict.label}.</span>{' '}
            {verdict.description}
          </p>
          <p className="text-[#1C1C1A]/50 text-xs mt-1">
            {formatTotal(bd.total)} raised · {(bd.minCycle ?? bd.cycle) - 1}–{bd.cycle} cycle
          </p>
        </div>
      )}

      {/* ── Top Contributors (OpenSecrets-style: individuals + PACs combined) ── */}
      {hasContributors ? (
        <div className="mb-6">
          <div className="mb-3">
            <p
              className="text-[#1C1C1A]/50 uppercase tracking-wide mb-0.5"
              style={{ fontSize: '0.6875rem', fontWeight: 500, letterSpacing: '0.08em' }}
            >
              Top Contributors
            </p>
            <p className="text-[#1C1C1A]/40 text-xs">
              Employee donations &amp; PAC contributions by organization
              {bd ? ` · ${(bd.minCycle ?? bd.cycle) - 1}–${bd.cycle}` : ''}
            </p>
          </div>

          <div className="space-y-1.5">
            {topContributors.map((c, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2.5 border ${
                  i === 0
                    ? 'bg-[#F5F0E8] border-[rgba(28,28,26,0.06)]'
                    : 'bg-white border-[rgba(28,28,26,0.04)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="text-[#1C1C1A] text-sm truncate"
                    style={{ fontWeight: i === 0 ? 500 : 400 }}
                  >
                    {c.orgName}
                  </span>
                  <span
                    className={`flex-shrink-0 ${i === 0 ? 'text-[#9B7FA6]' : 'text-[#1C1C1A]/70'}`}
                    style={{
                      fontSize: i === 0 ? '1rem' : '0.875rem',
                      fontWeight: 600,
                      fontFamily: i === 0 ? 'var(--font-serif)' : undefined,
                    }}
                  >
                    {c.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : cleanPacDonors.length > 0 && (
        <div className="mb-6">
          <div className="mb-3">
            <p
              className="text-[#1C1C1A]/50 uppercase tracking-wide mb-0.5"
              style={{ fontSize: '0.6875rem', fontWeight: 500, letterSpacing: '0.08em' }}
            >
              Top PAC &amp; Interest Group Donors
            </p>
            <p className="text-[#1C1C1A]/40 text-xs">Political action committees &amp; corporate funds</p>
          </div>

          <div className="space-y-1.5">
            {cleanPacDonors.map((d, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2.5 border ${
                  i === 0
                    ? 'bg-[#F5F0E8] border-[rgba(28,28,26,0.06)]'
                    : 'bg-white border-[rgba(28,28,26,0.04)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span
                    className="text-[#1C1C1A] text-sm truncate"
                    style={{ fontWeight: i === 0 ? 500 : 400 }}
                  >
                    {d.name}
                  </span>
                  <span
                    className={`flex-shrink-0 ${i === 0 ? 'text-[#9B7FA6]' : 'text-[#1C1C1A]/70'}`}
                    style={{
                      fontSize: i === 0 ? '1rem' : '0.875rem',
                      fontWeight: 600,
                      fontFamily: i === 0 ? 'var(--font-serif)' : undefined,
                    }}
                  >
                    {d.amount}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      {fecUrl && (
        <div className="mt-6 pt-3 border-t border-[rgba(28,28,26,0.06)]">
          <a
            href={fecUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-[#1C1C1A]/30 hover:text-[#9B7FA6] transition-colors"
          >
            Data via FEC →
          </a>
          <p className="text-[10px] text-[#1C1C1A]/25 mt-1.5">
            Source: FEC bulk filings. Combines employee donations &amp; PAC contributions by organization.
          </p>
        </div>
      )}
    </div>
  )
}
