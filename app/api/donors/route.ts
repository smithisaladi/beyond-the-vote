import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q') || null
  const limit = Math.min(Number(searchParams.get('limit') ?? 20), 100)
  const offset = Number(searchParams.get('offset') ?? 0)

  try {
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('contributor_leaderboard', {
      search_text: q,
      result_limit: limit,
      offset_count: offset,
    })

    if (error) throw error

    const rows = data ?? []
    const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0

    const contributors = rows.map((row: {
      cmte_id: string
      cmte_name: string
      direct_total: number
      ie_for_total: number
      ie_against_total: number
      total_contributions: number
      recipient_count: number
      top_recipients: { bioguide_id: string; name: string; party: string; state: string; chamber: string; amount: number }[]
    }) => ({
      cmteId: row.cmte_id,
      cmteName: row.cmte_name,
      directTotal: Number(row.direct_total),
      ieForTotal: Number(row.ie_for_total),
      ieAgainstTotal: Number(row.ie_against_total),
      totalContributions: Number(row.total_contributions),
      recipientCount: Number(row.recipient_count),
      topRecipients: (row.top_recipients ?? []).map((r) => ({
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
      pagination: { total: totalCount, limit, offset },
    })
  } catch (err) {
    console.error('Donors API error:', err)
    return NextResponse.json(
      { error: 'Failed to load donors' },
      { status: 500 },
    )
  }
}
