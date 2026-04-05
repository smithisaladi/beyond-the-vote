import { NextRequest, NextResponse } from 'next/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const OPENFEC_API_KEY = process.env.OPENFEC_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'
const FEC_BASE = 'https://api.open.fec.gov/v1'

function formatBillNumber(type: string, number: number): string {
  const types: Record<string, string> = {
    hr: 'H.R.',
    s: 'S.',
    hjres: 'H.J.Res.',
    sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.',
    sconres: 'S.Con.Res.',
    hres: 'H.Res.',
    sres: 'S.Res.',
  }
  const prefix = types[type.toLowerCase()] ?? type.toUpperCase()
  return `${prefix} ${number}`
}

function mapBillStatus(action?: string): 'Passed' | 'Pending' | 'Failed' {
  const a = (action ?? '').toLowerCase()
  if (a.includes('became public law') || a.includes('signed by president') || a.includes('passed')) {
    return 'Passed'
  }
  if (a.includes('failed') || a.includes('vetoed')) return 'Failed'
  return 'Pending'
}

interface PoliticianVote {
  id: string
  bill: string
  date: string
  vote: 'Yea' | 'Nay'
}

// VoteView cast codes: 1=Yea, 2=Paired Yea, 3=Announced Yea,
//                      4=Announced Nay, 5=Paired Nay, 6=Nay, 7-9=Not voting
// Data comes from VoteView static CSVs (API is defunct):
//   members  → 63 KB,  cached 24h
//   rollcalls → 321 KB, cached 1h
//   votes    → 6.6 MB, cached 1h (only slow on cold start)

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

async function fetchVoteViewVotes(bioguideId: string): Promise<PoliticianVote[]> {
  try {
    // Step 1: Resolve bioguide → ICPSR via members CSV (63 KB)
    const membersRes = await fetch(
      'https://voteview.com/static/data/out/members/HS119_members.csv',
      { next: { revalidate: 86400 } }
    )
    if (!membersRes.ok) return []
    const membersText = await membersRes.text()

    let icpsr: string | undefined
    for (const line of membersText.split('\n').slice(1)) {
      const cols = parseCSVLine(line)
      if (cols[10] === bioguideId) { icpsr = cols[2]; break }
    }
    if (!icpsr) return []

    // Step 2: Parse rollcalls into a lookup map (321 KB)
    // Columns: congress,chamber,rollnumber,date,...,bill_number,vote_result,vote_desc,vote_question,dtl_desc
    const rollcallsRes = await fetch(
      'https://voteview.com/static/data/out/rollcalls/HS119_rollcalls.csv',
      { next: { revalidate: 3600 } }
    )
    if (!rollcallsRes.ok) return []
    const rollcallsText = await rollcallsRes.text()

    const rollcallMap = new Map<string, { date: string; bill: string; question: string }>()
    for (const line of rollcallsText.split('\n').slice(1)) {
      if (!line.trim()) continue
      const cols = parseCSVLine(line)
      rollcallMap.set(`${cols[0]}-${cols[2]}`, {
        date: cols[3] ?? '',
        bill: cols[13] ?? '',
        question: cols[16]?.trim() || cols[15]?.trim() || '',
      })
    }

    // Step 3: Filter votes CSV by ICPSR (6.6 MB, cached — only slow on cold start)
    // Columns: congress,chamber,rollnumber,icpsr,cast_code,prob
    const votesRes = await fetch(
      'https://voteview.com/static/data/out/votes/HS119_votes.csv',
      { next: { revalidate: 3600 } }
    )
    if (!votesRes.ok) return []
    const votesText = await votesRes.text()

    const memberRows = votesText.split('\n')
      .slice(1)
      .filter(line => line.split(',')[3] === icpsr)
      .slice(-10)  // last 10 = most recent (file is sorted by rollnumber asc)
      .reverse()

    return memberRows
      .map((line): PoliticianVote | null => {
        const cols = line.split(',')
        const castCode = parseInt(cols[4])
        if (isNaN(castCode) || castCode < 1 || castCode > 6) return null
        const rc = rollcallMap.get(`${cols[0]}-${cols[2]}`)
        const bill = rc?.bill?.trim()
        const label = bill
          ? `${bill}${rc?.question ? ` — ${rc.question}` : ''}`
          : rc?.question ?? `Roll Call ${cols[2]}`
        return {
          id: `${cols[0]}-${cols[2]}`,
          bill: label,
          date: rc?.date
            ? new Date(rc.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '',
          vote: castCode <= 3 ? 'Yea' : 'Nay',
        }
      })
      .filter((v): v is PoliticianVote => v !== null)
  } catch {
    return []
  }
}

interface Donor {
  rank: number
  name: string
  amount: string
  category: string
}

async function fetchFECDonors(
  memberName: string,
  stateCode: string,
): Promise<{ donors: Donor[]; fecUrl: string | null }> {
  if (!OPENFEC_API_KEY) return { donors: [], fecUrl: null }

  try {
    // Find the candidate on FEC by name + state
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

    // Get the principal campaign committee
    const committeeId: string | undefined = candidate.principal_committees?.[0]?.committee_id
    if (!committeeId) return { donors: [], fecUrl }

    // Fetch top employer contributions for the committee
    const contribRes = await fetch(
      `${FEC_BASE}/schedules/schedule_a/by_employer/?committee_id=${committeeId}&sort=-total&per_page=10&api_key=${OPENFEC_API_KEY}`,
      { next: { revalidate: 86400 } }
    )
    if (!contribRes.ok) return { donors: [], fecUrl }

    const contribData = await contribRes.json()
    const results: any[] = contribData.results ?? []

    const SKIP = new Set(['INFORMATION REQUESTED', 'NONE', 'N/A', 'SELF-EMPLOYED', 'RETIRED', 'NOT EMPLOYED'])
    const donors: Donor[] = results
      .filter((c: any) => c.employer && !SKIP.has((c.employer as string).toUpperCase()))
      .slice(0, 5)
      .map((c: any, i: number) => ({
        rank: i + 1,
        name: c.employer,
        amount: `$${Math.round(c.total).toLocaleString()}`,
        category: 'Various',
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
  if (!CONGRESS_API_KEY) {
    return NextResponse.json({ error: 'CONGRESS_API_KEY is not configured' }, { status: 500 })
  }

  const { id: bioguideId } = await params

  try {
    const [memberRes, sponsoredRes, committeesRes, votes] = await Promise.all([
      fetch(
        `${CONGRESS_BASE}/member/${bioguideId}?format=json&api_key=${CONGRESS_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `${CONGRESS_BASE}/member/${bioguideId}/sponsored-legislation?format=json&limit=10&api_key=${CONGRESS_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `${CONGRESS_BASE}/member/${bioguideId}/committees?format=json&limit=20&api_key=${CONGRESS_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
      fetchVoteViewVotes(bioguideId),
    ])

    if (!memberRes.ok) {
      if (memberRes.status === 404) {
        return NextResponse.json({ error: 'Politician not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Congress.gov API error' }, { status: memberRes.status })
    }

    const memberData = await memberRes.json()
    const member = memberData.member

    const sponsoredData = sponsoredRes.ok ? await sponsoredRes.json() : {}
    const committeesData = committeesRes.ok ? await committeesRes.json() : {}

    const terms: any[] = member.terms?.item ?? []
    const latestTerm = terms.at(-1) ?? {}
    const firstTerm = terms[0] ?? {}

    const party = latestTerm.party ?? member.partyHistory?.[0]?.partyName ?? 'Unknown'
    const normalizedParty =
      party.toLowerCase().includes('democrat') ? 'Democrat' :
      party.toLowerCase().includes('republican') ? 'Republican' :
      'Independent'

    const yearsInOffice = firstTerm.startYear
      ? new Date().getFullYear() - firstTerm.startYear
      : 0

    // Compute next election year
    const currentTermStart: number | undefined = latestTerm.startYear
    const isSenate = (latestTerm.chamber ?? '').toLowerCase() === 'senate'
    const termLength = isSenate ? 6 : 2
    const nextElectionYear = currentTermStart
      ? (() => {
          let year = currentTermStart + termLength
          const now = new Date().getFullYear()
          while (year <= now) year += termLength
          return year
        })()
      : null

    const bills = ((sponsoredData.sponsoredLegislation ?? []) as any[]).map((b: any) => ({
      id: `${b.congress}-${(b.type ?? '').toLowerCase()}-${b.number}`,
      name: b.title ?? '',
      number: formatBillNumber(b.type ?? '', b.number),
      status: mapBillStatus(b.latestAction?.text),
      date: b.introducedDate
        ? new Date(b.introducedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : '',
    }))

    const committees = ((committeesData.committeeAppointments ?? []) as any[])
      .filter((a: any) => !a.endDate) // current only
      .map((a: any) => ({
        name: a.committee?.name ?? '',
        url: a.committee?.url ?? null,
        title: a.title ?? null,
      }))

    const stateCode = latestTerm.stateCode ?? member.state ?? ''
    const memberName = member.directOrderName ?? member.invertedOrderName ?? ''

    const { donors, fecUrl } = await fetchFECDonors(memberName, stateCode)

    return NextResponse.json({
      politician: {
        id: bioguideId,
        bioguideId,
        name: memberName,
        title: latestTerm.memberType ?? (isSenate ? 'U.S. Senator' : 'U.S. Representative'),
        party: normalizedParty as 'Democrat' | 'Republican' | 'Independent',
        state: latestTerm.stateName ?? member.state ?? '',
        stateCode,
        district: latestTerm.district ? `${latestTerm.district}th District` : undefined,
        since: firstTerm.startYear?.toString() ?? null,
        photo: member.depiction?.imageUrl ?? null,
        photoCredit: member.depiction?.attribution ?? null,
        website: member.officialWebsiteUrl ?? null,
        address: member.addressInformation?.officeAddress ?? null,
        phone: member.addressInformation?.phoneNumber ?? null,
        fecUrl,
        stats: {
          yearsInOffice,
          attendance: null, // requires VoteView or roll-call analysis
          ideologyScore: null, // requires DW-NOMINATE (VoteView)
        },
        nextElectionYear,
        votes,
        bills,
        donors,
        committees,
      },
    })
  } catch (err) {
    console.error('[/api/politicians/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch politician' }, { status: 500 })
  }
}
