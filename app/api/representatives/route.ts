import { NextRequest, NextResponse } from 'next/server'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'

type Party = 'Democrat' | 'Republican' | 'Independent'

interface CivicOfficial {
  name: string
  party?: string
  photoUrl?: string
  urls?: string[]
  phones?: string[]
}

interface CivicOffice {
  name: string
  divisionId: string
  levels?: string[]
  roles?: string[]
  officialIndices: number[]
}

interface CongressMember {
  bioguideId: string
  name: string
  depiction?: { imageUrl: string }
  terms?: { item: { startYear: number }[] }
  url?: string
}

function normalizeParty(party?: string): Party {
  const p = (party ?? '').toLowerCase()
  if (p.includes('democrat')) return 'Democrat'
  if (p.includes('republican')) return 'Republican'
  return 'Independent'
}

async function findCongressMember(
  lastName: string,
  stateCode: string,
  chamber: 'senate' | 'house'
): Promise<Partial<CongressMember>> {
  if (!CONGRESS_API_KEY) return {}

  const url = `${CONGRESS_BASE}/member?state=${stateCode}&chamber=${chamber}&currentMember=true&limit=100&api_key=${CONGRESS_API_KEY}&format=json`
  const res = await fetch(url, { next: { revalidate: 3600 } })
  if (!res.ok) return {}

  const data = await res.json()
  const members: CongressMember[] = data.members ?? []

  const match = members.find((m) =>
    m.name.toLowerCase().includes(lastName.toLowerCase())
  )

  return match ?? {}
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address')

  if (!address) {
    return NextResponse.json({ error: 'address is required' }, { status: 400 })
  }

  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'GOOGLE_API_KEY is not configured' }, { status: 500 })
  }

  try {
    const civicUrl = `https://civicinfo.googleapis.com/civicinfo/v2/representatives?address=${encodeURIComponent(address)}&key=${GOOGLE_API_KEY}`
    const civicRes = await fetch(civicUrl, { next: { revalidate: 3600 } })

    if (!civicRes.ok) {
      const err = await civicRes.json().catch(() => ({}))
      return NextResponse.json(
        { error: err.error?.message ?? 'Google Civic API error' },
        { status: civicRes.status }
      )
    }

    const civicData = await civicRes.json()

    const federalOffices: CivicOffice[] = (civicData.offices ?? []).filter(
      (o: CivicOffice) => o.levels?.includes('country')
    )

    const officials: Array<{
      name: string
      title: string
      party: Party
      photo: string | null
      urls: string[]
      phones: string[]
      state: string
      district?: string
      chamber: 'senate' | 'house'
      stateCode: string
      districtNumber?: number
    }> = []

    for (const office of federalOffices) {
      const isSenate = office.roles?.includes('legislatorUpperBody')
      const isHouse = office.roles?.includes('legislatorLowerBody')
      if (!isSenate && !isHouse) continue

      const stateMatch = office.divisionId.match(/state:([a-z]+)/)
      const districtMatch = office.divisionId.match(/cd:(\d+)/)
      const stateCode = stateMatch ? stateMatch[1].toUpperCase() : ''
      const districtNumber = districtMatch ? parseInt(districtMatch[1]) : undefined

      for (const idx of office.officialIndices) {
        const official: CivicOfficial = civicData.officials?.[idx]
        if (!official) continue

        officials.push({
          name: official.name,
          title: office.name,
          party: normalizeParty(official.party),
          photo: official.photoUrl ?? null,
          urls: official.urls ?? [],
          phones: official.phones ?? [],
          state: stateCode,
          stateCode,
          district: districtNumber ? `${districtNumber}th District` : undefined,
          chamber: isSenate ? 'senate' : 'house',
          districtNumber,
        })
      }
    }

    const representatives = await Promise.all(
      officials.map(async (official) => {
        const lastName = official.name.trim().split(' ').pop() ?? official.name
        const member = await findCongressMember(lastName, official.stateCode, official.chamber)

        return {
          id: member.bioguideId ?? official.name.replace(/\s+/g, '-').toLowerCase(),
          bioguideId: member.bioguideId ?? null,
          name: official.name,
          title: official.title,
          party: official.party,
          state: official.state,
          district: official.district,
          photo: member.depiction?.imageUrl ?? official.photo,
          since: member.terms?.item?.[0]?.startYear?.toString() ?? null,
          website: member.url ?? official.urls[0] ?? null,
          phone: official.phones[0] ?? null,
        }
      })
    )

    return NextResponse.json({ representatives })
  } catch (err) {
    console.error('[/api/representatives]', err)
    return NextResponse.json({ error: 'Failed to fetch representatives' }, { status: 500 })
  }
}
