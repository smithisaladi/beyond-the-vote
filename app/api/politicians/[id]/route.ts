import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getIdeologyLabel } from '@/lib/ideology'
import { getEmployerIndustry } from '@/lib/fec-industries'

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

interface Donor { rank: number; name: string; amount: string; category: string }

const EMPLOYER_SKIP = new Set([
  'NULL', 'NONE', 'N/A', 'NA', 'NOT APPLICABLE',
  'SELF', 'SELF-EMPLOYED', 'SELF EMPLOYED',
  'RETIRED', 'RETIRED/RETIRED',
  'NOT EMPLOYED', 'UNEMPLOYED', 'HOMEMAKER', 'STUDENT',
  'INFORMATION REQUESTED', 'INFORMATION REQUESTED PER BEST EFFORTS',
  'REFUSED', 'REQUESTED', 'BEST EFFORTS',
])

const EMPLOYER_MERGE: Record<string, string> = {
  'US GOVERNMENT':           'U.S. Government',
  'U.S. GOVERNMENT':         'U.S. Government',
  'UNITED STATES GOVERNMENT':'U.S. Government',
  'US ARMY':                 'U.S. Army',
  'UNITED STATES ARMY':      'U.S. Army',
  'US NAVY':                 'U.S. Navy',
  'UNITED STATES NAVY':      'U.S. Navy',
  'US AIR FORCE':            'U.S. Air Force',
  'UNITED STATES AIR FORCE': 'U.S. Air Force',
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

const KEEP_UPPER = new Set(['LLC', 'LLP', 'LP', 'PA', 'PC', 'PLLC', 'NA', 'FSB', 'II', 'III', 'IV'])

function normalizeEmployer(raw: string): string {
  const upper = raw.toUpperCase().trim()
  if (EMPLOYER_MERGE[upper]) return EMPLOYER_MERGE[upper]
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(word => {
      const u = word.toUpperCase()
      if (KEEP_UPPER.has(u)) return u
      if (/^Mc[A-Z]/.test(word)) return word                                  // already correct
      if (/^mc[a-z]/i.test(word))
        return 'Mc' + word[2].toUpperCase() + word.slice(3).toLowerCase()     // mcdowell → McDowell
      if (/^mac[a-z]/i.test(word) && word.length > 4)
        return 'Mac' + word[3].toUpperCase() + word.slice(4).toLowerCase()    // macdonald → MacDonald
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    })
    .join(' ')
}

async function fetchDonors(opts: {
  fecIds: string[] | null
  fecCommitteeId: string | null
  memberName: string
  stateCode: string
}): Promise<{ donors: Donor[]; pacDonors: Donor[]; fecUrl: string | null }> {
  if (!OPENFEC_API_KEY) return { donors: [], pacDonors: [], fecUrl: null }
  try {
    let committeeId: string | null = opts.fecCommitteeId ?? null
    let candidateId: string | null = opts.fecIds?.[0] ?? null
    let fecUrl: string | null = candidateId ? `https://www.fec.gov/data/candidate/${candidateId}/` : null

    // If we don't have a stored committee ID, look it up via candidate ID or name search
    if (!committeeId) {
      if (candidateId) {
        const commRes = await fetch(
          `${FEC_BASE}/candidate/${candidateId}/committees/?designation=P&api_key=${OPENFEC_API_KEY}`,
          { next: { revalidate: 86400 } }
        )
        if (commRes.ok) {
          const commData = await commRes.json()
          committeeId = commData.results?.[0]?.committee_id ?? null
        }
      }

      // Fall back to name search if still no committee ID
      if (!committeeId) {
        const searchRes = await fetch(
          `${FEC_BASE}/candidates/search/?q=${encodeURIComponent(opts.memberName)}&state=${opts.stateCode}&api_key=${OPENFEC_API_KEY}&per_page=5`,
          { next: { revalidate: 86400 } }
        )
        if (!searchRes.ok) return { donors: [], pacDonors: [], fecUrl }
        const searchData = await searchRes.json()
        const candidate = searchData.results?.[0]
        if (!candidate) return { donors: [], pacDonors: [], fecUrl }
        candidateId = candidate.candidate_id
        fecUrl = `https://www.fec.gov/data/candidate/${candidateId}/`
        committeeId = candidate.principal_committees?.[0]?.committee_id ?? null
      }
    }

    if (!committeeId) return { donors: [], pacDonors: [], fecUrl }

    // Fetch all three data sources in parallel
    const [employerRes, pacRes] = await Promise.allSettled([
      fetch(
        `${FEC_BASE}/schedules/schedule_a/by_employer/?committee_id=${committeeId}&sort=-total&per_page=100&api_key=${OPENFEC_API_KEY}`,
        { next: { revalidate: 86400 } }
      ),
      fetch(
        `${FEC_BASE}/schedules/schedule_a/?committee_id=${committeeId}&contributor_type=committee&sort=-contribution_receipt_amount&per_page=100&api_key=${OPENFEC_API_KEY}`,
        { next: { revalidate: 86400 } }
      ),
    ])

    // Individual employer donors (cleaned, with industry labels)
    let donors: Donor[] = []
    if (employerRes.status === 'fulfilled' && employerRes.value.ok) {
      const data = await employerRes.value.json()
      const totals = new Map<string, { normalized: string; total: number }>()
      for (const c of (data.results ?? []) as any[]) {
        const raw: string = c.employer ?? ''
        if (!raw || EMPLOYER_SKIP.has(raw.toUpperCase().trim())) continue
        const key = raw.toUpperCase().trim()
        const name = normalizeEmployer(raw)
        const existing = totals.get(key)
        totals.set(key, { normalized: existing?.normalized ?? name, total: (existing?.total ?? 0) + (c.total ?? 0) })
      }
      donors = Array.from(totals.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5)
        .map(([rawKey, { normalized, total }], i) => ({
          rank: i + 1, name: normalized,
          amount: `$${Math.round(total).toLocaleString()}`,
          category: getEmployerIndustry(rawKey),
        }))
    }

    // PAC / committee contributors (aggregated from raw schedule_a)
    let pacDonors: Donor[] = []
    if (pacRes.status === 'fulfilled' && pacRes.value.ok) {
      const data = await pacRes.value.json()
      const totals = new Map<string, { display: string; total: number }>()
      for (const t of (data.results ?? []) as any[]) {
        const raw: string = t.contributor_name ?? ''
        if (!raw) continue
        const key = raw.toUpperCase().trim()
        if (PAC_SKIP.has(key)) continue
        const amount: number = t.contribution_receipt_amount ?? 0
        if (amount <= 0) continue
        const existing = totals.get(key)
        totals.set(key, { display: existing?.display ?? raw, total: (existing?.total ?? 0) + amount })
      }
      pacDonors = Array.from(totals.entries())
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 10)
        .map(([, { display, total }], i) => ({
          rank: i + 1, name: display,
          amount: `$${Math.round(total).toLocaleString()}`,
          category: 'PAC',
        }))
    }

    return { donors, pacDonors, fecUrl }
  } catch {
    return { donors: [], pacDonors: [], fecUrl: null }
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: bioguideId } = await params
  const supabase = await createClient()

  // ── Tier 1: Local DB (fast, reliable) ─────────────────────────────────────
  const [legislatorRes, scoresRes, billVotesRes, committeesRes, donorAlignmentsRes, lastDonorRunRes] = await Promise.allSettled([
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
      .from('vote_donor_alignments')
      .select('vote_id, donor_name, donor_amount, donor_likely_position, vote_aligns, explanation')
      .eq('bioguide_id', bioguideId),

    supabase
      .from('pipeline_runs')
      .select('finished_at')
      .eq('script', 'sync_donor_alignments')
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
  const alignmentRows   = extract(donorAlignmentsRes)?.data ?? []
  const lastDonorRun    = extract(lastDonorRunRes)?.data

  // Group alignments by vote_id for O(1) lookup when building vote objects
  const alignmentsByVoteId = (alignmentRows as any[]).reduce((acc: Record<string, any[]>, row: any) => {
    if (!acc[row.vote_id]) acc[row.vote_id] = []
    acc[row.vote_id].push({
      donorName:           row.donor_name,
      donorAmount:         row.donor_amount,
      donorLikelyPosition: row.donor_likely_position,
      voteAligns:          row.vote_aligns,
      explanation:         row.explanation,
    })
    return acc
  }, {})

  // ── Tier 2: External APIs ──────────────────────────────────────────────────
  const memberName = legislator?.full_name ?? ''
  const stateCode  = legislator?.state ?? ''

  const [sponsoredRes, donorsRes] = await Promise.allSettled([
    fetchSponsoredBills(bioguideId),
    fetchDonors({
      fecIds:        (legislator as any)?.fec_ids ?? null,
      fecCommitteeId:(legislator as any)?.fec_committee_id ?? null,
      memberName,
      stateCode,
    }),
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
    const { donors, pacDonors, fecUrl } = extract(donorsRes) ?? { donors: [], pacDonors: [], fecUrl: null }

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
        nextElectionYear, votes: [], billVotes: [], bills, donors, pacDonors, committees: [],
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
        question:  summary.title ?? summary.question,
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
  const { donors, pacDonors, fecUrl } = extract(donorsRes) ?? { donors: [], pacDonors: [], fecUrl: null }

  const votes = billVotes.map((v: any) => ({
    id:             v.voteId,
    bill:           v.question,
    billId:         v.billId ?? null,
    date:           v.date,
    vote:           v.position as 'Yea' | 'Nay',
    donorAlignments: alignmentsByVoteId[v.voteId] ?? [],
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
