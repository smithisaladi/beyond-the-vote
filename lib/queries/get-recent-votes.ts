// lib/queries/get-recent-votes.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PoliticianVote } from '@/lib/types/politicians'

interface VotePositionRow {
  position: string
  bill_vote_summaries: {
    id: string
    bill_id: string
    chamber: string
    date: string
    title: string
    question: string
    result: string
    yea_total: number
    nay_total: number
    yea_democrat: number
    nay_democrat: number
    yea_republican: number
    nay_republican: number
  } | null
}

export async function fetchRecentVotesFromDB(
  bioguideId: string,
  supabase: SupabaseClient,
): Promise<PoliticianVote[]> {
  const { data, error } = await supabase
    .from('bill_vote_positions')
    .select(`
      position,
      bill_vote_summaries (
        id, bill_id, chamber, date, title, question, result,
        yea_total, nay_total, yea_democrat, nay_democrat,
        yea_republican, nay_republican
      )
    `)
    .eq('bioguide_id', bioguideId)
    .order('bill_vote_summaries(date)', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[get-recent-votes] Failed to fetch vote positions:', error.message)
    return []
  }

  // Collect bill_ids so we can look up real bill titles
  const rows = (data ?? []) as unknown as VotePositionRow[]
  const billIds = [...new Set(
    rows
      .map((row) => row.bill_vote_summaries?.bill_id)
      .filter(Boolean) as string[]
  )]

  // Fetch actual bill titles from bills table
  const billTitleMap: Record<string, string> = {}
  if (billIds.length > 0) {
    const { data: billRows, error: billError } = await supabase
      .from('bills')
      .select('bill_id, title')
      .in('bill_id', billIds)
    if (billError) {
      console.error('[get-recent-votes] Failed to fetch bill titles:', billError.message)
      // Continue with empty title map — votes are still usable without titles
    }
    for (const row of billRows ?? []) {
      if (row.title) billTitleMap[row.bill_id] = row.title
    }
  }

  return rows
    .map((row) => {
      const summary = row.bill_vote_summaries
      if (!summary) return null
      // Prefer the actual bill title from bills table over the vote question
      const billTitle = summary.bill_id ? billTitleMap[summary.bill_id] : null
      return {
        id:              summary.id,
        bill:            billTitle || summary.title || summary.question,
        billId:          summary.bill_id ?? null,
        billTitle:       billTitle ?? '',
        date:            summary.date
          ? new Date(summary.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
          : '',
        vote:            row.position as 'Yea' | 'Nay',
        question:        summary.question ?? null,
        donorAlignments: [],
      }
    })
    .filter(Boolean) as PoliticianVote[]
}
