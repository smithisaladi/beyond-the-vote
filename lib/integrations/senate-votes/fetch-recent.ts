// lib/integrations/senate-votes/fetch-recent.ts
import type { PoliticianVote } from '@/lib/types/politicians'
import { senateSessions, SENATE_VOTE_BASE } from './sessions'
import { maxSenateVoteNumber } from './index-fetch'
import { parseSenateVoteXml, type SenateMemberKey } from './xml-parser'

export async function fetchRecentVotesForSenator(key: SenateMemberKey): Promise<PoliticianVote[] | null> {
  const sessions = senateSessions()
  const votes: PoliticianVote[] = []
  const pad = (n: number) => String(n).padStart(5, '0')

  for (const { congress, session } of sessions) {
    if (votes.length >= 50) break
    const max = await maxSenateVoteNumber(congress, session)
    if (max === 0) continue

    let current = max
    const base  = `${SENATE_VOTE_BASE}/vote${congress}${session}`

    while (current > 0 && votes.length < 50) {
      const batchNums = Array.from({ length: Math.min(15, current) }, (_, i) => current - i)
      current -= batchNums.length

      const xmlResults = await Promise.allSettled(
        batchNums.map(n =>
          fetch(
            `${base}/vote_${congress}_${session}_${pad(n)}.xml`,
            { next: { revalidate: 86400 }, signal: AbortSignal.timeout(6000) }
          )
            .then(async r => {
              if (!r.ok) return null
              const text = await r.text()
              // senate.gov returns 200+HTML for missing votes; real XML has <vote_title>
              return text.includes('<vote_title>') ? text : null
            })
            .catch(() => null)
        )
      )

      for (let i = 0; i < batchNums.length; i++) {
        if (votes.length >= 50) break
        const r   = xmlResults[i]
        const xml = r.status === 'fulfilled' ? r.value : null
        if (!xml) continue
        const v = parseSenateVoteXml(xml, key, `senate-${congress}-${session}-${batchNums[i]}`)
        if (v) votes.push(v)
      }
    }
  }

  return votes.length > 0 ? votes : null
}
