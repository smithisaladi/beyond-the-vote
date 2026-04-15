import { createClient } from '@/lib/supabase/server'
import RepresentativeDetailPage from '@/components/representatives/RepresentativeDetailPage'
import type { Politician, DonorAlignment } from '@/hooks/useFetchPoliticianDetail'
import type { Party } from '@/lib/types'

// Supabase row shapes for this page. Each interface mirrors the columns/nested selections used
// in the query below. Mirrors the pattern established in app/api/politicians/[id]/route.ts.
interface LegislatorRow {
  bioguide_id: string
  full_name: string
  title: string
  party: string
  state: string
  state_full: string
  district: number | null
  chamber: string
  term_start: string | null
  term_end: string | null
  next_election: number | null
  photo_url: string | null
  website: string | null
  address: string | null
  phone: string | null
  fec_ids: string[] | null
  raw_json: { terms?: Array<{ start?: string }> } | null
}

interface MemberScoreRow {
  nominate_dim1: number | null
}

interface CommitteeRow {
  title: string | null
  committees: {
    name: string
    url: string | null
    chamber: string | null
  } | null
}

interface PipelineRunRow {
  finished_at: string | null
}

interface TopPacRow {
  rank: number
  cmte_id: string
  cmte_name: string
  connected_org: string | null
  direct_contribution: number | null
  ie_for: number | null
  ie_against: number | null
  total_support: number | null
  cycle: number | null
}

interface TopContributorRow {
  rank: number
  org_name: string
  individual_total: number
  pac_total: number
  grand_total: number
  cycle: number
}

interface FundingSummaryRow {
  total_receipts: number | null
  pac_direct_total: number | null
  pac_direct_pct: number | null
  large_donor_total: number | null
  large_donor_pct: number | null
  small_donor_total: number | null
  small_donor_pct: number | null
  pol_pty_total: number | null
  pol_pty_pct: number | null
  self_funded_total: number | null
  self_funded_pct: number | null
  other_total: number | null
  other_pct: number | null
  superpac_ie_for: number | null
  superpac_ie_against: number | null
  in_state_total: number | null
  out_of_state_total: number | null
  dc_donor_total: number | null
  cycle: number
}

interface VotePositionRow {
  position: string
  bill_vote_summaries: {
    id: string
    bill_id: string | null
    chamber: string
    date: string | null
    title: string | null
    question: string | null
    result: string
    yea_total: number
    nay_total: number
    yea_democrat: number
    nay_democrat: number
    yea_republican: number
    nay_republican: number
  } | null
}

function isDonorDataStale(finishedAt: string | null | undefined): boolean {
  if (!finishedAt) return true
  return Date.now() - new Date(finishedAt).getTime() > 30 * 24 * 60 * 60 * 1000
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

export default async function RepresentativePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: bioguideId } = await params
  const supabase = await createClient()

  const [legislatorRes, scoresRes, committeesRes, lastDonorRunRes, topPacsRes, fundingSummaryRes, topContributorsRes, votesRes] = await Promise.allSettled([
    supabase
      .from('legislators')
      .select('*')
      .eq('bioguide_id', bioguideId)
      .maybeSingle(),

    supabase
      .from('member_scores')
      .select('nominate_dim1')
      .eq('bioguide_id', bioguideId)
      .order('congress', { ascending: false })
      .limit(1)
      .maybeSingle(),

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

    supabase
      .from('legislator_top_pacs')
      .select('rank, cmte_id, cmte_name, connected_org, direct_contribution, ie_for, ie_against, total_support, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .order('rank', { ascending: true })
      .limit(40),

    supabase
      .from('legislator_funding_summary')
      .select('total_receipts, pac_direct_total, pac_direct_pct, large_donor_total, large_donor_pct, small_donor_total, small_donor_pct, pol_pty_total, pol_pty_pct, self_funded_total, self_funded_pct, other_total, other_pct, superpac_ie_for, superpac_ie_against, in_state_total, out_of_state_total, dc_donor_total, cycle')
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
      .limit(50),
  ])

  const legislator = legislatorRes.status === 'fulfilled'
    ? (legislatorRes.value.data as LegislatorRow | null)
    : null
  if (!legislator) {
    return <RepresentativeDetailPage id={bioguideId} />
  }

  const scores = scoresRes.status === 'fulfilled'
    ? (scoresRes.value.data as MemberScoreRow | null)
    : null
  const commRows: CommitteeRow[] = committeesRes.status === 'fulfilled'
    ? ((committeesRes.value.data as CommitteeRow[] | null) ?? [])
    : []
  const lastDonorRun: PipelineRunRow | null = lastDonorRunRes.status === 'fulfilled'
    ? (lastDonorRunRes.value.data as PipelineRunRow | null)
    : null

  // Committees
  const committees = commRows.map(r => ({
    name: r.committees?.name ?? '',
    url: r.committees?.url ?? null,
    title: r.title ?? null,
  }))

  // Votes — look up bill titles
  const rawVotes: VotePositionRow[] = votesRes.status === 'fulfilled'
    ? ((votesRes.value.data as VotePositionRow[] | null) ?? [])
    : []
  const billIds = [...new Set(
    rawVotes.map(row => row.bill_vote_summaries?.bill_id).filter((v): v is string => Boolean(v))
  )]
  const billTitleMap: Record<string, string> = {}
  if (billIds.length > 0) {
    const { data: billRows } = await supabase
      .from('bills')
      .select('bill_id, title')
      .in('bill_id', billIds)
    for (const row of (billRows ?? []) as Array<{ bill_id: string; title: string | null }>) {
      if (row.title) billTitleMap[row.bill_id] = row.title
    }
  }
  const votes = rawVotes
    .map(row => {
      const summary = row.bill_vote_summaries
      if (!summary) return null
      const billTitle = summary.bill_id ? billTitleMap[summary.bill_id] : null
      return {
        id: summary.id,
        bill: billTitle || summary.title || summary.question || '',
        billId: summary.bill_id ?? null,
        billTitle: billTitle ?? '',
        date: summary.date
          ? new Date(summary.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '',
        vote: row.position as 'Yea' | 'Nay',
        question: summary.question ?? null,
        donorAlignments: [] as DonorAlignment[],
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  // PAC donors
  const rawPacRows: TopPacRow[] = topPacsRes.status === 'fulfilled'
    ? ((topPacsRes.value.data as TopPacRow[] | null) ?? [])
    : []
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
      pacMerged.set(key, { name: row.cmte_name ?? row.connected_org ?? row.cmte_id, total: support, category: 'PAC' })
    }
  }
  const pacDonors = [...pacMerged.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d, i) => ({ rank: i + 1, name: d.name, amount: `$${Math.round(d.total).toLocaleString()}`, category: d.category }))

  // Top contributors
  const rawContribRows: TopContributorRow[] = topContributorsRes.status === 'fulfilled'
    ? ((topContributorsRes.value.data as TopContributorRow[] | null) ?? [])
    : []
  const contribMerged = new Map<string, { orgName: string; total: number }>()
  for (const row of rawContribRows) {
    const orgName = (row.org_name ?? '').trim()
    if (!orgName) continue
    const existing = contribMerged.get(orgName)
    const total = Number(row.grand_total ?? 0)
    if (existing) { existing.total += total } else { contribMerged.set(orgName, { orgName, total }) }
  }
  const topContributors = [...contribMerged.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d, i) => ({ rank: i + 1, orgName: d.orgName, total: `$${Math.round(d.total).toLocaleString()}` }))

  // Funding breakdown
  const fundingRows: FundingSummaryRow[] = fundingSummaryRes.status === 'fulfilled'
    ? ((fundingSummaryRes.value.data as FundingSummaryRow[] | null) ?? [])
    : []
  let fundingBreakdown = null
  if (fundingRows.length > 0) {
    const maxCycle = fundingRows[0].cycle
    const minCycle = fundingRows[fundingRows.length - 1].cycle
    const sum = (field: keyof FundingSummaryRow) =>
      fundingRows.reduce((acc, r) => acc + Number(r[field] ?? 0), 0)
    const total = sum('total_receipts')
    const pct = (val: number) => total > 0 ? (val / total) * 100 : 0
    const pac = sum('pac_direct_total')
    const individualLarge = sum('large_donor_total')
    const individualSmall = sum('small_donor_total')
    const partyContributions = sum('pol_pty_total')
    const selfFunded = sum('self_funded_total')
    const other = sum('other_total')
    const inStateTotal = sum('in_state_total')
    const outOfStateTotal = sum('out_of_state_total') + sum('dc_donor_total')
    const geoTotal = inStateTotal + outOfStateTotal
    fundingBreakdown = {
      pac, pacPct: pct(pac),
      individualLarge, individualLargePct: pct(individualLarge),
      individualSmall, individualSmallPct: pct(individualSmall),
      partyContributions, partyContributionsPct: pct(partyContributions),
      selfFunded, selfFundedPct: pct(selfFunded),
      other, otherPct: pct(other),
      total,
      superPacFor: sum('superpac_ie_for'),
      superPacAgainst: sum('superpac_ie_against'),
      inStateTotal, outOfStateTotal,
      inStatePct: geoTotal > 0 ? (inStateTotal / geoTotal) * 100 : 0,
      outOfStatePct: geoTotal > 0 ? (outOfStateTotal / geoTotal) * 100 : 0,
      cycle: maxCycle, minCycle,
    }
  }

  // Compute years in office and next election
  const isSenateMember = legislator.chamber === 'senate'
  const rawTerms = legislator.raw_json?.terms ?? []
  const firstTermStart = rawTerms[0]?.start ?? legislator.term_start
  const yearsInOffice = firstTermStart
    ? new Date().getFullYear() - new Date(firstTermStart).getFullYear()
    : 0
  const termLength = isSenateMember ? 6 : 2
  const nextElectionYear = legislator.next_election
    ?? (legislator.term_end ? new Date(legislator.term_end).getFullYear() : null)
    ?? (legislator.term_start
      ? (() => { let y = new Date(legislator.term_start).getFullYear() + termLength; const now = new Date().getFullYear(); while (y <= now) y += termLength; return y })()
      : null)

  const fecIds = legislator.fec_ids
  const fecUrl = fecIds && fecIds.length > 0
    ? `https://www.fec.gov/data/candidate/${fecIds[0]}/`
    : null

  const initialPolitician: Politician = {
    id: bioguideId,
    bioguideId,
    name: legislator.full_name,
    title: legislator.title,
    party: legislator.party as Party,
    state: legislator.state_full,
    stateCode: legislator.state,
    district: legislator.district ? `${legislator.district}th District` : undefined,
    since: firstTermStart ? new Date(firstTermStart).getFullYear().toString() : null,
    photo: legislator.photo_url,
    photoCredit: null,
    website: legislator.website,
    address: legislator.address,
    phone: legislator.phone,
    fecUrl,
    nextElectionYear,
    stats: {
      yearsInOffice,
      attendance: null,
      ideologyScore: scores?.nominate_dim1 ?? null,
    },
    votes,
    bills: [],
    donors: [],
    pacDonors,
    topContributors,
    fundingBreakdown,
    committees,
    donorAlignmentSyncedAt: lastDonorRun?.finished_at ?? null,
    donorAlignmentIsStale: isDonorDataStale(lastDonorRun?.finished_at),
  }

  return <RepresentativeDetailPage id={bioguideId} initialPolitician={initialPolitician} />
}
