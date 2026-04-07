import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type Party = 'Democrat' | 'Republican' | 'Independent'

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
  const { data, error } = await supabase
    .from('legislators')
    .select('bioguide_id, full_name, party, chamber, state, district, photo_url, ideology_score')
    .ilike('full_name', `%${q}%`)
    .limit(10)

  if (error) {
    return NextResponse.json({ error: 'search_failed' }, { status: 500 })
  }

  const politicians = (data ?? []).map(row => ({
    id: row.bioguide_id,
    bioguideId: row.bioguide_id,
    name: row.full_name ?? '',
    title: row.chamber === 'senate' ? 'U.S. Senator' : 'U.S. Representative',
    party: normalizeParty(row.party),
    state: row.state ?? '',
    district: row.district ? `${row.district}th District` : undefined,
    photo: row.photo_url ?? null,
    since: null,
    website: null,
    phone: null,
    ideologyScore: row.ideology_score ?? null,
  }))

  return NextResponse.json({ politicians })
}
