import { NextRequest, NextResponse } from 'next/server'
import { getBillsByTopic } from '@/lib/queries/get-bills-by-topic'

export const revalidate = 300

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const slug   = searchParams.get('slug') ?? ''
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)
  const status = searchParams.get('status') ?? null

  if (!slug) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 })
  }

  try {
    const rows = await getBillsByTopic(slug, limit, status)

    const bills = rows.map(b => ({
      id:      b.bill_id,
      number:  b.bill_number ?? b.bill_id,
      title:   b.title,
      status:  b.status ?? 'Active',
      topics:  b.topics ?? [],
      summary: b.summary,
    }))

    return NextResponse.json({ slug, bills, count: bills.length })
  } catch (err) {
    console.error('[api/bills/by-topic]', err)
    return NextResponse.json({ error: 'Failed to fetch bills' }, { status: 500 })
  }
}
