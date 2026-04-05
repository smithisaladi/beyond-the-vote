import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const revalidate = 300

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

    const { data, error } = await supabase.rpc('search_bills_text', {
      query_text:      q,
      match_count:     limit,
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
