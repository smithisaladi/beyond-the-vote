import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { Party } from '@/lib/types'

function normalizeParty(party?: string): Party {
  const p = (party ?? '').toUpperCase()
  if (p.includes('DEMOCRAT') || p === 'D') return 'Democrat'
  if (p.includes('REPUBLICAN') || p === 'R') return 'Republican'
  return 'Independent'
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q')?.trim()

  if (!q || q.length < 3) {
    return NextResponse.json({ politicians: [] })
  }

  const supabase = await createClient()
  const lastWord = q.split(/\s+/).at(-1) ?? q
  const select = 'bioguide_id, full_name, party, chamber, state, district, photo_url, member_scores(nominate_dim1, congress)'

  // Two queries: full_name for exact matches, last_name to handle middle initials
  // (PostgREST .or() breaks on ilike values with spaces, hence separate queries)
  const [byFullName, byLastName] = await Promise.all([
    supabase.from('legislators').select(select).ilike('full_name', `%${q}%`).limit(10),
    supabase.from('legislators').select(select).ilike('last_name', `%${lastWord}%`).limit(10),
  ])

  if (byFullName.error && byLastName.error) {
    return NextResponse.json({ error: 'search_failed' }, { status: 500 })
  }

  const seen = new Set<string>()
  const data: NonNullable<typeof byFullName.data> = []
  for (const row of (byFullName.data ?? []).concat(byLastName.data ?? [])) {
    if (!seen.has(row.bioguide_id)) {
      seen.add(row.bioguide_id)
      data.push(row)
      if (data.length === 10) break
    }
  }

  const politicians = (data ?? []).map(row => ({
    id: row.bioguide_id,
    bioguideId: row.bioguide_id,
    name: row.full_name ?? '',
    title: (row.chamber ?? '').toLowerCase() === 'senate' ? 'U.S. Senator' : 'U.S. Representative',
    party: normalizeParty(row.party),
    state: row.state ?? '',
    district: row.district ? `${row.district}th District` : undefined,
    photo: row.photo_url ?? null,
    since: null,
    website: null,
    phone: null,
    ideologyScore: (() => {
      const scores = (row.member_scores as Array<{ nominate_dim1: number | null; congress: number }>) ?? []
      return scores.sort((a, b) => b.congress - a.congress)[0]?.nominate_dim1 ?? null
    })(),
  }))

  return NextResponse.json({ politicians })
}
