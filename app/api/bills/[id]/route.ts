import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'

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
  const types: Record<string, string> = {
    hr: 'H.R.', s: 'S.', hjres: 'H.J.Res.', sjres: 'S.J.Res.',
    hconres: 'H.Con.Res.', sconres: 'S.Con.Res.', hres: 'H.Res.', sres: 'S.Res.',
  }
  return `${types[type.toLowerCase()] ?? type.toUpperCase()} ${number}`
}

import { mapStatus as mapBillStatus } from '@/lib/bills'

function mapStatus(actions: any[], introducedDate?: string) {
  const latestText = actions?.[0]?.text ?? ''
  return mapBillStatus(latestText, introducedDate)
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!CONGRESS_API_KEY) {
    return NextResponse.json({ error: 'CONGRESS_API_KEY is not configured' }, { status: 500 })
  }

  const { id } = await params
  const parsed = parseId(id)
  if (!parsed) {
    return NextResponse.json({ error: 'Invalid bill id format. Expected: {congress}-{type}-{number}' }, { status: 400 })
  }

  const { congress, type, number } = parsed
  const supabase = await createClient()

  // Fetch Congress.gov data + local vote data in parallel
  const [detailRes, actionsRes, summariesRes, dbVotesRes] = await Promise.allSettled([
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
  ])

  const detailFetch  = detailRes.status   === 'fulfilled' ? detailRes.value   : null
  const actionsFetch = actionsRes.status  === 'fulfilled' ? actionsRes.value  : null
  const summaryFetch = summariesRes.status === 'fulfilled' ? summariesRes.value : null
  const dbVotes      = dbVotesRes.status  === 'fulfilled' ? dbVotesRes.value.data ?? [] : []

  if (!detailFetch?.ok) {
    if (detailFetch?.status === 404) return NextResponse.json({ error: 'Bill not found' }, { status: 404 })
    return NextResponse.json({ error: 'Congress.gov API error' }, { status: detailFetch?.status ?? 502 })
  }

  const detailData    = await detailFetch.json()
  const bill          = detailData.bill
  const actionsData   = actionsFetch?.ok ? await actionsFetch.json() : {}
  const actions: any[] = actionsData.actions ?? []
  const summariesData = summaryFetch?.ok ? await summaryFetch.json() : {}
  const summaries: any[] = summariesData.summaries ?? []
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
  const cosponsors: any[] = Array.isArray(bill.cosponsors)
    ? bill.cosponsors
    : (bill.cosponsors?.cosponsor ?? [])

  // Prefer DB vote data (has party breakdown + member positions), fall back to raw actions
  const votes = dbVotes.length > 0
    ? dbVotes.map((v: any) => ({
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
        memberPositions: (v.bill_vote_positions ?? []).map((pos: any) => ({
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
        .filter((a: any) => a.recordedVotes?.length > 0)
        .map((a: any) => ({
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
      status: mapStatus(actions, bill.introducedDate),
      summary: latestSummary,
      sponsor: sponsor ? {
        name: sponsor.fullName, bioguideId: sponsor.bioguideId,
        party: sponsor.party, state: sponsor.state, district: sponsor.district ?? null,
      } : null,
      cosponsors: cosponsors.slice(0, 10).map((c: any) => ({
        name: c.fullName, bioguideId: c.bioguideId, party: c.party, state: c.state,
      })),
      policyArea: bill.policyArea?.name ?? null,
      subjects: (bill.subjects?.legislativeSubjects ?? []).slice(0, 8).map((s: any) => s.name),
      congressGovUrl: `https://www.congress.gov/bill/${congress}th-congress/${type === 'hr' ? 'house-bill' : type === 's' ? 'senate-bill' : type}/${number}`,
      actions: actions.slice(0, 10).map((a: any) => ({
        date: a.actionDate, text: a.text, type: a.type,
      })),
      votes,
      _hasDetailedVotes: dbVotes.length > 0,
    },
  })
}
