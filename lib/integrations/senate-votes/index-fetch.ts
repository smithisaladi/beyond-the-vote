// lib/integrations/senate-votes/index-fetch.ts

const SENATE_VOTE_BASE  = 'https://www.senate.gov/legislative/LIS/roll_call_votes'
const SENATE_INDEX_BASE = 'https://www.senate.gov/legislative/LIS/roll_call_lists'

// Try the senate.gov index XML first; fall back to parallel probing.
// NOTE: senate.gov returns HTTP 200 with an HTML error page for missing votes,
// so we must validate the response body contains XML, not just check r.ok.
export async function maxSenateVoteNumber(congress: number, session: number): Promise<number> {
  try {
    const r = await fetch(
      `${SENATE_INDEX_BASE}/vote_menu_${congress}_${session}.xml`,
      { next: { revalidate: 3600 }, signal: AbortSignal.timeout(5000) }
    )
    if (r.ok) {
      const xml = await r.text()
      // Index uses <vote_number> tags (5-digit zero-padded strings like "00074")
      const nums = [...xml.matchAll(/<vote_number>(\d+)<\/vote_number>/g)]
        .map(m => parseInt(m[1]))
      if (nums.length) return Math.max(...nums)
    }
  } catch { /* fall through to probe */ }

  // Fallback: probe round numbers, but validate body is real XML (senate.gov
  // returns 200+HTML for non-existent votes, so r.ok alone is not enough).
  const probes = [300, 200, 150, 100, 75, 50, 25, 10]
  const pad = (n: number) => String(n).padStart(5, '0')
  const results = await Promise.allSettled(
    probes.map(n =>
      fetch(
        `${SENATE_VOTE_BASE}/vote${congress}${session}/vote_${congress}_${session}_${pad(n)}.xml`,
        { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) }
      )
        .then(async r => {
          if (!r.ok) return { n, ok: false }
          const text = await r.text()
          // Real vote XML always contains <vote_title>; error HTML does not
          return { n, ok: text.includes('<vote_title>') }
        })
        .catch(() => ({ n, ok: false }))
    )
  )
  let max = 0
  for (const r of results)
    if (r.status === 'fulfilled' && r.value.ok) max = Math.max(max, r.value.n)
  return max
}
