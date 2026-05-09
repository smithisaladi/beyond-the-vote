import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseSearchParams, DonorsParams } from '@/lib/api-validation'
import { apiError } from '@/lib/api-errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  const parsed = parseSearchParams(DonorsParams, req.nextUrl.searchParams)
  if (!parsed.success) {
    return apiError(parsed.error, 400)
  }
  const { q: rawQ, limit, offset } = parsed.data
  const q = rawQ ?? null

  try {
    const supabase = await createClient()

    let query = supabase
      .from('contributor_leaderboard_cache')
      .select('*', { count: 'exact' })
      .order('total_contributions', { ascending: false })
      .range(offset, offset + limit - 1)

    if (q) {
      const escaped = q.replace(/[%_\\]/g, '\\$&')
      query = query.ilike('cmte_name', `%${escaped}%`)
    }

    const { data, error, count } = await query

    if (error) throw error

    const rows = data ?? []

    // Compute global rank: when searching, use a single query to find the rank
    // of the highest-contributing result, then derive ranks from sorted order.
    let rankMap: Map<string, number> | null = null
    if (q && rows.length > 0) {
      rankMap = new Map<string, number>()
      const uniqueAmounts = [...new Set(rows.map(r => Number(r.total_contributions)))]

      const rankResults = await Promise.all(
        uniqueAmounts.map(async (amount) => {
          const { count: higherCount } = await supabase
            .from('contributor_leaderboard_cache')
            .select('*', { count: 'exact', head: true })
            .gt('total_contributions', amount)
          return { amount, rank: (higherCount ?? 0) + 1 }
        })
      )

      const amountRankMap = new Map(rankResults.map(r => [r.amount, r.rank]))
      for (const row of rows) {
        rankMap.set(row.cmte_id as string, amountRankMap.get(Number(row.total_contributions)) ?? (offset + 1))
      }
    }

    const contributors = rows.map((row, idx) => ({
      cmteId: row.cmte_id,
      rank: rankMap ? rankMap.get(row.cmte_id as string) ?? (offset + idx + 1) : offset + idx + 1,
      cmteName: row.cmte_name,
      directTotal: Number(row.direct_total),
      ieForTotal: Number(row.ie_for_total),
      ieAgainstTotal: Number(row.ie_against_total),
      totalContributions: Number(row.total_contributions),
      recipientCount: Number(row.recipient_count),
      topRecipients: (row.top_recipients ?? []).map((r: {
        bioguide_id: string; name: string; party: string; state: string; chamber: string; amount: number
      }) => ({
        bioguideId: r.bioguide_id,
        name: r.name,
        party: r.party,
        state: r.state,
        chamber: r.chamber,
        amount: Number(r.amount),
      })),
    }))

    return NextResponse.json({
      contributors,
      pagination: { total: count ?? 0, limit, offset },
    })
  } catch (err) {
    console.error('[api/donors]', err)
    return apiError('Failed to load donors', 500)
  }
}
