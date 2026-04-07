import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

function mapCategory(policyArea?: string | null): Category | undefined {
  if (!policyArea) return undefined
  return POLICY_AREA_MAP[policyArea] as Category | undefined
}

// Reverse map: Category → list of Congress.gov policyArea strings
const CATEGORY_TO_POLICY_AREAS: Record<string, string[]> = {}
for (const [policyArea, category] of Object.entries(POLICY_AREA_MAP)) {
  if (!CATEGORY_TO_POLICY_AREAS[category]) CATEGORY_TO_POLICY_AREAS[category] = []
  CATEGORY_TO_POLICY_AREAS[category].push(policyArea)
}

interface Bill {
  id: string
  number: string
  title: string
  sponsor: string
  party: 'Democrat' | 'Republican' | 'Independent'
  status: Status
  category?: Category
  lastAction: string
  lastActionTimestamp: number
  summary: string
}

function mapRowToBill(row: any): Bill {
  return {
    id:                 row.bill_id,
    number:             row.bill_number ?? row.bill_id,
    title:              row.title,
    sponsor:            row.sponsor_name ?? 'Unknown',
    party:              (row.sponsor_party as Bill['party']) ?? 'Independent',
    status:             (row.status as Status) ?? 'Active',
    category:           mapCategory(row.policy_area),
    lastAction:         row.last_action_date
                          ? new Date(row.last_action_date).toLocaleDateString('en-US', {
                              month: 'short', day: 'numeric', year: 'numeric',
                            })
                          : '',
    lastActionTimestamp: row.last_action_date
                          ? new Date(row.last_action_date).getTime()
                          : 0,
    summary:            row.summary ?? row.last_action_text ?? '',
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const q = searchParams.get('q')?.trim() ?? ''
  const status = searchParams.get('status') ?? ''
  const category = searchParams.get('category') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 250)
  const offset = parseInt(searchParams.get('offset') ?? '0')

  try {
    const supabase = await createClient()

    // Text search mode: use hybrid_bill_search RPC (FTS + trigram RRF)
    if (q) {
      const policyAreas = category ? (CATEGORY_TO_POLICY_AREAS[category] ?? []) : null

      const { data, error } = await supabase.rpc('hybrid_bill_search', {
        query_text:      q,
        result_limit:    limit,
        offset_count:    offset,
        status_filter:   status || null,
        topic_filter:    null,
        policy_areas:    policyAreas,
        congress_filter: null,
      })

      if (error) throw new Error(error.message)

      const results = (data ?? []) as any[]

      return NextResponse.json({
        bills: results.map(mapRowToBill),
        pagination: { total: results.length + offset, limit, offset },
      })
    }

    // Browse mode: direct table query with server-side filters
    let query = supabase
      .from('bills')
      .select('*', { count: 'exact' })

    if (status) query = query.eq('status', status)
    if (category) {
      const areas = CATEGORY_TO_POLICY_AREAS[category] ?? []
      if (areas.length > 0) {
        query = query.in('policy_area', areas)
      } else {
        // No matching policy areas — return empty
        return NextResponse.json({
          bills: [],
          pagination: { total: 0, limit, offset },
        })
      }
    }

    query = query
      .order('introduced_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) throw new Error(error.message)

    return NextResponse.json({
      bills: (data ?? []).map(mapRowToBill),
      pagination: { total: count ?? 0, limit, offset },
    })
  } catch (err) {
    console.error('[/api/bills]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch bills' },
      { status: 500 },
    )
  }
}
