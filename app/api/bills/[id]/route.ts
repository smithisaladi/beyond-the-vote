import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { formatBillType } from '@/lib/format'
import type {
  CongressBillResponse,
  CongressBillAction,
  CongressBillSummary,
  CongressBillCosponsor,
  CongressBillSubject,
} from '@/lib/types/congress'
import type {
  BillVoteSummaryRow,
  BillVotePositionRow,
} from '@/lib/types/supabase-rows'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'

const CONGRESS_GOV_TYPE: Record<string, string> = {
  hr: 'house-bill',
  s: 'senate-bill',
  hjres: 'house-joint-resolution',
  sjres: 'senate-joint-resolution',
  hconres: 'house-concurrent-resolution',
  sconres: 'senate-concurrent-resolution',
  hres: 'house-resolution',
  sres: 'senate-resolution',
}

function parseId(id: string): { congress: number; type: string; number: number } | null {
  const parts = id.split('-')
  if (parts.length < 3) return null
  const congress = parseInt(parts[0])
  const type = parts[1]
  const number = parseInt(parts.slice(2).join(''))
  if (isNaN(congress) || isNaN(number) || !type) return null
  return { congress, type, number }
}

function formatBillNumber(type: string, number: number): string {
  return `${formatBillType(type)} ${number}`
}

import type { BillStatus } from '@/lib/bills'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  if (!CONGRESS_API_KEY) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }

  const { id } = await params
  const parsed = parseId(id)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid bill ID' }, { status: 400 })
  }

  const { congress, type, number } = parsed
  const supabase = await createClient()

  // Fetch Congress.gov data + local vote data in parallel
  const [detailRes, actionsRes, summariesRes, dbVotesRes, dbBillRes] = await Promise.allSettled([
    fetch(
      `${CONGRESS_BASE}/bill/${congress}/${type}/${number}?format=json&api_key=${CONGRESS_API_KEY}`,
      { next: { revalidate: 3600 } }
    ),
    fetch(
      `${CONGRESS_BASE}/bill/${congress}/${type}/${number}/actions?format=json&limit=20&api_key=${CONGRESS_API_KEY}`,
      { next: { revalidate: 3600 } }
    ),
    fetch(
      `${CONGRESS_BASE}/bill/${congress}/${type}/${number}/summaries?format=json&api_key=${CONGRESS_API_KEY}`,
      { next: { revalidate: 3600 } }
    ),
    supabase
      .from('bill_vote_summaries')
      .select(`
        id, chamber, date, title, question, result, required,
        yea_total, nay_total, present_total, not_voting_total,
        yea_democrat, nay_democrat, yea_republican, nay_republican,
        yea_independent, nay_independent, source_url,
        bill_vote_positions (
          bioguide_id,
          position,
          legislators ( full_name, party, state, photo_url )
        )
      `)
      .eq('bill_id', id)
      .order('date', { ascending: false }),
    supabase
      .from('bills')
      .select('topics, status')
      .eq('bill_id', id)
      .single(),
  ])

  const detailFetch  = detailRes.status   === 'fulfilled' ? detailRes.value   : null
  const actionsFetch = actionsRes.status  === 'fulfilled' ? actionsRes.value  : null
  const summaryFetch = summariesRes.status === 'fulfilled' ? summariesRes.value : null
  const dbVotes: BillVoteSummaryRow[] = dbVotesRes.status  === 'fulfilled' ? (dbVotesRes.value.data ?? []) as unknown as BillVoteSummaryRow[] : []
  const dbBill       = dbBillRes.status   === 'fulfilled' ? dbBillRes.value.data : null
  const dbTopics     = dbBill?.topics ?? []
  const dbStatus     = (dbBill?.status as BillStatus | null) ?? null

  if (!detailFetch?.ok) {
    if (detailFetch?.status === 404) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    return NextResponse.json({ error: 'Congress.gov API error' }, { status: detailFetch?.status ?? 502 })
  }

  const detailData    = await detailFetch.json() as CongressBillResponse
  const bill          = detailData.bill
  const actionsData   = actionsFetch?.ok ? await actionsFetch.json() : {}
  const actions: CongressBillAction[] = actionsData.actions ?? []
  const summariesData = summaryFetch?.ok ? await summaryFetch.json() : {}
  const summaries: CongressBillSummary[] = summariesData.summaries ?? []
  const rawSummary = summaries.at(-1)?.text?.replace(/<[^>]+>/g, '') ?? ''
  const latestSummary = rawSummary
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_: string, n: string) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, ' ')
    .trim()

  const sponsor    = bill.sponsors?.[0]
  const cosponsors: CongressBillCosponsor[] = Array.isArray(bill.cosponsors)
    ? bill.cosponsors
    : (bill.cosponsors?.cosponsor ?? [])

  // Prefer DB vote data (has party breakdown + member positions), fall back to raw actions
  const votes = dbVotes.length > 0
    ? dbVotes.map((v: BillVoteSummaryRow) => ({
        id:       v.id,
        date:     v.date,
        chamber:  v.chamber,
        question: v.title ?? v.question,
        result:   v.result,
        required: v.required ?? null,
        yeas:     v.yea_total,
        nays:     v.nay_total,
        present:  v.present_total,
        notVoting: v.not_voting_total,
        partyBreakdown: {
          democrat:    { yea: v.yea_democrat    ?? 0, nay: v.nay_democrat    ?? 0 },
          republican:  { yea: v.yea_republican  ?? 0, nay: v.nay_republican  ?? 0 },
          independent: { yea: v.yea_independent ?? 0, nay: v.nay_independent ?? 0 },
        },
        memberPositions: (v.bill_vote_positions ?? []).map((pos: BillVotePositionRow) => ({
          bioguideId: pos.bioguide_id,
          name:       pos.legislators?.full_name ?? '',
          party:      pos.legislators?.party ?? '',
          state:      pos.legislators?.state ?? '',
          photoUrl:   pos.legislators?.photo_url ?? null,
          position:   pos.position,
        })),
        sourceUrl: v.source_url ?? null,
      }))
    : actions
        .filter((a: CongressBillAction) => (a.recordedVotes?.length ?? 0) > 0)
        .map((a: CongressBillAction) => ({
          id:             null,
          date:           a.actionDate,
          chamber:        a.actionCode?.startsWith('H') ? 'House' : 'Senate',
          question:       a.text ?? '',
          result:         null,
          required:       null,
          yeas:           a.recordedVotes?.[0]?.yeas ?? null,
          nays:           a.recordedVotes?.[0]?.nays ?? null,
          present:        null,
          notVoting:      null,
          partyBreakdown: null,
          memberPositions: [],
          sourceUrl:      a.recordedVotes?.[0]?.url ?? null,
        }))

  return NextResponse.json({
    bill: {
      id,
      number: formatBillNumber(type, number),
      title:  bill.title,
      congress,
      introducedDate: bill.introducedDate,
      status: dbStatus ?? 'Active',
      summary: latestSummary,
      sponsor: sponsor ? {
        name: sponsor.fullName, bioguideId: sponsor.bioguideId,
        party: sponsor.party, state: sponsor.state, district: sponsor.district ?? null,
      } : null,
      cosponsors: cosponsors.slice(0, 10).map((c: CongressBillCosponsor) => ({
        name: c.fullName, bioguideId: c.bioguideId, party: c.party, state: c.state,
      })),
      policyArea: bill.policyArea?.name ?? null,
      topics: dbTopics,
      subjects: (bill.subjects?.legislativeSubjects ?? []).slice(0, 8).map((s: CongressBillSubject) => s.name),
      congressGovUrl: `https://www.congress.gov/bill/${congress}th-congress/${CONGRESS_GOV_TYPE[type] ?? type}/${number}`,
      actions: actions
        .reduce((acc: CongressBillAction[], a: CongressBillAction) => {
          const key = `${a.actionDate}|${a.text}`
          if (!acc.some((x: CongressBillAction) => `${x.actionDate}|${x.text}` === key)) acc.push(a)
          return acc
        }, [])
        .slice(0, 10)
        .map((a: CongressBillAction) => ({
          date: a.actionDate, text: a.text, type: a.type,
        })),
      votes,
      _hasDetailedVotes: dbVotes.length > 0,
    },
  })
  } catch (err) {
    console.error('[api/bills/[id]]', err)
    return NextResponse.json({ error: 'Failed to load bill' }, { status: 500 })
  }
}
