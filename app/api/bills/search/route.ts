import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const supabase = await createClient()

    // Bill number / ID shortcut — exact lookup before full search
    if (BILL_ID_RE.test(q) || BILL_NUMBER_RE.test(q)) {
      const { data } = await supabase.rpc('lookup_bill', { query_text: q })
      if (data && data.length > 0) {
        return NextResponse.json({ query: q, results: data, count: data.length })
      }
    }

    const { data, error } = await supabase.rpc('hybrid_bill_search', {
      query_text:      q,
      result_limit:    limit,
      offset_count:    0,
      status_filter:   null,
      topic_filter:    null,
      policy_areas:    null,
      congress_filter: congress,
    })

    if (error) throw new Error(error.message)

    const results = data ?? []
    return NextResponse.json({ query: q, results, count: results.length })
  } catch (err) {
    console.error('[api/bills/search]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
