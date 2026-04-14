import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

const { GET } = await import('./route')

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/politicians/search')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function buildQueryResult(data: unknown[] | null, error: unknown = null) {
  return { data, error }
}

function buildSupabase(byFullName: ReturnType<typeof buildQueryResult>, byLastName: ReturnType<typeof buildQueryResult>) {
  let callIndex = 0
  const results = [byFullName, byLastName]
  const mockChain: Record<string, unknown> = {}
  mockChain.select = vi.fn().mockReturnValue(mockChain)
  mockChain.ilike = vi.fn().mockReturnValue(mockChain)
  mockChain.limit = vi.fn().mockImplementation(() => results[callIndex++])
  mockChain.from = vi.fn().mockReturnValue(mockChain)
  return mockChain
}

const sampleLeg = {
  bioguide_id: 'S000001',
  full_name: 'Jane Smith',
  party: 'Democrat',
  chamber: 'senate',
  state: 'CA',
  district: null,
  photo_url: null,
  member_scores: [{ nominate_dim1: -0.4, congress: 119 }],
}

describe('GET /api/politicians/search', () => {
  beforeEach(() => {
    mockCreateClient.mockReset()
  })

  it('returns empty list for short query', async () => {
    const res = await GET(makeReq({ q: 'ab' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.politicians).toEqual([])
  })

  it('returns empty list for missing query', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.politicians).toEqual([])
  })

  it('returns deduplicated results from both queries', async () => {
    const sb = buildSupabase(
      buildQueryResult([sampleLeg]),
      buildQueryResult([sampleLeg, { ...sampleLeg, bioguide_id: 'J000002', full_name: 'John Jones', party: 'Republican', chamber: 'house', district: '5' }]),
    )
    mockCreateClient.mockResolvedValue(sb)

    const res = await GET(makeReq({ q: 'Smith' }))
    const json = await res.json()
    expect(json.politicians).toHaveLength(2)
    expect(json.politicians[0].id).toBe('S000001')
    expect(json.politicians[1].id).toBe('J000002')
  })

  it('normalizes party correctly', async () => {
    const sb = buildSupabase(
      buildQueryResult([{ ...sampleLeg, party: 'D' }]),
      buildQueryResult([]),
    )
    mockCreateClient.mockResolvedValue(sb)

    const res = await GET(makeReq({ q: 'Smith' }))
    const json = await res.json()
    expect(json.politicians[0].party).toBe('Democrat')
  })

  it('sets title to U.S. Senator for senate chamber', async () => {
    const sb = buildSupabase(
      buildQueryResult([sampleLeg]),
      buildQueryResult([]),
    )
    mockCreateClient.mockResolvedValue(sb)

    const res = await GET(makeReq({ q: 'Smith' }))
    const json = await res.json()
    expect(json.politicians[0].title).toBe('U.S. Senator')
  })

  it('extracts most recent ideology score', async () => {
    const leg = {
      ...sampleLeg,
      member_scores: [
        { nominate_dim1: -0.3, congress: 118 },
        { nominate_dim1: -0.5, congress: 119 },
      ],
    }
    const sb = buildSupabase(buildQueryResult([leg]), buildQueryResult([]))
    mockCreateClient.mockResolvedValue(sb)

    const res = await GET(makeReq({ q: 'Smith' }))
    const json = await res.json()
    expect(json.politicians[0].ideologyScore).toBe(-0.5) // congress 119 > 118
  })

  it('returns 500 when both queries fail', async () => {
    const sb = buildSupabase(
      buildQueryResult(null, { message: 'err' }),
      buildQueryResult(null, { message: 'err' }),
    )
    mockCreateClient.mockResolvedValue(sb)

    const res = await GET(makeReq({ q: 'Smith' }))
    expect(res.status).toBe(500)
  })
})
