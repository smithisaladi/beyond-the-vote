import { createClient } from '@/lib/supabase/server'
import BillDetailPage from '@/components/bills/BillDetailPage'
import type { BillDetail } from '@/hooks/useFetchBillDetail'

export default async function BillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const billId = decodeURIComponent(id)
  const supabase = await createClient()

  const { data: bill } = await supabase
    .from('bills')
    .select('bill_id, bill_number, congress, title, summary, status, sponsor_name, sponsor_bioguide_id, sponsor_party, introduced_date, policy_area, topics, congress_gov_url, last_action_text, last_action_date')
    .eq('bill_id', billId)
    .single()

  let votes: any[] = []
  if (bill) {
    const { data: voteData } = await supabase
      .from('bill_vote_summaries')
      .select(`
        id, bill_id, congress, chamber, date, title, question, result, required,
        yea_total, nay_total, present_total, not_voting_total,
        yea_democrat, nay_democrat, yea_republican, nay_republican,
        yea_independent, nay_independent, source_url,
        bill_vote_positions(vote_id, bioguide_id, position, legislators(full_name, party, state, photo_url))
      `)
      .eq('bill_id', billId)
      .order('date', { ascending: false })

    votes = voteData ?? []
  }

  const initialBill: BillDetail | null = bill ? {
    id: bill.bill_id,
    number: bill.bill_number ?? bill.bill_id,
    title: bill.title,
    congress: bill.congress,
    introducedDate: bill.introduced_date ?? '',
    status: (bill.status ?? 'Committee') as BillDetail['status'],
    summary: bill.summary ?? '',
    sponsor: bill.sponsor_bioguide_id ? {
      name: bill.sponsor_name ?? '',
      bioguideId: bill.sponsor_bioguide_id,
      party: bill.sponsor_party ?? '',
      state: '',
      district: null,
    } : null,
    cosponsors: [],
    policyArea: bill.policy_area ?? null,
    topics: bill.topics ?? [],
    subjects: [],
    congressGovUrl: bill.congress_gov_url ?? '',
    actions: bill.last_action_text ? [{ date: bill.last_action_date ?? '', text: bill.last_action_text, type: '' }] : [],
    votes: votes.map((v: any) => ({
      id: v.id,
      date: v.date,
      chamber: v.chamber,
      question: v.title ?? v.question,
      result: v.result,
      required: v.required ?? null,
      yeas: v.yea_total,
      nays: v.nay_total,
      present: v.present_total,
      notVoting: v.not_voting_total,
      partyBreakdown: {
        democrat: { yea: v.yea_democrat ?? 0, nay: v.nay_democrat ?? 0 },
        republican: { yea: v.yea_republican ?? 0, nay: v.nay_republican ?? 0 },
        independent: { yea: v.yea_independent ?? 0, nay: v.nay_independent ?? 0 },
      },
      memberPositions: (v.bill_vote_positions ?? []).map((p: any) => ({
        bioguideId: p.bioguide_id,
        name: p.legislators?.full_name ?? '',
        party: p.legislators?.party ?? '',
        state: p.legislators?.state ?? '',
        photoUrl: p.legislators?.photo_url ?? null,
        position: p.position,
      })),
      sourceUrl: v.source_url ?? null,
    })),
  } : null

  return <BillDetailPage id={billId} initialBill={initialBill} />
}
