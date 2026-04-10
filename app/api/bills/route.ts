import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { BillStatus as Status } from '@/lib/bills'
import { mapStatus } from '@/lib/bills'

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

function normalizeParty(party?: string | null): 'Democrat' | 'Republican' | 'Independent' {
  if (!party) return 'Independent'
  const p = party.trim().toUpperCase()
  if (p === 'D' || p === 'DEMOCRAT' || p === 'DEMOCRATIC') return 'Democrat'
  if (p === 'R' || p === 'REPUBLICAN') return 'Republican'
  return 'Independent'
}

function mapRowToBill(row: any): Bill {
  return {
    id:                 row.bill_id,
    number:             row.bill_number ?? row.bill_id,
    title:              row.title,
    sponsor:            row.sponsor_name ?? 'Unknown',
    party:              normalizeParty(row.sponsor_party),
    status:             mapStatus(row.last_action_text, row.introduced_date),
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
  const dateFilter = searchParams.get('date') ?? ''
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

      // Enrich missing sponsor fields from legislators table
      const missingIds1 = [...new Set(
        results.filter((r: any) => r.sponsor_bioguide_id && (!r.sponsor_party || !r.sponsor_name))
          .map((r: any) => r.sponsor_bioguide_id as string)
      )]
      if (missingIds1.length > 0) {
        const { data: legRows } = await supabase
          .from('legislators')
          .select('bioguide_id, full_name, party')
          .in('bioguide_id', missingIds1)
        const legMap = new Map((legRows ?? []).map((l: any) => [l.bioguide_id, l]))
        for (const row of results) {
          if (row.sponsor_bioguide_id) {
            const leg = legMap.get(row.sponsor_bioguide_id)
            if (leg) {
              if (!row.sponsor_party) row.sponsor_party = leg.party ?? null
              if (!row.sponsor_name) row.sponsor_name = leg.full_name ?? null
            }
          }
        }
      }

      return NextResponse.json({
        bills: results.map(mapRowToBill),
        pagination: { total: results.length + offset, limit, offset },
      })
    }

    // Browse mode: direct table query with server-side filters
    let query = supabase
      .from('bills')
      .select('*', { count: 'exact' })

    if (status) {
      const statuses = status.split(',').filter(Boolean)
      if (statuses.length === 1) query = query.eq('status', statuses[0])
      else if (statuses.length > 1) query = query.in('status', statuses)
    }
    if (category) {
      const cats = category.split(',').filter(Boolean)
      const allAreas = cats.flatMap(c => CATEGORY_TO_POLICY_AREAS[c] ?? [])
      if (allAreas.length > 0) {
        query = query.in('policy_area', allAreas)
      } else {
        return NextResponse.json({ bills: [], pagination: { total: 0, limit, offset } })
      }
    }
    if (dateFilter === 'month') {
      query = query.gte('last_action_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    } else if (dateFilter === 'year') {
      query = query.gte('last_action_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
    }

    query = query
      .order('introduced_date', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) throw new Error(error.message)

    // Enrich missing sponsor fields from legislators table
    const rows = (data ?? []) as any[]
    const missingIds2 = [...new Set(
      rows.filter((r: any) => r.sponsor_bioguide_id && (!r.sponsor_party || !r.sponsor_name))
        .map((r: any) => r.sponsor_bioguide_id as string)
    )]
    if (missingIds2.length > 0) {
      const { data: legRows } = await supabase
        .from('legislators')
        .select('bioguide_id, full_name, party')
        .in('bioguide_id', missingIds2)
      const legMap = new Map((legRows ?? []).map((l: any) => [l.bioguide_id, l]))
      for (const row of rows) {
        if (row.sponsor_bioguide_id) {
          const leg = legMap.get(row.sponsor_bioguide_id)
          if (leg) {
            if (!row.sponsor_party) row.sponsor_party = leg.party ?? null
            if (!row.sponsor_name) row.sponsor_name = leg.full_name ?? null
          }
        }
      }
    }

    return NextResponse.json({
      bills: rows.map(mapRowToBill),
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
