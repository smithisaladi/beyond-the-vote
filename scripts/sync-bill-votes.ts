/**
 * Syncs bill vote summaries and member positions.
 * For each bill with recorded votes, fetches:
 *   - Senate votes: Senate.gov XML → parsed + lis_id resolved to bioguide_id
 *   - House votes:  Congress.gov House Roll Call API (119th Congress)
 *
 * Run manually: npx tsx scripts/sync-bill-votes.ts
 * Or triggered via: POST /api/cron/sync-bill-votes
 */

import { createServiceClient } from '@/lib/supabase/service'
import { parseSenateVoteXml } from './lib/parse-senate-vote-xml'
import { fetchHouseVote } from './lib/fetch-house-vote'
import { buildLisMap } from './lib/resolve-ids'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'
const DEFAULT_CONGRESS = 119
const BILLS_PER_PAGE = 20
// Look back this many days for bills with recent activity
const LOOKBACK_DAYS = 7

export interface SyncBillVotesResult {
  source: 'bill-votes'
  billsProcessed: number
  newVotes: number
  positionsStored: number
  senateLisResolutions: number
  senateResolutionFailures: number
  duration: string
}

interface RecordedVote {
  chamber: string
  congress: number
  date: string
  rollNumber: number
  sessionNumber: number
  url: string
}

interface BillRef {
  id: string
  billNumber: string  // e.g. "H.R. 1234"
  billTitle: string   // e.g. "The Example Act of 2025"
}

// Maps lowercase bill type codes to their standard abbreviated forms.
function formatBillNumber(type: string, number: string | number): string {
  const abbrevs: Record<string, string> = {
    hr:       'H.R.',
    s:        'S.',
    hjres:    'H.J.Res.',
    sjres:    'S.J.Res.',
    hres:     'H.Res.',
    sres:     'S.Res.',
    hconres:  'H.Con.Res.',
    sconres:  'S.Con.Res.',
  }
  const prefix = abbrevs[type.toLowerCase()] ?? type.toUpperCase()
  return `${prefix} ${number}`
}

async function congressFetch(path: string): Promise<any> {
  const sep = path.includes('?') ? '&' : '?'
  const res = await fetch(
    `${CONGRESS_BASE}${path}${sep}format=json&api_key=${CONGRESS_API_KEY}`
  )
  if (!res.ok) throw new Error(`Congress.gov ${path}: ${res.status}`)
  return res.json()
}

async function getBillsWithRecentActivity(congress: number, lookbackDays: number): Promise<BillRef[]> {
  const from = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')

  const bills: BillRef[] = []
  let offset = 0

  while (true) {
    const data = await congressFetch(
      `/bill/${congress}?fromDateTime=${from}&limit=${BILLS_PER_PAGE}&offset=${offset}&sort=updateDate+desc`
    )
    const raw: any[] = data.bills ?? []
    for (const b of raw) {
      if (b.type && b.number) {
        bills.push({
          id:         `${congress}-${b.type.toLowerCase()}-${b.number}`,
          billNumber: formatBillNumber(b.type, b.number),
          billTitle:  b.title ?? '',
        })
      }
    }
    if (raw.length < BILLS_PER_PAGE) break
    offset += BILLS_PER_PAGE
    if (offset >= 200) break  // cap at 200 bills per sync run
  }

  return bills
}

async function getRecordedVotesForBill(billId: string): Promise<RecordedVote[]> {
  const [congress, type, number] = billId.split('-')
  const data = await congressFetch(
    `/bill/${congress}/${type}/${number}/actions?limit=50`
  )
  const actions: any[] = data.actions ?? []

  const votes: RecordedVote[] = []
  for (const action of actions) {
    for (const rv of action.recordedVotes ?? []) {
      if (rv.rollNumber && rv.url) {
        votes.push({
          chamber:       rv.chamber ?? '',
          congress:      rv.congress ?? parseInt(congress),
          date:          rv.date ?? action.actionDate ?? '',
          rollNumber:    rv.rollNumber,
          sessionNumber: rv.sessionNumber ?? 1,
          url:           rv.url,
        })
      }
    }
  }
  return votes
}

export async function syncBillVotes(
  congress: number = DEFAULT_CONGRESS,
  lookbackDays: number = LOOKBACK_DAYS
): Promise<SyncBillVotesResult> {
  if (!CONGRESS_API_KEY) throw new Error('CONGRESS_API_KEY not set')

  const start = Date.now()
  const supabase = createServiceClient()

  let billsProcessed = 0
  let newVotes = 0
  let positionsStored = 0
  let senateLisResolutions = 0
  let senateResolutionFailures = 0

  // Get bills with recent activity
  const billRefs = await getBillsWithRecentActivity(congress, lookbackDays)
  billsProcessed = billRefs.length

  for (const bill of billRefs) {
    const { id: billId, billNumber, billTitle } = bill

    let recordedVotes: RecordedVote[]
    try {
      recordedVotes = await getRecordedVotesForBill(billId)
    } catch {
      continue
    }

    for (const rv of recordedVotes) {
      const voteId = `${rv.congress}-${rv.chamber.toLowerCase()}-${rv.rollNumber}`

      // Skip if already synced; backfill title if it was never set
      const { data: existing } = await supabase
        .from('bill_vote_summaries')
        .select('id, title, question')
        .eq('id', voteId)
        .maybeSingle()
      if (existing) {
        if (!existing.title) {
          const voteTitle = billTitle
            ? `${billNumber}: ${billTitle} — ${existing.question}`
            : `${billNumber} — ${existing.question}`
          await supabase
            .from('bill_vote_summaries')
            .update({ title: voteTitle })
            .eq('id', voteId)
        }
        continue
      }

      try {
        if (rv.chamber.toLowerCase() === 'senate') {
          // ── Senate: fetch XML from senate.gov ─────────────────────────────
          const xmlRes = await fetch(rv.url)
          if (!xmlRes.ok) continue
          const xml = await xmlRes.text()
          const parsed = parseSenateVoteXml(xml)

          // Resolve lis_ids to bioguide_ids
          const lisIds = parsed.members.map(m => m.lis_member_id)
          const lisMap = await buildLisMap(supabase, lisIds)

          const voteTitle = billTitle
            ? `${billNumber}: ${billTitle} — ${parsed.question}`
            : `${billNumber} — ${parsed.question}`

          const { error: sumErr } = await supabase
            .from('bill_vote_summaries')
            .upsert({
              id:               voteId,
              bill_id:          billId,
              congress:         rv.congress,
              chamber:          'Senate',
              date:             rv.date,
              title:            voteTitle,
              question:         parsed.question,
              result:           parsed.result,
              yea_total:        parsed.yea_total,
              nay_total:        parsed.nay_total,
              present_total:    parsed.present_total,
              not_voting_total: parsed.not_voting_total,
              yea_democrat:     parsed.yea_democrat,
              nay_democrat:     parsed.nay_democrat,
              yea_republican:   parsed.yea_republican,
              nay_republican:   parsed.nay_republican,
              yea_independent:  parsed.yea_independent,
              nay_independent:  parsed.nay_independent,
              source_url:       rv.url,
              synced_at:        new Date().toISOString(),
            }, { onConflict: 'id' })
          if (sumErr) continue

          const positions: any[] = []
          for (const member of parsed.members) {
            const bioguide = lisMap.get(member.lis_member_id)
            if (bioguide) {
              positions.push({ vote_id: voteId, bioguide_id: bioguide, position: member.vote_cast })
              senateLisResolutions++
            } else {
              senateResolutionFailures++
            }
          }

          if (positions.length > 0) {
            const { error: posErr } = await supabase
              .from('bill_vote_positions')
              .upsert(positions, { onConflict: 'vote_id,bioguide_id' })
            if (!posErr) positionsStored += positions.length
          }

          newVotes++

        } else {
          // ── House: Congress.gov House Roll Call API ────────────────────────
          const houseData = await fetchHouseVote(rv.congress, rv.rollNumber, CONGRESS_API_KEY, rv.sessionNumber)
          if (!houseData) continue

          const voteTitle = billTitle
            ? `${billNumber}: ${billTitle} — ${houseData.question}`
            : `${billNumber} — ${houseData.question}`

          const { error: sumErr } = await supabase
            .from('bill_vote_summaries')
            .upsert({
              id:               voteId,
              bill_id:          billId,
              congress:         rv.congress,
              chamber:          'House',
              date:             rv.date,
              title:            voteTitle,
              question:         houseData.question,
              result:           houseData.result,
              yea_total:        houseData.yea_total,
              nay_total:        houseData.nay_total,
              present_total:    houseData.present_total,
              not_voting_total: houseData.not_voting_total,
              yea_democrat:     houseData.yea_democrat,
              nay_democrat:     houseData.nay_democrat,
              yea_republican:   houseData.yea_republican,
              nay_republican:   houseData.nay_republican,
              yea_independent:  houseData.yea_independent,
              nay_independent:  houseData.nay_independent,
              source_url:       rv.url,
              synced_at:        new Date().toISOString(),
            }, { onConflict: 'id' })
          if (sumErr) continue

          const positions = houseData.members.map(m => ({
            vote_id:     voteId,
            bioguide_id: m.bioguide_id,
            position:    m.position,
          }))

          if (positions.length > 0) {
            // Filter to only known legislators
            const bioguideIds = positions.map(p => p.bioguide_id)
            const { data: knownLeg } = await supabase
              .from('legislators')
              .select('bioguide_id')
              .in('bioguide_id', bioguideIds)
            const known = new Set((knownLeg ?? []).map((r: any) => r.bioguide_id))
            const validPositions = positions.filter(p => known.has(p.bioguide_id))

            if (validPositions.length > 0) {
              const { error: posErr } = await supabase
                .from('bill_vote_positions')
                .upsert(validPositions, { onConflict: 'vote_id,bioguide_id' })
              if (!posErr) positionsStored += validPositions.length
            }
          }

          newVotes++
        }
      } catch (err) {
        console.error(`Failed to sync vote ${voteId}:`, err)
        continue
      }
    }
  }

  const duration = `${((Date.now() - start) / 1000).toFixed(1)}s`
  return {
    source: 'bill-votes',
    billsProcessed,
    newVotes,
    positionsStored,
    senateLisResolutions,
    senateResolutionFailures,
    duration,
  }
}

if (require.main === module || process.argv[1]?.endsWith('sync-bill-votes.ts')) {
  syncBillVotes()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error(err); process.exit(1) })
}
