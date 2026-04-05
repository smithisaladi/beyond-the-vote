import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getEmbedding } from '@/lib/embeddings'

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
    const embedding = await getEmbedding(q)
    const supabase = await createClient()

    const { data, error } = await supabase.rpc('search_bills', {
      query_embedding: JSON.stringify(embedding),
      match_count: congress ? 50 : limit,
      match_threshold: 0.3,
    })

    if (error) throw new Error(error.message)

    let results = data ?? []

    if (congress) {
      results = results
        .filter((r: { congress: number }) => r.congress === congress)
        .slice(0, limit)
    }

    return NextResponse.json({ query: q, results, count: results.length })
  } catch (err) {
    console.error('[api/bills/search]', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Search failed' },
      { status: 500 }
    )
  }
}
