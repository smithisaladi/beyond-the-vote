import { NextRequest, NextResponse } from 'next/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const OPENSECRETS_API_KEY = process.env.OPENSECRETS_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'

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

interface Donor {
  rank: number
  name: string
  amount: string
  category: string
}

async function fetchOpenSecretsDonors(
  stateCode: string,
  memberName: string
): Promise<{ donors: Donor[]; openSecretsUrl: string | null }> {
  if (!OPENSECRETS_API_KEY) return { donors: [], openSecretsUrl: null }

  try {
    const legsRes = await fetch(
      `https://www.opensecrets.org/api/?method=getLegislators&id=${stateCode}&output=json&apikey=${OPENSECRETS_API_KEY}`,
      { next: { revalidate: 86400 } }
    )
    if (!legsRes.ok) return { donors: [], openSecretsUrl: null }

    const legsData = await legsRes.json()
    const legislators: any[] = legsData.response?.legislator ?? []

    const lastName = memberName.trim().split(/\s+/).pop()?.toLowerCase() ?? ''
    const match = legislators.find((l: any) =>
      (l['@name'] ?? '').toLowerCase().includes(lastName)
    )
    if (!match) return { donors: [], openSecretsUrl: null }

    const cid: string = match['@cid']
    const openSecretsUrl = `https://www.opensecrets.org/politicians/summary?cid=${cid}`

    const contribRes = await fetch(
      `https://www.opensecrets.org/api/?method=candContrib&cid=${cid}&cycle=2024&output=json&apikey=${OPENSECRETS_API_KEY}`,
      { next: { revalidate: 86400 } }
    )
    if (!contribRes.ok) return { donors: [], openSecretsUrl }

    const contribData = await contribRes.json()
    const raw = contribData.response?.contributors?.contributor ?? []
    const list: any[] = Array.isArray(raw) ? raw : [raw]

    const donors: Donor[] = list.slice(0, 5).map((c: any, i: number) => ({
      rank: i + 1,
      name: c['@org_name'] ?? 'Unknown',
      amount: c['@total'] ? `$${parseInt(c['@total']).toLocaleString()}` : 'N/A',
      category: c['@industry'] ?? 'Unknown',
    }))

    return { donors, openSecretsUrl }
  } catch {
    return { donors: [], openSecretsUrl: null }
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
    const [memberRes, votesRes, sponsoredRes, committeesRes] = await Promise.all([
      fetch(
        `${CONGRESS_BASE}/member/${bioguideId}?format=json&api_key=${CONGRESS_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `${CONGRESS_BASE}/member/${bioguideId}/votes?format=json&limit=10&api_key=${CONGRESS_API_KEY}`,
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
    ])

    if (!memberRes.ok) {
      if (memberRes.status === 404) {
        return NextResponse.json({ error: 'Politician not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Congress.gov API error' }, { status: memberRes.status })
    }

    const memberData = await memberRes.json()
    const member = memberData.member

    const votesData = votesRes.ok ? await votesRes.json() : {}
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

    const votes = ((votesData.votes ?? []) as any[]).map((v: any) => ({
      id: v.rollNumber ? `${v.congress}-${v.chamber}-${v.rollNumber}` : crypto.randomUUID(),
      bill: v.description ?? v.question ?? 'Unknown Bill',
      date: v.date
        ? new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '',
      vote: ['yes', 'yea'].includes((v.memberPosition ?? '').toLowerCase()) ? 'Yea' : 'Nay',
    }))

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

    const { donors, openSecretsUrl } = await fetchOpenSecretsDonors(stateCode, memberName)

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
        openSecretsUrl,
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
