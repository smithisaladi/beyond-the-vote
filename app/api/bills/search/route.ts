import { NextRequest, NextResponse } from 'next/server'
import { lookupBill } from '@/lib/queries/lookup-bill'
import { hybridBillSearch } from '@/lib/queries/hybrid-bill-search'
import { parseSearchParams, BillSearchParams } from '@/lib/api-validation'

// Bill ID format: "119-hr-4521" or bill_number format: "H.R. 4521", "S. 1247"
const BILL_ID_RE     = /^\d{3}-[a-z]+-\d+$/i
const BILL_NUMBER_RE = /^[hs]\.?\s*(?:r(?:es)?|j\.?res|con\.?res)?\.?\s*\d+$/i

export async function GET(req: NextRequest) {
  const parsed = parseSearchParams(BillSearchParams, req.nextUrl.searchParams)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }
  const { q, limit, congress } = parsed.data

  try {
    // Bill number / ID shortcut — exact lookup before full search
    if (BILL_ID_RE.test(q) || BILL_NUMBER_RE.test(q)) {
      const data = await lookupBill(q)
      if (data.length > 0) {
        return NextResponse.json({ query: q, results: data, count: data.length })
      }
    }

    const results = await hybridBillSearch({
      queryText:      q,
      resultLimit:    limit,
      offsetCount:    0,
      congressFilter: congress,
    })

    return NextResponse.json({ query: q, results, count: results.length })
  } catch (err) {
    console.error('[api/bills/search]', err)
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    )
  }
}
