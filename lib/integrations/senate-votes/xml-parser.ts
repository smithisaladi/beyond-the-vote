// lib/integrations/senate-votes/xml-parser.ts
import type { PoliticianVote } from '@/lib/types/politicians'

export type SenateMemberKey = { lisId: string } | { lastName: string; state: string }

// Extract this member's block from a senate vote XML, return vote or null.
// Matches by lis_member_id (most reliable) or last_name+state (fallback).
export function parseSenateVoteXml(
  xml: string,
  key: SenateMemberKey,
  voteId: string,
): PoliticianVote | null {
  // Find the <member> block matching this senator
  const memberBlockRe = /<member>([\s\S]*?)<\/member>/g
  let m: RegExpExecArray | null
  let memberBlock: string | null = null
  while ((m = memberBlockRe.exec(xml)) !== null) {
    const block = m[1]
    const match = 'lisId' in key
      ? block.includes(`<lis_member_id>${key.lisId}</lis_member_id>`)
      : block.includes(`<last_name>${key.lastName}</last_name>`) &&
        block.includes(`<state>${key.state}</state>`)
    if (match) { memberBlock = block; break }
  }
  if (!memberBlock) return null

  const rawPos = (memberBlock.match(/<vote_cast>([^<]+)<\/vote_cast>/)?.[1] ?? '').trim().toLowerCase()
  // Skip non-yea/nay positions (Not Voting, Present, Paired, etc.)
  if (rawPos !== 'yea' && rawPos !== 'aye' && rawPos !== 'yes' && rawPos !== 'nay' && rawPos !== 'no') return null

  const title   = xml.match(/<vote_title>([^<]+)<\/vote_title>/)?.[1]?.trim() ?? ''
  const dateStr = xml.match(/<vote_date>([^<]+)<\/vote_date>/)?.[1]?.trim() ?? ''
  let dateFormatted = ''
  if (dateStr) {
    try {
      // senate.gov date format: "March 10, 2026,  02:16 PM" — extract just the date part
      const datePart = dateStr.match(/([A-Za-z]+ \d+, \d{4})/)?.[1] ?? dateStr
      dateFormatted = new Date(datePart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch { /**/ }
  }

  return {
    id:              voteId,
    bill:            title || voteId,
    billId:          null,
    billTitle:       '',
    date:            dateFormatted,
    vote:            (rawPos === 'nay' || rawPos === 'no') ? 'Nay' : 'Yea',
    question:        title || null,
    donorAlignments: [],
  }
}
