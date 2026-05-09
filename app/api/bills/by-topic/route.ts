import { NextRequest, NextResponse } from 'next/server'
import { getBillsByTopic } from '@/lib/queries/get-bills-by-topic'
import { parseSearchParams, BillsByTopicParams } from '@/lib/api-validation'
import { apiError } from '@/lib/api-errors'

export const revalidate = 300

export async function GET(req: NextRequest) {
  const parsed = parseSearchParams(BillsByTopicParams, req.nextUrl.searchParams)
  if (!parsed.success) {
    return apiError(parsed.error, 400)
  }
  const { slug, limit, status } = parsed.data

  try {
    const rows = await getBillsByTopic(slug, limit, status ?? null)

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
    return apiError('Failed to fetch bills', 500)
  }
}
