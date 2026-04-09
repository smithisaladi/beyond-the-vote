import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIdeologyLabel } from '@/lib/ideology'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE    = 'https://api.congress.gov/v3'

function formatBillNumber(type: string, number: number): string {
  const types: Record<string, string> = {
    hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.',
  }
  return `${types[type.toLowerCase()] ?? type.toUpperCase()} ${number}`
}

function mapBillStatus(action?: string): 'Passed' | 'Pending' | 'Failed' {
  const a = (action ?? '').toLowerCase()
  if (a.includes('became public law') || a.includes('signed by president') || a.includes('passed')) return 'Passed'
  if (a.includes('failed') || a.includes('vetoed')) return 'Failed'
  return 'Pending'
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
    status: mapBillStatus(b.latestAction?.text),
    date:   b.introducedDate
      ? new Date(b.introducedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '',
  }))
}

interface Donor { rank: number; name: string; amount: string; category: string; summary?: string }

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
}): Promise<{ donors: Donor[]; pacDonors: Donor[]; fecUrl: string | null; fundingBreakdown: FundingBreakdown | null }> {
  const { bioguideId, fecIds, supabase } = opts
  const fecUrl = fecIds && fecIds.length > 0
    ? `https://www.fec.gov/data/candidate/${fecIds[0]}/`
    : null

  const [topPacsRes, fundingSummaryRes] = await Promise.allSettled([
    supabase
      .from('legislator_top_pacs')
      .select('rank, cmte_id, cmte_name, connected_org, industry, direct_contribution, ie_for, ie_against, total_support, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .order('rank', { ascending: true })
      .limit(20),

    supabase
      .from('legislator_funding_summary')
      .select('total_receipts, pac_direct_total, pac_direct_pct, large_donor_total, large_donor_pct, small_donor_total, small_donor_pct, pol_pty_total, pol_pty_pct, self_funded_total, self_funded_pct, other_total, other_pct, superpac_ie_for, superpac_ie_against, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // PAC donors from pre-computed top PACs — filter skip list, top 10
  const rawPacRows = topPacsRes.status === 'fulfilled' ? ((topPacsRes.value.data ?? []) as any[]) : []
  const pacDonors: Donor[] = rawPacRows
    .filter((row: any) => {
      const name = (row.cmte_name ?? '').toUpperCase().trim()
      return name && !PAC_SKIP.has(name)
    })
    .slice(0, 10)
    .map((row: any, i: number) => ({
      rank: row.rank ?? i + 1,
      name: row.cmte_name ?? row.connected_org ?? row.cmte_id,
      amount: `$${Math.round(Number(row.total_support ?? 0)).toLocaleString()}`,
      category: row.industry ?? 'PAC',
    }))

  // Funding breakdown from pre-computed summary
  let fundingBreakdown: FundingBreakdown | null = null
  const totalsRow = fundingSummaryRes.status === 'fulfilled' ? (fundingSummaryRes.value.data as any) : null
  if (totalsRow) {
    fundingBreakdown = {
      pac: Number(totalsRow.pac_direct_total ?? 0),
      pacPct: Number(totalsRow.pac_direct_pct ?? 0),
      individualLarge: Number(totalsRow.large_donor_total ?? 0),
      individualLargePct: Number(totalsRow.large_donor_pct ?? 0),
      individualSmall: Number(totalsRow.small_donor_total ?? 0),
      individualSmallPct: Number(totalsRow.small_donor_pct ?? 0),
      partyContributions: Number(totalsRow.pol_pty_total ?? 0),
      partyContributionsPct: Number(totalsRow.pol_pty_pct ?? 0),
      selfFunded: Number(totalsRow.self_funded_total ?? 0),
      selfFundedPct: Number(totalsRow.self_funded_pct ?? 0),
      other: Number(totalsRow.other_total ?? 0),
      otherPct: Number(totalsRow.other_pct ?? 0),
      total: Number(totalsRow.total_receipts ?? 0),
      superPacFor: Number(totalsRow.superpac_ie_for ?? 0),
      superPacAgainst: Number(totalsRow.superpac_ie_against ?? 0),
      cycle: totalsRow.cycle,
    }
  }

  return { donors: [], pacDonors, fecUrl, fundingBreakdown }
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
    const { donors, pacDonors, fecUrl, fundingBreakdown } = extract(donorsRes) ?? { donors: [], pacDonors: [], fecUrl: null, fundingBreakdown: null }

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
        nextElectionYear, votes: [], billVotes: [], bills, donors, pacDonors, fundingBreakdown, committees: [],
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

  // Fetch bill titles for the votes so we can show descriptive names
  const voteBillIds = [...new Set(
    (voteRows as any[])
      .map((r: any) => r.bill_vote_summaries?.bill_id)
      .filter(Boolean)
  )]
  const billTitleMap: Record<string, string> = {}
  if (voteBillIds.length > 0) {
    const { data: billRows } = await supabase
      .from('bills')
      .select('bill_id, title, bill_number')
      .in('bill_id', voteBillIds)
    for (const b of billRows ?? []) {
      billTitleMap[b.bill_id] = b.title ?? b.bill_number ?? ''
    }
  }

  const billVotes = (voteRows as any[])
    .map((row: any) => {
      const summary = row.bill_vote_summaries
      if (!summary) return null
      const position: string = row.position
      const partyKey = party.toLowerCase()
      const partyYeas = summary[`yea_${partyKey}`] ?? 0
      const partyNays = summary[`nay_${partyKey}`] ?? 0
      const partyMajority = partyYeas >= partyNays ? 'Yea' : 'Nay'
      const billTitle = billTitleMap[summary.bill_id]
      return {
        billId:    summary.bill_id,
        date:      summary.date,
        position,
        result:    `${summary.result} (${summary.yea_total}-${summary.nay_total})`,
        withParty: position === partyMajority,
        question:  billTitle || summary.question,
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
  const { donors, pacDonors, fecUrl, fundingBreakdown } = extract(donorsRes) ?? { donors: [], pacDonors: [], fecUrl: null, fundingBreakdown: null }

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
