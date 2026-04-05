/**
 * Syncs DW-NOMINATE ideology scores from VoteView for the 119th Congress.
 * Run manually: npx tsx scripts/sync-voteview.ts
 * Or triggered via: POST /api/cron/sync-voteview
 */

import { createServiceClient } from '@/lib/supabase/service'

const VOTEVIEW_MEMBERS_URL =
  'https://voteview.com/static/data/out/members/HS119_members.csv'

export interface SyncVoteviewResult {
  source: 'voteview'
  upserted: number
  skipped: number
  duration: string
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes }
    else if (ch === ',' && !inQuotes) { result.push(current); current = '' }
    else { current += ch }
  }
  result.push(current)
  return result
}

export async function syncVoteview(): Promise<SyncVoteviewResult> {
  const start = Date.now()
  const supabase = createServiceClient()

  const res = await fetch(VOTEVIEW_MEMBERS_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`Failed to fetch VoteView members: ${res.status}`)
  const text = await res.text()

  const lines = text.split('\n')
  const headers = parseCSVLine(lines[0])

  // VoteView CSV columns (may vary): congress,chamber,icpsr,state_icpsr,district_code,
  //   state_abbrev,party_code,occupancy,last_means,bioname,bioguide_id,born,died,
  //   nominate_dim1,nominate_dim2,nominate_log_likelihood,nominate_geo_mean_probability,
  //   nominate_number_of_votes,nominate_number_of_errors,conditional
  const idx = (name: string) => headers.indexOf(name)

  const iCongress    = idx('congress')
  const iChamber     = idx('chamber_code') !== -1 ? idx('chamber_code') : idx('chamber')
  const iBioguide    = idx('bioguide_id')
  const iDim1        = idx('nominate_dim1')
  const iDim2        = idx('nominate_dim2')
  const iNumVotes    = idx('nominate_number_of_votes')
  const iGeoMean     = idx('nominate_geo_mean_probability')

  if (iBioguide === -1) throw new Error('VoteView CSV missing bioguide_id column')

  // Fetch existing legislators so we only upsert for known members
  const { data: legData } = await supabase.from('legislators').select('bioguide_id')
  const knownBioguides = new Set((legData ?? []).map((r: any) => r.bioguide_id))

  const rows: any[] = []
  let skipped = 0

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue
    const cols = parseCSVLine(line)
    const bioguide = cols[iBioguide]?.trim()
    if (!bioguide || !knownBioguides.has(bioguide)) { skipped++; continue }

    const congress = parseInt(cols[iCongress])
    if (congress !== 119) continue  // Filter to current Congress

    const chamberRaw = (cols[iChamber] ?? '').toLowerCase()
    const chamber = chamberRaw.includes('s') ? 'senate' : 'house'

    rows.push({
      bioguide_id:   bioguide,
      congress:      119,
      chamber,
      nominate_dim1: parseFloat(cols[iDim1]) || null,
      nominate_dim2: parseFloat(cols[iDim2]) || null,
      num_votes:     parseInt(cols[iNumVotes]) || null,
      geo_mean_prob: parseFloat(cols[iGeoMean]) || null,
      synced_at:     new Date().toISOString(),
    })
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from('member_scores')
      .upsert(rows, { onConflict: 'bioguide_id' })
    if (error) throw new Error(`member_scores upsert: ${error.message}`)
  }

  const duration = `${((Date.now() - start) / 1000).toFixed(1)}s`
  return { source: 'voteview', upserted: rows.length, skipped, duration }
}

if (require.main === module || process.argv[1]?.endsWith('sync-voteview.ts')) {
  syncVoteview()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error(err); process.exit(1) })
}
