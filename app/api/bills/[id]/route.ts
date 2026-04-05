import { NextRequest, NextResponse } from 'next/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'

// id format: "{congress}-{type}-{number}"  e.g. "118-s-1247" or "119-hr-42"
function parseId(id: string): { congress: number; type: string; number: number } | null {
  const parts = id.split('-')
  if (parts.length < 3) return null

  const congress = parseInt(parts[0])
  const type = parts[1]
  const number = parseInt(parts.slice(2).join(''))

  if (isNaN(congress) || isNaN(number) || !type) return null
  return { congress, type, number }
}

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

function mapStatus(actions: any[]): 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed' {
  const latestText = (actions?.[0]?.text ?? '').toLowerCase()

  if (
    latestText.includes('became public law') ||
    latestText.includes('signed by president') ||
    latestText.includes('presented to president')
  ) return 'Passed'

  if (latestText.includes('failed') || latestText.includes('vetoed')) return 'Failed'

  if (latestText.includes('referred to') || latestText.includes('committee')) {
    const lastDate = actions?.[0]?.actionDate ? new Date(actions[0].actionDate) : null
    if (lastDate) {
      const months = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (months > 6) return 'Stalled'
    }
    return 'Committee'
  }

  return 'Active'
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!CONGRESS_API_KEY) {
    return NextResponse.json({ error: 'CONGRESS_API_KEY is not configured' }, { status: 500 })
  }

  const { id } = await params
  const parsed = parseId(id)

  if (!parsed) {
    return NextResponse.json(
      { error: 'Invalid bill id format. Expected: {congress}-{type}-{number}' },
      { status: 400 }
    )
  }

  const { congress, type, number } = parsed

  try {
    const [detailRes, actionsRes, summariesRes] = await Promise.all([
      fetch(
        `${CONGRESS_BASE}/bill/${congress}/${type}/${number}?format=json&api_key=${CONGRESS_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `${CONGRESS_BASE}/bill/${congress}/${type}/${number}/actions?format=json&limit=20&api_key=${CONGRESS_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `${CONGRESS_BASE}/bill/${congress}/${type}/${number}/summaries?format=json&api_key=${CONGRESS_API_KEY}`,
        { next: { revalidate: 3600 } }
      ),
    ])

    if (!detailRes.ok) {
      if (detailRes.status === 404) {
        return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Congress.gov API error' }, { status: detailRes.status })
    }

    const detailData = await detailRes.json()
    const bill = detailData.bill

    const actionsData = actionsRes.ok ? await actionsRes.json() : {}
    const actions: any[] = actionsData.actions ?? []

    const summariesData = summariesRes.ok ? await summariesRes.json() : {}
    const summaries: any[] = summariesData.summaries ?? []
    const latestSummary = summaries.at(-1)?.text?.replace(/<[^>]+>/g, '') ?? ''

    const sponsor = bill.sponsors?.[0]
    const cosponsors: any[] = bill.cosponsors ?? []

    const voteActions = actions.filter(
      (a: any) =>
        (a.type === 'Floor' || a.recordedVotes) &&
        a.recordedVotes?.length > 0
    )

    const status = mapStatus(actions)

    return NextResponse.json({
      bill: {
        id,
        number: formatBillNumber(type, number),
        title: bill.title,
        congress,
        introducedDate: bill.introducedDate,
        status,
        summary: latestSummary,
        sponsor: sponsor
          ? {
              name: sponsor.fullName,
              bioguideId: sponsor.bioguideId,
              party: sponsor.party,
              state: sponsor.state,
              district: sponsor.district ?? null,
            }
          : null,
        cosponsors: cosponsors.slice(0, 10).map((c: any) => ({
          name: c.fullName,
          bioguideId: c.bioguideId,
          party: c.party,
          state: c.state,
        })),
        policyArea: bill.policyArea?.name ?? null,
        subjects: (bill.subjects?.legislativeSubjects ?? [])
          .slice(0, 8)
          .map((s: any) => s.name),
        congressGovUrl: bill.cboCostEstimates?.[0]?.url ?? `https://www.congress.gov/bill/${congress}th-congress/${type === 'hr' ? 'house-bill' : type === 's' ? 'senate-bill' : type}/${number}`,
        actions: actions.slice(0, 10).map((a: any) => ({
          date: a.actionDate,
          text: a.text,
          type: a.type,
        })),
        votes: voteActions.map((a: any) => ({
          date: a.actionDate,
          chamber: a.actionCode?.startsWith('H') ? 'House' : 'Senate',
          yeas: a.recordedVotes?.[0]?.yeas ?? null,
          nays: a.recordedVotes?.[0]?.nays ?? null,
          url: a.recordedVotes?.[0]?.url ?? null,
        })),
      },
    })
  } catch (err) {
    console.error('[/api/bills/[id]]', err)
    return NextResponse.json({ error: 'Failed to fetch bill' }, { status: 500 })
  }
}
