import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockCreateClient = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

const { GET } = await import('./route')

function makeReq(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/donors')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

function buildSupabaseMock(data: unknown[] = [], count = 0, error: unknown = null) {
  // The Supabase PostgREST chain: .from().select().order().range() → thenable
  // BUT .ilike() is called after .range() (the route mutates `query` conditionally).
  // We need range() to return a chainable + thenable object.
  const finalResult = { data, error, count }

  // The terminal query object (returned by range) that can also chain ilike
  const terminal: Record<string, unknown> = {}
  terminal.ilike = vi.fn().mockReturnValue(terminal)
  terminal.then = (resolve: (v: unknown) => void) => Promise.resolve(finalResult).then(resolve)

  // The chainable mock (not thenable — so `await createClient()` returns this, not result)
  const mock: Record<string, unknown> = {}
  mock.select = vi.fn().mockReturnValue(mock)
  mock.order = vi.fn().mockReturnValue(mock)
  mock.range = vi.fn().mockReturnValue(terminal)
  mock.from = vi.fn().mockReturnValue(mock)
  // Expose terminal for assertions
  mock._terminal = terminal

  return mock
}

const sampleRow = {
  cmte_id: 'C00401224',
  cmte_name: 'TEST PAC',
  direct_total: '100000',
  ie_for_total: '50000',
  ie_against_total: '25000',
  total_contributions: '175000',
  recipient_count: '5',
  top_recipients: [
    { bioguide_id: 'D000001', name: 'Doe', party: 'Democrat', state: 'CA', chamber: 'house', amount: 10000 },
  ],
}

describe('GET /api/donors', () => {
  beforeEach(() => {
    mockCreateClient.mockReset()
  })

  it('returns donors list', async () => {
    mockCreateClient.mockResolvedValue(buildSupabaseMock([sampleRow], 1))
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.contributors).toHaveLength(1)
    expect(json.contributors[0].cmteId).toBe('C00401224')
    expect(json.contributors[0].totalContributions).toBe(175000)
    expect(json.pagination.total).toBe(1)
  })

  it('applies search filter when q is provided', async () => {
    const mock = buildSupabaseMock([], 0)
    mockCreateClient.mockResolvedValue(mock)
    await GET(makeReq({ q: 'AIPAC' }))
    const terminal = mock._terminal as Record<string, ReturnType<typeof vi.fn>>
    expect(terminal.ilike).toHaveBeenCalledWith('cmte_name', '%AIPAC%')
  })

  it('caps limit at 100', async () => {
    const mock = buildSupabaseMock([], 0)
    mockCreateClient.mockResolvedValue(mock)
    await GET(makeReq({ limit: '999' }))
    expect(mock.range).toHaveBeenCalledWith(0, 99)
  })

  it('returns 500 on error', async () => {
    mockCreateClient.mockResolvedValue(buildSupabaseMock([], 0, { message: 'fail' }))
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
  })
})
