import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIdeologyLabel } from '@/lib/ideology'
import { mapStatus as mapBillStatusFull } from '@/lib/bills'

const CONGRESS_API_KEY  = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE     = 'https://api.congress.gov/v3'
const SENATE_VOTE_BASE  = 'https://www.senate.gov/legislative/LIS/roll_call_votes'
const SENATE_INDEX_BASE = 'https://www.senate.gov/legislative/LIS/roll_call_lists'

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

// ── Senate vote sessions to probe (most-recent first) ─────────────────────
function senateSessions(): { congress: number; session: number }[] {
  const year = new Date().getFullYear()
  if (year >= 2026) return [{ congress: 119, session: 2 }, { congress: 119, session: 1 }]
  if (year === 2025) return [{ congress: 119, session: 1 }]
  if (year === 2024) return [{ congress: 118, session: 2 }, { congress: 118, session: 1 }]
  return [{ congress: 119, session: 1 }]
}

// Try the senate.gov index XML first; fall back to parallel probing.
// NOTE: senate.gov returns HTTP 200 with an HTML error page for missing votes,
// so we must validate the response body contains XML, not just check r.ok.
async function maxSenateVoteNumber(congress: number, session: number): Promise<number> {
  try {
    const r = await fetch(
      `${SENATE_INDEX_BASE}/vote_menu_${congress}_${session}.xml`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) }
    )
    if (r.ok) {
      const xml = await r.text()
      // Index uses <vote_number> tags (5-digit zero-padded strings like "00074")
      const nums = [...xml.matchAll(/<vote_number>(\d+)<\/vote_number>/g)]
        .map(m => parseInt(m[1]))
      if (nums.length) return Math.max(...nums)
    }
  } catch { /* fall through to probe */ }

  // Fallback: probe round numbers, but validate body is real XML (senate.gov
  // returns 200+HTML for non-existent votes, so r.ok alone is not enough).
  const probes = [300, 200, 150, 100, 75, 50, 25, 10]
  const pad = (n: number) => String(n).padStart(5, '0')
  const results = await Promise.allSettled(
    probes.map(n =>
      fetch(
        `${SENATE_VOTE_BASE}/vote${congress}${session}/vote_${congress}_${session}_${pad(n)}.xml`,
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) }
      )
        .then(async r => {
          if (!r.ok) return { n, ok: false }
          const text = await r.text()
          // Real vote XML always contains <vote_title>; error HTML does not
          return { n, ok: text.includes('<vote_title>') }
        })
        .catch(() => ({ n, ok: false }))
    )
  )
  let max = 0
  for (const r of results)
    if (r.status === 'fulfilled' && r.value.ok) max = Math.max(max, r.value.n)
  return max
}

type PoliticianVote = { id: string; bill: string; billId: string | null; date: string; vote: 'Yea' | 'Nay'; donorAlignments: any[] }
type SenateMemberKey = { lisId: string } | { lastName: string; state: string }

// Extract this member's block from a senate vote XML, return vote or null.
// Matches by lis_member_id (most reliable) or last_name+state (fallback).
function parseSenateVoteXml(xml: string, key: SenateMemberKey, voteId: string): PoliticianVote | null {
  // Find the <member> block matching this senator
  const memberBlockRe = /<member>([\s\S]*?)<\/member>/g
  let m: RegExpExecArray | null
  let memberBlock: string | null = null
  while ((m = memberBlockRe.exec(xml)) !== null) {
    const block = m[1]
    const match = 'lisId' in key
      ? block.includes(`<lis_member_id>${key.lisId}</lis_member_id>`)
      : block.includes(`<last_name>${key.lastName}</last_name>`) &&
        block.includes(`<state>${key.state}</state>`)
    if (match) { memberBlock = block; break }
  }
  if (!memberBlock) return null

  const rawPos = (memberBlock.match(/<vote_cast>([^<]+)<\/vote_cast>/)?.[1] ?? '').trim().toLowerCase()
  // Skip non-yea/nay positions (Not Voting, Present, Paired, etc.)
  if (rawPos !== 'yea' && rawPos !== 'aye' && rawPos !== 'yes' && rawPos !== 'nay' && rawPos !== 'no') return null

  const title   = xml.match(/<vote_title>([^<]+)<\/vote_title>/)?.[1]?.trim() ?? ''
  const dateStr = xml.match(/<vote_date>([^<]+)<\/vote_date>/)?.[1]?.trim() ?? ''
  let dateFormatted = ''
  if (dateStr) {
    try {
      // senate.gov date format: "March 10, 2026,  02:16 PM" — extract just the date part
      const datePart = dateStr.match(/([A-Za-z]+ \d+, \d{4})/)?.[1] ?? dateStr
      dateFormatted = new Date(datePart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { /**/ }
  }

  return {
    id:              voteId,
    bill:            title || voteId,
    billId:          null,
    date:            dateFormatted,
    vote:            (rawPos === 'nay' || rawPos === 'no') ? 'Nay' : 'Yea',
    donorAlignments: [],
  }
}

async function fetchRecentVotesForSenator(key: SenateMemberKey): Promise<PoliticianVote[] | null> {
  const sessions = senateSessions()
  const votes: PoliticianVote[] = []
  const pad = (n: number) => String(n).padStart(5, '0')

  for (const { congress, session } of sessions) {
    if (votes.length >= 20) break
    const max = await maxSenateVoteNumber(congress, session)
    if (max === 0) continue

    let current = max
    const base  = `${SENATE_VOTE_BASE}/vote${congress}${session}`

    while (current > 0 && votes.length < 20) {
      const batchNums = Array.from({ length: Math.min(15, current) }, (_, i) => current - i)
      current -= batchNums.length

      const xmlResults = await Promise.allSettled(
        batchNums.map(n =>
          fetch(
            `${base}/vote_${congress}_${session}_${pad(n)}.xml`,
            { next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) }
          )
            .then(async r => {
              if (!r.ok) return null
              const text = await r.text()
              // senate.gov returns 200+HTML for missing votes; real XML has <vote_title>
              return text.includes('<vote_title>') ? text : null
            })
            .catch(() => null)
        )
      )

      for (let i = 0; i < batchNums.length; i++) {
        if (votes.length >= 20) break
        const r   = xmlResults[i]
        const xml = r.status === 'fulfilled' ? r.value : null
        if (!xml) continue
        const v = parseSenateVoteXml(xml, key, `senate-${congress}-${session}-${batchNums[i]}`)
        if (v) votes.push(v)
      }
    }
  }

  return votes.length > 0 ? votes : null
}

async function fetchRecentVotesFromDB(
  bioguideId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<PoliticianVote[]> {
  const { data } = await supabase
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
    .limit(20)
  return (data ?? [])
    .map((row: any) => {
      const summary = row.bill_vote_summaries
      if (!summary) return null
      return {
        id:              summary.id,
        bill:            summary.title || summary.question,
        billId:          summary.bill_id ?? null,
        date:            summary.date
          ? new Date(summary.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '',
        vote:            row.position as 'Yea' | 'Nay',
        donorAlignments: [] as any[],
      }
    })
    .filter(Boolean) as PoliticianVote[]
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

  // ── Tier 1: Local DB (fast) ────────────────────────────────────────────────
  const [legislatorRes, scoresRes, committeesRes, lastDonorRunRes] = await Promise.allSettled([
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

  const legislator   = extract(legislatorRes)?.data
  const scores       = extract(scoresRes)?.data
  const commRows     = extract(committeesRes)?.data ?? []
  const lastDonorRun = extract(lastDonorRunRes)?.data

  // ── Tier 2: External APIs + votes (all in parallel) ───────────────────────
  const isSenate = (legislator as any)?.chamber === 'senate'
  const lisId    = (legislator as any)?.lis_id as string | null | undefined

  // Build senate member key: prefer lis_id (exact); fall back to last_name+state
  const senateMemberKey: SenateMemberKey | null = isSenate
    ? (lisId
        ? { lisId }
        : { lastName: (legislator as any)?.last_name ?? '', state: (legislator as any)?.state ?? '' })
    : null

  const [sponsoredRes, donorsRes, votesRes] = await Promise.allSettled([
    fetchSponsoredBills(bioguideId),
    fetchDonors({ bioguideId, fecIds: (legislator as any)?.fec_ids ?? null, supabase }),
    // Senators → senate.gov XML; House members → DB
    senateMemberKey
      ? fetchRecentVotesForSenator(senateMemberKey)
      : fetchRecentVotesFromDB(bioguideId, supabase),
  ])

  const recentVotesApiRes = votesRes

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
        nextElectionYear, votes: extract(votesRes) ?? [], bills, donors, pacDonors, topContributors, fundingBreakdown, committees: [],
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

  const billVotesCast  = 0
  const votedWithParty = null

  const committees = (commRows as any[]).map((r: any) => ({
    name:    r.committees?.name ?? '',
    url:     r.committees?.url ?? null,
    chamber: r.committees?.chamber ?? null,
    title:   r.title ?? null,
  }))

  const isSenateMember = legislator.chamber === 'senate'
  const rawTerms: any[] = legislator.raw_json?.terms ?? []
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

  const bills  = extract(sponsoredRes) ?? []
  const { donors, pacDonors, topContributors, fecUrl, fundingBreakdown } = extract(donorsRes) ?? { donors: [], pacDonors: [], topContributors: [], fecUrl: null, fundingBreakdown: null }

  const votes = extract(votesRes) ?? []

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
        votes:       sourceStatus(recentVotesApiRes),
        committees:  sourceStatus(committeesRes),
        legislation: sourceStatus(sponsoredRes),
        donors:      sourceStatus(donorsRes),
      },
    },
  })
}
