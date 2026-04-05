import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 300

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const slug   = searchParams.get('slug') ?? ''
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
  const status = searchParams.get('status') ?? null

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('get_bills_by_topic', {
    topic_slug:    slug,
    match_count:   limit,
    status_filter: status,
  })

  if (error) {
    console.error('[api/bills/by-topic]', error)
    return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 })
  }

  const bills = (data ?? []).map((b: any) => ({
    id:      b.bill_id,
    number:  b.bill_number ?? b.bill_id,
    title:   b.title,
    status:  b.status ?? 'Active',
    topics:  b.topics ?? [],
    summary: b.summary,
  }))

  return NextResponse.json({ slug, bills, count: bills.length })
}
