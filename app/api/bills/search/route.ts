import { NextRequest, NextResponse } from 'next/server'
import { lookupBill } from '@/lib/queries/lookup-bill'
import { hybridBillSearch } from '@/lib/queries/hybrid-bill-search'

// Bill ID format: "119-hr-4521" or bill_number format: "H.R. 4521", "S. 1247"
const BILL_ID_RE     = /^\d{3}-[a-z]+-\d+$/i
const BILL_NUMBER_RE = /^[hs]\.?\s*(?:r(?:es)?|j\.?res|con\.?res)?\.?\s*\d+$/i

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim() ?? ''
  const limitParam = parseInt(searchParams.get('limit') ?? '20', 10)
  const congressParam = searchParams.get('congress')

  if (q.length < 3) {
    return NextResponse.json(
      { error: 'Query must be at least 3 characters' },
      { status: 400 }
    )
  }

  const limit = Math.min(Math.max(1, limitParam || 20), 50)
  const congress = congressParam ? parseInt(congressParam, 10) : null

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
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
