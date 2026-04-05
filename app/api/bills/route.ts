import { NextRequest, NextResponse } from 'next/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'

type Status = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'
type Category =
  | 'Environment'
  | 'Economy'
  | 'Healthcare'
  | 'Defense'
  | 'Education'
  | 'Housing'
  | 'Technology'
  | 'Immigration'

const POLICY_AREA_MAP: Record<string, Category> = {
  'Environmental Protection': 'Environment',
  'Energy': 'Environment',
  'Public Lands and Natural Resources': 'Environment',
  'Water Resources Development': 'Environment',
  'Health': 'Healthcare',
  'Economics and Public Finance': 'Economy',
  'Commerce': 'Economy',
  'Finance and Financial Sector': 'Economy',
  'Labor and Employment': 'Economy',
  'Taxation': 'Economy',
  'Armed Forces and National Security': 'Defense',
  'Education': 'Education',
  'Housing and Community Development': 'Housing',
  'Science, Technology, Communications': 'Technology',
  'Immigration': 'Immigration',
}

function mapCategory(policyArea?: string): Category | undefined {
  if (!policyArea) return undefined
  return POLICY_AREA_MAP[policyArea] as Category | undefined
}

function mapStatus(latestAction?: string, introducedDate?: string): Status {
  const action = (latestAction ?? '').toLowerCase()

  if (
    action.includes('became public law') ||
    action.includes('signed by president') ||
    action.includes('passed the senate') ||
    action.includes('passed the house') ||
    action.includes('presented to president')
  ) {
    return 'Passed'
  }

  if (
    action.includes('failed') ||
    action.includes('defeated') ||
    action.includes('vetoed') ||
    action.includes('rejected')
  ) {
    return 'Failed'
  }

  if (action.includes('referred to') || action.includes('committee')) {
    // Check if it's stalled (no action in 6+ months)
    if (introducedDate) {
      const introduced = new Date(introducedDate)
      const monthsAgo = (Date.now() - introduced.getTime()) / (1000 * 60 * 60 * 24 * 30)
      if (monthsAgo > 6) return 'Stalled'
    }
    return 'Committee'
  }

  return 'Active'
}

function formatBillId(congress: number, type: string, number: number): string {
  return `${congress}-${type.toLowerCase()}-${number}`
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

export async function GET(request: NextRequest) {
  if (!CONGRESS_API_KEY) {
    return NextResponse.json({ error: 'CONGRESS_API_KEY is not configured' }, { status: 500 })
  }

  const { searchParams } = request.nextUrl
  const q = searchParams.get('q') ?? ''
  const status = searchParams.get('status') ?? ''
  const category = searchParams.get('category') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 250)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  try {
    const params = new URLSearchParams({
      format: 'json',
      limit: String(limit),
      offset: String(offset),
      sort: 'updateDate desc',
      api_key: CONGRESS_API_KEY,
    })

    if (q) params.set('query', q)

    // Congress.gov supports filtering by policyArea
    if (category) {
      const policyArea = Object.entries(POLICY_AREA_MAP).find(([, v]) => v === category)?.[0]
      if (policyArea) params.set('policyArea', policyArea)
    }

    const url = `${CONGRESS_BASE}/bill?${params.toString()}`
    const res = await fetch(url, { next: { revalidate: 300 } })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error?.message ?? 'Congress.gov API error' },
        { status: res.status }
      )
    }

    const data = await res.json()

    let bills = (data.bills ?? []).map((bill: any) => {
      const mappedStatus = mapStatus(
        bill.latestAction?.text,
        bill.introducedDate
      )
      const mappedCategory = mapCategory(bill.policyArea?.name)

      return {
        id: formatBillId(bill.congress, bill.type, bill.number),
        number: formatBillNumber(bill.type, bill.number),
        title: bill.title,
        sponsor: bill.sponsors?.[0]
          ? `${bill.sponsors[0].title ?? ''} ${bill.sponsors[0].fullName}`.trim()
          : 'Unknown',
        party: 'Independent' as const, // party not in list endpoint; detail has it
        status: mappedStatus,
        category: mappedCategory,
        lastAction: bill.latestAction?.actionDate
          ? new Date(bill.latestAction.actionDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })
          : '',
        lastActionTimestamp: bill.latestAction?.actionDate
          ? new Date(bill.latestAction.actionDate).getTime()
          : 0,
        summary: bill.latestAction?.text ?? '',
        updateDate: bill.updateDate,
      }
    })

    // Client-side status filter (Congress.gov doesn't filter by status natively)
    if (status) {
      bills = bills.filter((b: any) => b.status === status)
    }

    return NextResponse.json({
      bills,
      pagination: {
        total: data.pagination?.count ?? bills.length,
        limit,
        offset,
      },
    })
  } catch (err) {
    console.error('[/api/bills]', err)
    return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 })
  }
}
