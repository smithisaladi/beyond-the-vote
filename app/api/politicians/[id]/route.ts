import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIdeologyLabel } from '@/lib/ideology'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const OPENFEC_API_KEY  = process.env.OPENFEC_API_KEY ?? ''
const CONGRESS_BASE    = 'https://api.congress.gov/v3'
const FEC_BASE         = 'https://api.open.fec.gov/v1'

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

async function fetchSponsoredBills(bioguideId: string) {
  if (!CONGRESS_API_KEY) return []
  const res = await fetch(
    `${CONGRESS_BASE}/member/${bioguideId}/sponsored-legislation?format=json&limit=10&api_key=${CONGRESS_API_KEY}`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return []
  const data = await res.json()
  return ((data.sponsoredLegislation ?? []) as any[]).map((b: any) => ({
    id:     `${b.congress}-${(b.type ?? '').toLowerCase()}-${b.number}`,
    name:   b.title ?? '',
    number: formatBillNumber(b.type ?? '', b.number),
    status: mapBillStatus(b.latestAction?.text),
    date:   b.introducedDate
      ? new Date(b.introducedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : '',
  }))
}

interface Donor { rank: number; name: string; amount: string; category: string }

async function fetchDonors(
  memberName: string,
  stateCode: string
): Promise<{ donors: Donor[]; fecUrl: string | null }> {
  if (!OPENFEC_API_KEY) return { donors: [], fecUrl: null }
  try {
    const searchRes = await fetch(
      `${FEC_BASE}/candidates/search/?q=${encodeURIComponent(memberName)}&state=${stateCode}&api_key=${OPENFEC_API_KEY}&per_page=5`,
      { next: { revalidate: 86400 } }
    )
    if (!searchRes.ok) return { donors: [], fecUrl: null }
    const searchData = await searchRes.json()
    const candidate = searchData.results?.[0]
    if (!candidate) return { donors: [], fecUrl: null }

    const candidateId: string = candidate.candidate_id
    const fecUrl = `https://www.fec.gov/data/candidate/${candidateId}/`
    const committeeId: string | undefined = candidate.principal_committees?.[0]?.committee_id
    if (!committeeId) return { donors: [], fecUrl }

    const contribRes = await fetch(
      `${FEC_BASE}/schedules/schedule_a/by_employer/?committee_id=${committeeId}&sort=-total&per_page=10&api_key=${OPENFEC_API_KEY}`,
      { next: { revalidate: 86400 } }
    )
    if (!contribRes.ok) return { donors: [], fecUrl }
    const contribData = await contribRes.json()
    const SKIP = new Set(['INFORMATION REQUESTED', 'NONE', 'N/A', 'SELF-EMPLOYED', 'RETIRED', 'NOT EMPLOYED'])
    const donors: Donor[] = ((contribData.results ?? []) as any[])
      .filter((c: any) => c.employer && !SKIP.has((c.employer as string).toUpperCase()))
      .slice(0, 5)
      .map((c: any, i: number) => ({
        rank: i + 1, name: c.employer, amount: `$${Math.round(c.total).toLocaleString()}`, category: 'Various',
      }))
    return { donors, fecUrl }
  } catch {
    return { donors: [], fecUrl: null }
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bioguideId } = await params
  const supabase = await createClient()

  // ── Tier 1: Local DB (fast, reliable) ─────────────────────────────────────
  const [legislatorRes, scoresRes, billVotesRes, committeesRes] = await Promise.allSettled([
    supabase
      .from('legislators')
      .select('*')
      .eq('bioguide_id', bioguideId)
      .maybeSingle(),

    supabase
      .from('member_scores')
      .select('nominate_dim1, nominate_dim2, num_votes')
      .eq('bioguide_id', bioguideId)
      .maybeSingle(),

    supabase
      .from('bill_vote_positions')
      .select(`
        position,
        bill_vote_summaries (
          id, bill_id, chamber, date, question, result,
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
  ])

  const legislator = extract(legislatorRes)?.data
  const scores     = extract(scoresRes)?.data
  const voteRows   = extract(billVotesRes)?.data ?? []
  const commRows   = extract(committeesRes)?.data ?? []

  // ── Tier 2: External APIs ──────────────────────────────────────────────────
  const memberName = legislator?.full_name ?? ''
  const stateCode  = legislator?.state ?? ''

  const [sponsoredRes, donorsRes] = await Promise.allSettled([
    fetchSponsoredBills(bioguideId),
    fetchDonors(memberName, stateCode),
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
    const { donors, fecUrl } = extract(donorsRes) ?? { donors: [], fecUrl: null }

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
        nextElectionYear, votes: [], billVotes: [], bills, donors, committees: [],
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
        question:  summary.question,
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
  const yearsInOffice = legislator.term_start
    ? new Date().getFullYear() - new Date(legislator.term_start).getFullYear()
    : 0
  const termLength = isSenate ? 6 : 2
  const nextElectionYear = legislator.next_election
    ?? (legislator.term_end ? new Date(legislator.term_end).getFullYear() : null)
    ?? (legislator.term_start
        ? (() => { let y = new Date(legislator.term_start).getFullYear() + termLength; const now = new Date().getFullYear(); while (y <= now) y += termLength; return y })()
        : null)

  const bills  = extract(sponsoredRes) ?? []
  const { donors, fecUrl } = extract(donorsRes) ?? { donors: [], fecUrl: null }

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
      since:       legislator.term_start ? new Date(legislator.term_start).getFullYear().toString() : null,
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
      billVotes,
      bills,
      donors,
      committees,
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
