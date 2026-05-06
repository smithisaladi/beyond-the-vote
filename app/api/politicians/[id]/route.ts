import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIdeologyLabel } from '@/lib/ideology'
import { ordinal } from '@/lib/format'
import { fetchRecentVotesForSenator } from '@/lib/integrations/senate-votes/fetch-recent'
import type { SenateMemberKey } from '@/lib/integrations/senate-votes/xml-parser'
import { fetchSponsoredBills } from '@/lib/integrations/congress/sponsored-bills'
import { fetchRecentVotesFromDB } from '@/lib/queries/get-recent-votes'
import { fetchDonors, isDonorDataStale } from '@/lib/queries/get-donors'

const CONGRESS_API_KEY  = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE     = 'https://api.congress.gov/v3'

// ── Congress.gov API types ────────────────────────────────────────────────────

interface CongressMember {
  directOrderName?: string
  terms?: { item?: CongressTerm[] }
  partyHistory?: Array<{ partyName?: string }>
  depiction?: { imageUrl?: string; attribution?: string }
  currentMember?: boolean
  state?: string
  district?: number
  addressInformation?: { officeAddress?: string; phoneNumber?: string }
  officialWebsiteUrl?: string
  updateDate?: string
}

interface CongressTerm {
  chamber?: string
  party?: string
  startYear?: number
  endYear?: number
  stateCode?: string
  stateName?: string
  district?: number
  memberType?: string
}

// ── Supabase query result types ───────────────────────────────────────────────

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

interface LegislatorRow {
  bioguide_id: string
  full_name: string
  title: string
  party: string
  state: string
  state_full: string
  district: number | null
  chamber: string
  lis_id: string | null
  last_name: string
  fec_ids: string[] | null
  term_start: string | null
  term_end: string | null
  next_election: number | null
  photo_url: string | null
  website: string | null
  address: string | null
  phone: string | null
  twitter: string | null
  raw_json: { terms?: Array<{ start?: string }> } | null
  [key: string]: unknown
}

type SettledResult<T> = { status: 'fulfilled'; value: T } | { status: 'rejected' }
function extract<T>(r: SettledResult<T>): T | null {
  return r.status === 'fulfilled' ? r.value : null
}
function sourceStatus(r: SettledResult<unknown>): 'ok' | 'error' {
  return r.status === 'fulfilled' ? 'ok' : 'error'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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

  const legislator   = extract(legislatorRes)?.data as LegislatorRow | null | undefined
  const scores       = extract(scoresRes)?.data
  const commRows     = (extract(committeesRes)?.data ?? []) as unknown as CommitteeRow[]
  const lastDonorRun = extract(lastDonorRunRes)?.data as PipelineRunRow | null | undefined

  // ── Tier 2: External APIs + votes (all in parallel) ───────────────────────
  const isSenate = legislator?.chamber === 'senate'
  const lisId    = legislator?.lis_id

  // Build senate member key: prefer lis_id (exact); fall back to last_name+state
  const senateMemberKey: SenateMemberKey | null = isSenate
    ? (lisId
        ? { lisId }
        : { lastName: legislator?.last_name ?? '', state: legislator?.state ?? '' })
    : null

  const [sponsoredRes, donorsRes, votesRes] = await Promise.allSettled([
    fetchSponsoredBills(bioguideId, supabase),
    fetchDonors({ bioguideId, fecIds: legislator?.fec_ids ?? null, supabase }),
    // Senators → senate.gov XML; House members → DB
    senateMemberKey
      ? fetchRecentVotesForSenator(senateMemberKey)
      : fetchRecentVotesFromDB(bioguideId, supabase),
  ])



  // If not in DB yet, fall back to Congress.gov
  if (!legislator && CONGRESS_API_KEY) {
    const fallback = await fetch(
      `${CONGRESS_BASE}/member/${bioguideId}?format=json&api_key=${CONGRESS_API_KEY}`,
      { next: { revalidate: 3600 } }
    )
    if (!fallback.ok) {
      if (fallback.status === 404) return NextResponse.json({ error: 'Politician not found' }, { status: 404 })
      return NextResponse.json({ error: 'Failed to load politician' }, { status: 502 })
    }
    const { member } = await fallback.json() as { member: CongressMember }
    const terms: CongressTerm[] = member.terms?.item ?? []
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
        district: latestTerm.district != null ? ordinal(Number(latestTerm.district)) : undefined,
        since: firstTerm.startYear?.toString() ?? null,
        photo: member.depiction?.imageUrl ?? null,
        photoCredit: member.depiction?.attribution ?? null,
        website: member.officialWebsiteUrl ?? null,
        address: member.addressInformation?.officeAddress ?? null,
        phone: member.addressInformation?.phoneNumber ?? null,
        fecUrl,
        stats: { yearsInOffice, attendance: null, ideologyScore: null, ideologyLabel: null, billVotesCast: 0, votedWithParty: null },
        nextElectionYear, votes: extract(votesRes) ?? [], bills, donors, pacDonors, topContributors, fundingBreakdown, committees: [],
        donorAlignmentSyncedAt:  lastDonorRun?.finished_at ?? null,
        donorAlignmentIsStale:   isDonorDataStale(lastDonorRun?.finished_at),
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

  const committees = commRows.map((r) => ({
    name:    r.committees?.name ?? '',
    url:     r.committees?.url ?? null,
    chamber: r.committees?.chamber ?? null,
    title:   r.title ?? null,
  }))

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
      district:    legislator.district != null ? ordinal(Number(legislator.district)) : undefined,
      since:       (() => { const terms = legislator.raw_json?.terms ?? []; const firstStart = terms[0]?.start ?? legislator.term_start; return firstStart ? new Date(firstStart).getFullYear().toString() : null })(),
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
      donorAlignmentSyncedAt:  lastDonorRun?.finished_at ?? null,
      donorAlignmentIsStale:   isDonorDataStale(lastDonorRun?.finished_at),
      _sources: {
        profile:     sourceStatus(legislatorRes),
        ideology:    sourceStatus(scoresRes),
        votes:       sourceStatus(votesRes),
        committees:  sourceStatus(committeesRes),
        legislation: sourceStatus(sponsoredRes),
        donors:      sourceStatus(donorsRes),
      },
    },
  })
  } catch (err) {
    console.error('[api/politicians/[id]]', err)
    return NextResponse.json({ error: 'Failed to load politician' }, { status: 500 })
  }
}
