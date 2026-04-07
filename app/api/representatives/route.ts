import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const GEOCODIO_API_KEY = process.env.GEOCODIO_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'
const GEOCODIO_BASE = 'https://api.geocod.io/v1.7'

type Party = 'Democrat' | 'Republican' | 'Independent'

function normalizeParty(party?: string): Party {
  const p = (party ?? '').toUpperCase()
  if (p === 'D' || p.includes('DEMOCRAT')) return 'Democrat'
  if (p === 'R' || p.includes('REPUBLICAN')) return 'Republican'
  return 'Independent'
}

function ordinal(n: number): string {
  if (n === 0) return 'At-Large'
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0]) + ' District'
}

async function enrichFromCongress(
  bioguideId: string
): Promise<{ photo: string | null; since: string | null; website: string | null }> {
  if (!CONGRESS_API_KEY || !bioguideId) return { photo: null, since: null, website: null }

  const res = await fetch(
    `${CONGRESS_BASE}/member/${bioguideId}?format=json&api_key=${CONGRESS_API_KEY}`,
    { next: { revalidate: 3600 } }
  )
  if (!res.ok) return { photo: null, since: null, website: null }

  const data = await res.json()
  const member = data.member
  const firstTerm = member.terms?.item?.[0]

  return {
    photo: member.depiction?.imageUrl ?? null,
    since: firstTerm?.startYear?.toString() ?? null,
    website: member.officialWebsiteUrl ?? null,
  }
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }

  if (!GEOCODIO_API_KEY) {
    return NextResponse.json({ error: 'geocode_failed' }, { status: 500 })
  }

  try {
    const geocodioRes = await fetch(
      `${GEOCODIO_BASE}/geocode?q=${encodeURIComponent(address)}&fields=cd&api_key=${GEOCODIO_API_KEY}`,
      { next: { revalidate: 3600 } }
    )

    if (!geocodioRes.ok) {
      return NextResponse.json({ error: 'address_not_found' }, { status: 404 })
    }

    const geocodioData = await geocodioRes.json()
    const result = geocodioData.results?.[0]

    if (!result) {
      return NextResponse.json({ error: 'address_not_found' }, { status: 404 })
    }

    const stateCode: string = result.address_components?.state ?? ''
    const districts: any[] = result.fields?.congressional_districts ?? []

    // Collect all legislators across returned districts (senators appear in each district entry)
    const seen = new Set<string>()
    const legislators: Array<{ leg: any; districtNumber: number }> = []

    for (const district of districts) {
      for (const leg of district.current_legislators ?? []) {
        const key = leg.references?.bioguide_id ?? `${leg.bio?.last_name}-${leg.type}`
        if (seen.has(key)) continue
        seen.add(key)
        legislators.push({ leg, districtNumber: district.district_number ?? 0 })
      }
    }

    if (legislators.length === 0) {
      return NextResponse.json({ error: 'no_legislators' }, { status: 200 })
    }

    const representatives = await Promise.all(
      legislators.map(async ({ leg, districtNumber }) => {
        const bioguideId: string = leg.references?.bioguide_id ?? ''
        const enrich = await enrichFromCongress(bioguideId)

        const firstName: string = leg.bio?.first_name ?? ''
        const lastName: string = leg.bio?.last_name ?? ''
        const name = `${firstName} ${lastName}`.trim()
        const isSenator = leg.type === 'senator'

        return {
          id: bioguideId || name.replace(/\s+/g, '-').toLowerCase(),
          bioguideId: bioguideId || null,
          name,
          title: isSenator ? 'U.S. Senator' : 'U.S. Representative',
          party: normalizeParty(leg.bio?.party),
          state: stateCode,
          district: !isSenator ? ordinal(districtNumber) : undefined,
          photo: enrich.photo,
          since: enrich.since,
          website: enrich.website ?? leg.contact?.url ?? null,
          phone: leg.contact?.phone ?? null,
        }
      })
    )

    // Enrich with ideology scores from the local database
    const bioguideIds = representatives.map(r => r.bioguideId).filter(Boolean) as string[]
    let ideologyMap: Record<string, number | null> = {}
    if (bioguideIds.length > 0) {
      const supabase = await createClient()
      const { data: rows } = await supabase
        .from('legislators')
        .select('bioguide_id, ideology_score')
        .in('bioguide_id', bioguideIds)
      if (rows) {
        for (const row of rows) {
          ideologyMap[row.bioguide_id] = row.ideology_score ?? null
        }
      }
    }

    const enriched = representatives.map(r => ({
      ...r,
      ideologyScore: r.bioguideId ? (ideologyMap[r.bioguideId] ?? null) : null,
    }))

    return NextResponse.json({ representatives: enriched })
  } catch (err) {
    console.error('[/api/representatives]', err)
    return NextResponse.json({ error: 'geocode_failed' }, { status: 500 })
  }
}
