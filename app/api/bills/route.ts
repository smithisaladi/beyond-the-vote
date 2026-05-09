import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { BillStatus as Status } from '@/lib/bills'
import type { BillSummary } from '@/lib/types/bills'
import type { BillRow, LegislatorLite } from '@/lib/types/supabase-rows'
import { hybridBillSearch } from '@/lib/queries/hybrid-bill-search'
import { parseSearchParams, BillsParams } from '@/lib/api-validation'
import { apiError } from '@/lib/api-errors'
import { toParty } from '@/lib/party'

async function enrichBillsWithSponsors(
  bills: BillRow[],
  supabase: SupabaseClient,
): Promise<BillRow[]> {
  const missingIds = [...new Set(
    bills
      .filter(r => r.sponsor_bioguide_id && (!r.sponsor_party || !r.sponsor_name))
      .map(r => r.sponsor_bioguide_id as string)
  )]
  if (missingIds.length === 0) return bills
  const { data: legRows } = await supabase
    .from('legislators')
    .select('bioguide_id, full_name, party')
    .in('bioguide_id', missingIds)
  const legMap = new Map<string, LegislatorLite>(
    ((legRows ?? []) as LegislatorLite[]).map(l => [l.bioguide_id, l])
  )
  return bills.map(b => ({
    ...b,
    sponsor_party: b.sponsor_party ?? legMap.get(b.sponsor_bioguide_id ?? '')?.party ?? null,
    sponsor_name: b.sponsor_name ?? legMap.get(b.sponsor_bioguide_id ?? '')?.full_name ?? null,
  }))
}

export const revalidate = 300

function mapRowToBill(row: BillRow): BillSummary {
  return {
    id:                 row.bill_id,
    number:             row.bill_number ?? row.bill_id,
    title:              row.title,
    sponsor:            row.sponsor_name ?? 'Unknown',
    party:              toParty(row.sponsor_party),
    status:             (row.status as Status) ?? 'Active',
    topics:             row.topics ?? [],
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
  const parsed = parseSearchParams(BillsParams, request.nextUrl.searchParams)
  if (!parsed.success) {
    return apiError(parsed.error, 400)
  }
  const { q: rawQ, status, topics, date: dateFilter, sort, limit, offset, billIds: billIdsParam } = parsed.data
  const q = rawQ ?? ''

  try {
    const supabase = await createClient()

    const topicSlugs = topics ? topics.split(',').filter(Boolean) : []
    const billIds = billIdsParam ? billIdsParam.split(',').filter(Boolean) : []

    // Text search mode: hybrid FTS + trigram RRF via direct Postgres query
    if (q) {
      const results = await hybridBillSearch({
        queryText:    q,
        resultLimit:  limit,
        offsetCount:  offset,
        statusFilter: status || null,
        topicFilters: topicSlugs.length > 0 ? topicSlugs : null,
        billIds:      billIds.length > 0 ? billIds : null,
      })

      // HybridBillSearchRow is structurally compatible with BillRow (status: string | null);
      // mapRowToBill narrows status with `as Status`.
      const enriched = await enrichBillsWithSponsors(results as BillRow[], supabase)

      // If we got a full page, signal there may be more results
      const estimatedTotal = enriched.length + offset + (enriched.length === limit ? 1 : 0)

      return NextResponse.json({
        bills: enriched.map(mapRowToBill),
        pagination: { total: estimatedTotal, limit, offset },
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
    if (topicSlugs.length > 0) {
      query = query.overlaps('topics', topicSlugs)
    }
    if (billIds.length > 0) {
      query = query.in('bill_id', billIds)
    }
    if (dateFilter === 'month') {
      const d = new Date(); d.setMonth(d.getMonth() - 1)
      query = query.gte('last_action_date', d.toISOString())
    } else if (dateFilter === 'year') {
      const d = new Date(); d.setFullYear(d.getFullYear() - 1)
      query = query.gte('last_action_date', d.toISOString())
    }

    query = query
      .order('introduced_date', { ascending: sort === 'oldest', nullsFirst: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) throw new Error(error.message)

    const rows = await enrichBillsWithSponsors((data ?? []) as BillRow[], supabase)

    return NextResponse.json({
      bills: rows.map(mapRowToBill),
      pagination: { total: count ?? 0, limit, offset },
    })
  } catch (err) {
    console.error('[api/bills]', err)
    return apiError('Failed to load bills', 500)
  }
}
