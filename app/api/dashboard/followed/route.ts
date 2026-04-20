import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ordinal } from '@/lib/format'

/**
 * Lightweight batch endpoint for the dashboard's followed-politicians section.
 * Returns only the fields the dashboard needs, querying local DB only (no external APIs).
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get followed politician IDs
    const { data: follows } = await supabase
      .from('followed_politicians')
      .select('politician_id')
      .eq('user_id', user.id)

    if (!follows || follows.length === 0) {
      return NextResponse.json({ politicians: [] })
    }

    const ids = follows.map((f: { politician_id: string }) => f.politician_id)

    // Fetch legislators in one query
    const { data: legislators } = await supabase
      .from('legislators')
      .select('bioguide_id, full_name, title, party, state_full, state, district, photo_url')
      .in('bioguide_id', ids)

    if (!legislators || legislators.length === 0) {
      return NextResponse.json({ politicians: [] })
    }

    // Fetch latest vote per legislator from bill_vote_positions + bill_vote_summaries
    const { data: recentVotes } = await supabase
      .from('bill_vote_positions')
      .select(`
        bioguide_id,
        position,
        vote_id,
        bill_vote_summaries (bill_id, date, title, question)
      `)
      .in('bioguide_id', ids)
      .order('bill_vote_summaries(date)', { ascending: false })
      .limit(ids.length * 5)

    // Collect bill_ids to look up real bill titles
    const voteBillIds = [...new Set(
      (recentVotes ?? [])
        .map((r: any) => r.bill_vote_summaries?.bill_id)
        .filter(Boolean) as string[]
    )]
    const billTitleMap: Record<string, string> = {}
    if (voteBillIds.length > 0) {
      const { data: billRows } = await supabase
        .from('bills')
        .select('bill_id, title')
        .in('bill_id', voteBillIds)
      for (const row of billRows ?? []) {
        if (row.title) billTitleMap[row.bill_id] = row.title
      }
    }

    // Group votes by bioguide_id — pick most recent per legislator
    const latestVoteMap = new Map<string, { bill: string; billId: string; billTitle: string; date: string; vote: string; question: string }>()
    if (recentVotes) {
      const sorted = [...recentVotes]
        .filter((r: any) => r.bill_vote_summaries)
        .sort((a, b) => {
          const dateA = (a.bill_vote_summaries as any)?.date ?? ''
          const dateB = (b.bill_vote_summaries as any)?.date ?? ''
          return dateB.localeCompare(dateA)
        })
      for (const v of sorted) {
        if (latestVoteMap.has(v.bioguide_id)) continue
        const summary = v.bill_vote_summaries as any
        const billId = summary?.bill_id ?? ''
        latestVoteMap.set(v.bioguide_id, {
          bill: billTitleMap[billId] ?? summary?.title ?? billId ?? v.vote_id,
          billId,
          billTitle: billTitleMap[billId] ?? '',
          date: summary?.date
            ? new Date(summary.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '',
          vote: v.position === 'Yea' ? 'Yea' : v.position === 'Nay' ? 'Nay' : v.position,
          question: summary?.question ?? '',
        })
      }
    }

    const politicians = legislators.map((l: any) => ({
      id: l.bioguide_id,
      name: l.full_name,
      title: l.title,
      party: l.party,
      state: l.state_full,
      photo: l.photo_url ?? null,
      district: l.district != null ? ordinal(Number(l.district)) : null,
      latestVote: latestVoteMap.get(l.bioguide_id) ?? null,
    }))

    return NextResponse.json({ politicians })
  } catch (err) {
    console.error('Dashboard followed API error:', err)
    return NextResponse.json({ error: 'Failed to load followed politicians' }, { status: 500 })
  }
}
