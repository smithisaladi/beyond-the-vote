import { NextRequest, NextResponse } from 'next/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!CONGRESS_API_KEY) {
    return NextResponse.json({ error: 'CONGRESS_API_KEY is not configured' }, { status: 500 })
  }

  const { id: bioguideId } = await params

  try {
    const [memberRes, votesRes, sponsoredRes] = await Promise.all([
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

    const votes = ((votesData.votes ?? []) as any[]).map((v: any) => ({
      id: v.rollNumber ? `${v.congress}-${v.chamber}-${v.rollNumber}` : String(Math.random()),
      bill: v.description ?? v.question ?? 'Unknown Bill',
      date: v.date
        ? new Date(v.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : '',
      vote: (v.memberPosition ?? '').toLowerCase() === 'yes' || (v.memberPosition ?? '').toLowerCase() === 'yea'
        ? 'Yea'
        : 'Nay',
    }))

    const bills = ((sponsoredData.sponsoredLegislation ?? []) as any[]).map((b: any) => ({
      id: `${b.congress}-${(b.type ?? '').toLowerCase()}-${b.number}`,
      name: b.title ?? '',
      status: mapBillStatus(b.latestAction?.text),
      date: b.introducedDate
        ? new Date(b.introducedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        : '',
      number: formatBillNumber(b.type ?? '', b.number),
    }))

    // Attendance: Congress.gov doesn't expose this directly; omit or derive from vote count
    // Ideology: would come from VoteView — placeholder for now
    const stats = {
      yearsInOffice,
      attendance: null as number | null, // requires VoteView or roll-call analysis
      ideologyScore: null as number | null, // requires DW-NOMINATE (VoteView)
    }

    return NextResponse.json({
      politician: {
        id: bioguideId,
        bioguideId,
        name: member.directOrderName ?? member.invertedOrderName ?? '',
        title: latestTerm.memberType ?? (latestTerm.chamber === 'Senate' ? 'U.S. Senator' : 'U.S. Representative'),
        party: normalizedParty as 'Democrat' | 'Republican' | 'Independent',
        state: latestTerm.stateName ?? member.state ?? '',
        stateCode: latestTerm.stateCode ?? '',
        district: latestTerm.district ? `${latestTerm.district}th District` : undefined,
        since: firstTerm.startYear?.toString() ?? null,
        photo: member.depiction?.imageUrl ?? null,
        photoCredit: member.depiction?.attribution ?? null,
        website: member.officialWebsiteUrl ?? null,
        address: member.addressInformation?.officeAddress ?? null,
        phone: member.addressInformation?.phoneNumber ?? null,
        stats,
        votes,
        bills,
        donors: [], // Requires OpenSecrets API — not yet configured
      },
    })
  } catch (err) {
    console.error('[/api/politicians/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch politician' }, { status: 500 })
  }
}
