import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIdeologyLabel } from '@/lib/ideology'
import { mapStatus as mapBillStatusFull } from '@/lib/bills'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE    = 'https://api.congress.gov/v3'

function formatBillNumber(type: string, number: number): string {
  const types: Record<string, string> = {
    hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.',
  }
  return `${types[type.toLowerCase()] ?? type.toUpperCase()} ${number}`
}

function mapBillStatus(action?: string, introducedDate?: string) {
  return mapBillStatusFull(action, introducedDate)
}

type SettledResult<T> = { status: 'fulfilled'; value: T } | { status: 'rejected' }
function extract<T>(r: SettledResult<T>): T | null {
  return r.status === 'fulfilled' ? r.value : null
}
function sourceStatus(r: SettledResult<unknown>): 'ok' | 'error' {
  return r.status === 'fulfilled' ? 'ok' : 'error'
}

function isDonorDataStale(finishedAt: string | null | undefined): boolean {
  if (!finishedAt) return true
  return Date.now() - new Date(finishedAt).getTime() > 30 * 24 * 60 * 60 * 1000
}

async function fetchSponsoredBills(bioguideId: string) {
  if (!CONGRESS_API_KEY) return []
  const res = await fetch(
    `${CONGRESS_BASE}/member/${bioguideId}/sponsored-legislation?format=json&limit=10&api_key=${CONGRESS_API_KEY}`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return ((data.sponsoredLegislation ?? []) as any[])
    .filter((b: any) => b.congress && b.type && b.number)
    .map((b: any) => ({
    id:     `${b.congress}-${b.type.toLowerCase()}-${b.number}`,
    name:   b.title ?? '',
    number: formatBillNumber(b.type ?? '', b.number),
    status: mapBillStatus(b.latestAction?.text, b.introducedDate),
    date:   b.introducedDate
      ? new Date(b.introducedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '',
  }))
}

interface Donor { rank: number; name: string; amount: string; category: string; summary?: string }

interface TopContributor { rank: number; orgName: string; total: string }

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

const PAC_SKIP = new Set([
  'ACTBLUE', 'WINRED',
  'DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE', 'DSCC',
  'DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE', 'DCCC',
  'NRSC', 'NRCC',
  'NATIONAL REPUBLICAN SENATORIAL COMMITTEE',
  'NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE',
  'DEMOCRATIC NATIONAL COMMITTEE', 'DNC',
  'REPUBLICAN NATIONAL COMMITTEE', 'RNC',
  'SENATE MAJORITY PAC', 'HOUSE MAJORITY PAC',
  'SENATE LEADERSHIP FUND', 'CONGRESSIONAL LEADERSHIP FUND',
  "EMILY'S LIST", 'END CITIZENS UNITED',
])

async function fetchDonors(opts: {
  bioguideId: string
  fecIds: string[] | null
  supabase: Awaited<ReturnType<typeof createClient>>
}): Promise<{ donors: Donor[]; pacDonors: Donor[]; topContributors: TopContributor[]; fecUrl: string | null; fundingBreakdown: FundingBreakdown | null }> {
  const { bioguideId, fecIds, supabase } = opts
  const fecUrl = fecIds && fecIds.length > 0
    ? `https://www.fec.gov/data/candidate/${fecIds[0]}/`
    : null

  const [topPacsRes, fundingSummaryRes, topContributorsRes] = await Promise.allSettled([
    supabase
      .from('legislator_top_pacs')
      .select('rank, cmte_id, cmte_name, connected_org, direct_contribution, ie_for, ie_against, total_support, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .order('rank', { ascending: true })
      .limit(40),

    supabase
      .from('legislator_funding_summary')
      .select('total_receipts, pac_direct_total, pac_direct_pct, large_donor_total, large_donor_pct, small_donor_total, small_donor_pct, pol_pty_total, pol_pty_pct, self_funded_total, self_funded_pct, other_total, other_pct, superpac_ie_for, superpac_ie_against, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .limit(2),

    supabase
      .from('legislator_top_contributors')
      .select('rank, org_name, individual_total, pac_total, grand_total, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .order('rank', { ascending: true })
      .limit(40),
  ])

  // PAC donors — merge across cycles by committee, sum total_support, top 10
  const rawPacRows = topPacsRes.status === 'fulfilled' ? ((topPacsRes.value.data ?? []) as any[]) : []
  const pacMerged = new Map<string, { name: string; total: number; category: string }>()
  for (const row of rawPacRows) {
    const name = (row.cmte_name ?? '').toUpperCase().trim()
    if (!name || PAC_SKIP.has(name)) continue
    const key = row.cmte_id ?? name
    const existing = pacMerged.get(key)
    const support = Number(row.total_support ?? 0)
    if (existing) {
      existing.total += support
    } else {
      pacMerged.set(key, {
        name: row.cmte_name ?? row.connected_org ?? row.cmte_id,
        total: support,
        category: 'PAC',
      })
    }
  }
  const pacDonors: Donor[] = [...pacMerged.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d, i) => ({
      rank: i + 1,
      name: d.name,
      amount: `$${Math.round(d.total).toLocaleString()}`,
      category: d.category,
    }))

  // Top contributors — merge across cycles by org name, sum totals, top 10
  const rawContribRows = topContributorsRes.status === 'fulfilled' ? ((topContributorsRes.value.data ?? []) as any[]) : []
  const contribMerged = new Map<string, { orgName: string; total: number }>()
  for (const row of rawContribRows) {
    const orgName = (row.org_name ?? '').trim()
    if (!orgName) continue
    const existing = contribMerged.get(orgName)
    const total = Number(row.grand_total ?? 0)
    if (existing) {
      existing.total += total
    } else {
      contribMerged.set(orgName, { orgName, total })
    }
  }
  const topContributors: TopContributor[] = [...contribMerged.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d, i) => ({
      rank: i + 1,
      orgName: d.orgName,
      total: `$${Math.round(d.total).toLocaleString()}`,
    }))

  // Funding breakdown — aggregate across available cycles
  let fundingBreakdown: FundingBreakdown | null = null
  const fundingRows = fundingSummaryRes.status === 'fulfilled' ? ((fundingSummaryRes.value as any).data ?? []) as any[] : []
  if (fundingRows.length > 0) {
    const maxCycle = fundingRows[0].cycle
    const minCycle = fundingRows[fundingRows.length - 1].cycle

    const sum = (field: string) => fundingRows.reduce((acc: number, r: any) => acc + Number(r[field] ?? 0), 0)
    const total = sum('total_receipts')
    const pct = (val: number) => total > 0 ? (val / total) * 100 : 0

    const pac = sum('pac_direct_total')
    const individualLarge = sum('large_donor_total')
    const individualSmall = sum('small_donor_total')
    const partyContributions = sum('pol_pty_total')
    const selfFunded = sum('self_funded_total')
    const other = sum('other_total')

    fundingBreakdown = {
      pac,
      pacPct: pct(pac),
      individualLarge,
      individualLargePct: pct(individualLarge),
      individualSmall,
      individualSmallPct: pct(individualSmall),
      partyContributions,
      partyContributionsPct: pct(partyContributions),
      selfFunded,
      selfFundedPct: pct(selfFunded),
      other,
      otherPct: pct(other),
      total,
      superPacFor: sum('superpac_ie_for'),
      superPacAgainst: sum('superpac_ie_against'),
      cycle: maxCycle,
      minCycle,
    }
  }

  return { donors: [], pacDonors, topContributors, fecUrl, fundingBreakdown }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bioguideId } = await params
  const supabase = await createClient()

  // ── Tier 1: Local DB (fast, reliable) ─────────────────────────────────────
  const [legislatorRes, scoresRes, billVotesRes, committeesRes, lastDonorRunRes] = await Promise.allSettled([
    supabase
      .from('legislators')
      .select('*')
      .eq('bioguide_id', bioguideId)
      .maybeSingle(),

    supabase
      .from('member_scores')
      .select('nominate_dim1, nominate_dim2, num_votes')
      .eq('bioguide_id', bioguideId)
      .order('congress', { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from('bill_vote_positions')
      .select(`
        position,
        bill_vote_summaries (
          id, bill_id, chamber, date, title, question, result,
          yea_total, nay_total, yea_democrat, nay_democrat,
          yea_republican, nay_republican
        )
      `)
      .eq('bioguide_id', bioguideId)
      .order('bill_vote_summaries(date)', { ascending: false })
      .limit(20),

    supabase
      .from('committee_memberships')
      .select('title, committees(name, url, chamber)')
      .eq('bioguide_id', bioguideId),

    supabase
      .from('pipeline_runs')
      .select('finished_at')
      .eq('script', 'compute_funding_summaries')
      .eq('status', 'success')
      .or(`bioguide_id.eq.${bioguideId},bioguide_id.is.null`)
      .order('finished_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const legislator      = extract(legislatorRes)?.data
  const scores          = extract(scoresRes)?.data
  const voteRows        = extract(billVotesRes)?.data ?? []
  const commRows        = extract(committeesRes)?.data ?? []
  const lastDonorRun    = extract(lastDonorRunRes)?.data

  // ── Tier 2: External APIs ──────────────────────────────────────────────────
  const [sponsoredRes, donorsRes] = await Promise.allSettled([
    fetchSponsoredBills(bioguideId),
    fetchDonors({ bioguideId, fecIds: (legislator as any)?.fec_ids ?? null, supabase }),
  ])

  // If not in DB yet, fall back to Congress.gov
  if (!legislator && CONGRESS_API_KEY) {
    const fallback = await fetch(
      `${CONGRESS_BASE}/member/${bioguideId}?format=json&api_key=${CONGRESS_API_KEY}`,
      { next: { revalidate: 3600 } }
    )
    if (!fallback.ok) {
      if (fallback.status === 404) return NextResponse.json({ error: 'Politician not found' }, { status: 404 })
      return NextResponse.json({ error: 'Congress.gov API error' }, { status: fallback.status })
    }
    const { member } = await fallback.json()
    const terms: any[] = member.terms?.item ?? []
    const latestTerm = terms.at(-1) ?? {}
    const firstTerm  = terms[0] ?? {}
    const party = latestTerm.party ?? member.partyHistory?.[0]?.partyName ?? 'Unknown'
    const normalizedParty =
      party.toLowerCase().includes('democrat')   ? 'Democrat' :
      party.toLowerCase().includes('republican') ? 'Republican' : 'Independent'
    const isSenate = (latestTerm.chamber ?? '').toLowerCase() === 'senate'
    const yearsInOffice = firstTerm.startYear ? new Date().getFullYear() - firstTerm.startYear : 0
    const termLength = isSenate ? 6 : 2
    const currentTermStart: number | undefined = latestTerm.startYear
    const nextElectionYear = currentTermStart
      ? (() => { let y = currentTermStart + termLength; const now = new Date().getFullYear(); while (y <= now) y += termLength; return y })()
      : null

    const bills = extract(sponsoredRes) ?? []
    const { donors, pacDonors, topContributors, fecUrl, fundingBreakdown } = extract(donorsRes) ?? { donors: [], pacDonors: [], topContributors: [], fecUrl: null, fundingBreakdown: null }

    return NextResponse.json({
      politician: {
        id: bioguideId, bioguideId,
        name: member.directOrderName ?? '',
        title: latestTerm.memberType ?? (isSenate ? 'U.S. Senator' : 'U.S. Representative'),
        party: normalizedParty as 'Democrat' | 'Republican' | 'Independent',
        state: latestTerm.stateName ?? '', stateCode: latestTerm.stateCode ?? '',
        district: latestTerm.district ? `${latestTerm.district}th District` : undefined,
        since: firstTerm.startYear?.toString() ?? null,
        photo: member.depiction?.imageUrl ?? null,
        photoCredit: member.depiction?.attribution ?? null,
        website: member.officialWebsiteUrl ?? null,
        address: member.addressInformation?.officeAddress ?? null,
        phone: member.addressInformation?.phoneNumber ?? null,
        fecUrl,
        stats: { yearsInOffice, attendance: null, ideologyScore: null, ideologyLabel: null, billVotesCast: 0, votedWithParty: null },
        nextElectionYear, votes: [], billVotes: [], bills, donors, pacDonors, topContributors, fundingBreakdown, committees: [],
        donorAlignmentSyncedAt:  (lastDonorRun as any)?.finished_at ?? null,
        donorAlignmentIsStale:   isDonorDataStale((lastDonorRun as any)?.finished_at),
        _sources: {
          profile: 'congress.gov-fallback', ideology: 'unavailable',
          votes: 'unavailable', committees: 'unavailable',
          legislation: sourceStatus(sponsoredRes), donors: sourceStatus(donorsRes),
        },
      },
    })
  }

  if (!legislator) {
    return NextResponse.json({ error: 'Politician not found' }, { status: 404 })
  }

  // ── Build billVotes with withParty ─────────────────────────────────────────
  const party = legislator.party

  const billVotes = (voteRows as any[])
    .map((row: any) => {
      const summary = row.bill_vote_summaries
      if (!summary) return null
      const position: string = row.position
      const partyKey = party.toLowerCase()
      const partyYeas = summary[`yea_${partyKey}`] ?? 0
      const partyNays = summary[`nay_${partyKey}`] ?? 0
      const partyMajority = partyYeas >= partyNays ? 'Yea' : 'Nay'
      return {
        billId:    summary.bill_id,
        date:      summary.date,
        position,
        result:    `${summary.result} (${summary.yea_total}-${summary.nay_total})`,
        withParty: position === partyMajority,
        question:  summary.title || summary.question,
        chamber:   summary.chamber,
        voteId:    summary.id,
      }
    })
    .filter(Boolean)

  const billVotesCast  = billVotes.length
  const votedWithParty = billVotesCast > 0
    ? Math.round((billVotes.filter((v: any) => v.withParty).length / billVotesCast) * 1000) / 10
    : null

  const committees = (commRows as any[]).map((r: any) => ({
    name:    r.committees?.name ?? '',
    url:     r.committees?.url ?? null,
    chamber: r.committees?.chamber ?? null,
    title:   r.title ?? null,
  }))

  const isSenate = legislator.chamber === 'senate'
  const rawTerms: any[] = legislator.raw_json?.terms ?? []
  const firstTermStart = rawTerms[0]?.start ?? legislator.term_start
  const yearsInOffice = firstTermStart
    ? new Date().getFullYear() - new Date(firstTermStart).getFullYear()
    : 0
  const termLength = isSenate ? 6 : 2
  const nextElectionYear = legislator.next_election
    ?? (legislator.term_end ? new Date(legislator.term_end).getFullYear() : null)
    ?? (legislator.term_start
        ? (() => { let y = new Date(legislator.term_start).getFullYear() + termLength; const now = new Date().getFullYear(); while (y <= now) y += termLength; return y })()
        : null)

  const bills  = extract(sponsoredRes) ?? []
  const { donors, pacDonors, topContributors, fecUrl, fundingBreakdown } = extract(donorsRes) ?? { donors: [], pacDonors: [], topContributors: [], fecUrl: null, fundingBreakdown: null }

  const votes = billVotes.map((v: any) => ({
    id:             v.voteId,
    bill:           v.question,
    billId:         v.billId ?? null,
    date:           v.date,
    vote:           v.position as 'Yea' | 'Nay',
    donorAlignments: [],
  }))

  return NextResponse.json({
    politician: {
      id: bioguideId,
      bioguideId,
      name:        legislator.full_name,
      title:       legislator.title,
      party:       legislator.party as 'Democrat' | 'Republican' | 'Independent',
      state:       legislator.state_full,
      stateCode:   legislator.state,
      district:    legislator.district ? `${legislator.district}th District` : undefined,
      since:       (() => { const rawTerms: any[] = legislator.raw_json?.terms ?? []; const firstStart = rawTerms[0]?.start ?? legislator.term_start; return firstStart ? new Date(firstStart).getFullYear().toString() : null })(),
      photo:       legislator.photo_url,
      photoCredit: null,
      website:     legislator.website,
      address:     legislator.address,
      phone:       legislator.phone,
      twitter:     legislator.twitter,
      fecUrl,
      stats: {
        yearsInOffice,
        attendance:    null,
        ideologyScore: scores?.nominate_dim1 ?? null,
        ideologyLabel: getIdeologyLabel(scores?.nominate_dim1 ?? null),
        billVotesCast,
        votedWithParty,
      },
      nextElectionYear,
      votes,
      billVotes,
      bills,
      donors,
      pacDonors,
      topContributors,
      fundingBreakdown,
      committees,
      donorAlignmentSyncedAt:  (lastDonorRun as any)?.finished_at ?? null,
      donorAlignmentIsStale:   isDonorDataStale((lastDonorRun as any)?.finished_at),
      _sources: {
        profile:     sourceStatus(legislatorRes),
        ideology:    sourceStatus(scoresRes),
        votes:       sourceStatus(billVotesRes),
        committees:  sourceStatus(committeesRes),
        legislation: sourceStatus(sponsoredRes),
        donors:      sourceStatus(donorsRes),
      },
    },
  })
}
