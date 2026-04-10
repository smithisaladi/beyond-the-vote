import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q') || null
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100)
  const offset = Number(searchParams.get('offset') ?? 0)

  try {
    const supabase = await createClient()

    let query = supabase
      .from('contributor_leaderboard_cache')
      .select('*', { count: 'exact' })
      .order('total_contributions', { ascending: false })
      .range(offset, offset + limit - 1)

    if (q) {
      query = query.ilike('cmte_name', `%${q}%`)
    }

    const { data, error, count } = await query

    if (error) throw error

    const rows = data ?? []

    const contributors = rows.map((row) => ({
      cmteId: row.cmte_id,
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
    console.error('Donors API error:', err)
    return NextResponse.json(
      { error: 'Failed to load donors' },
      { status: 500 },
    )
  }
}
