import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockCreateClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

vi.mock('@/lib/api-validation', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api-validation')>()
  return { ...original }
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/representatives')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function buildSupabaseMock(legData: unknown[] = [], scoresData: unknown[] = []) {
  const mock: Record<string, any> = {}
  mock.from = vi.fn().mockReturnValue(mock)
  mock.select = vi.fn().mockReturnValue(mock)
  mock.in = vi.fn().mockReturnValue(mock)
  mock.order = vi.fn().mockResolvedValue({ data: scoresData, error: null })
  // The .in() on legislators returns legData, the .in() on scores chains to .order()
  let inCallCount = 0
  mock.in.mockImplementation(() => {
    inCallCount++
    if (inCallCount === 1) return Promise.resolve({ data: legData, error: null })
    return mock // second .in() chains to .order()
  })
  return mock
}

function makeGeocodioResponse(legislators: any[] = [], stateCode = 'CA', districtNumber = 12) {
  return {
    results: [
      {
        address_components: { state: stateCode },
        fields: {
          congressional_districts: [
            {
              district_number: districtNumber,
              current_legislators: legislators,
            },
          ],
        },
      },
    ],
  }
}

function makeLegislator(overrides: Record<string, any> = {}) {
  return {
    type: 'representative',
    bio: { first_name: 'Jane', last_name: 'Doe', party: 'Democrat' },
    references: { bioguide_id: 'D000001' },
    contact: { url: 'https://doe.house.gov', phone: '202-555-0100' },
    ...overrides,
  }
}

function jsonResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/representatives', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    vi.stubEnv('GEOCODIO_API_KEY', 'geo-key')
    vi.stubEnv('CONGRESS_API_KEY', 'cong-key')
  })

  async function callGET(params: Record<string, string>) {
    const { GET } = await import('./route')
    return GET(makeReq(params))
  }

  it('returns 400 when address is missing', async () => {
    const res = await callGET({})
    expect(res.status).toBe(400)
  })

  it('returns 500 when GEOCODIO_API_KEY is missing', async () => {
    vi.stubEnv('GEOCODIO_API_KEY', '')
    const { GET } = await import('./route')
    const res = await GET(makeReq({ address: '123 Main St' }))
    expect(res.status).toBe(500)
  })

  it('returns 404 when Geocodio returns no results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      jsonResponse({ results: [] }),
    ))

    const res = await callGET({ address: '123 Nowhere St' })
    expect(res.status).toBe(404)
  })

  it('returns 200 with no_legislators when district has no legislators', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(
      jsonResponse(makeGeocodioResponse([])),
    ))

    const res = await callGET({ address: '123 Main St' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.error).toBe('no_legislators')
  })

  it('returns 200 with representatives on happy path', async () => {
    const leg = makeLegislator()
    const supabase = buildSupabaseMock(
      [{ bioguide_id: 'D000001', photo_url: 'https://example.com/photo.jpg' }],
      []
    )
    mockCreateClient.mockResolvedValue(supabase)

    vi.stubGlobal('fetch', vi.fn()
      // Geocodio
      .mockResolvedValueOnce(jsonResponse(makeGeocodioResponse([leg])))
      // Congress.gov enrich call
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          member: {
            depiction: { imageUrl: 'https://congress.gov/photo.jpg' },
            terms: { item: [{ startYear: 2019 }] },
            officialWebsiteUrl: 'https://doe.house.gov',
          },
        }),
      })
    )

    const res = await callGET({ address: '123 Main St, Los Angeles, CA' })
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.representatives).toHaveLength(1)
    expect(json.representatives[0].name).toBe('Jane Doe')
    expect(json.representatives[0].state).toBe('CA')
    expect(json.representatives[0].district).toBe('12th District')
  })
})
