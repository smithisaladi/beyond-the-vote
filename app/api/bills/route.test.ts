import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockHybridBillSearch = vi.fn()
const mockSupabaseFrom = vi.fn()
const mockCreateClient = vi.fn()

vi.mock('@/lib/queries/hybrid-bill-search', () => ({ hybridBillSearch: mockHybridBillSearch }))
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

const { GET } = await import('./route')

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/bills')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

// Helper to build a chainable Supabase query mock
function buildQueryMock(data: unknown[] = [], count = 0, error: unknown = null) {
  const mock: Record<string, unknown> = {}
  const chain = () => mock
  mock.select = vi.fn().mockReturnValue(mock)
  mock.eq = vi.fn().mockReturnValue(mock)
  mock.in = vi.fn().mockReturnValue(mock)
  mock.gte = vi.fn().mockReturnValue(mock)
  mock.order = vi.fn().mockReturnValue(mock)
  mock.range = vi.fn().mockResolvedValue({ data, error, count })
  mock.from = vi.fn().mockReturnValue(mock)
  mock.ilike = vi.fn().mockReturnValue(mock)
  mock.overlaps = vi.fn().mockReturnValue(mock)
  return mock
}

describe('GET /api/bills', () => {
  beforeEach(() => {
    mockHybridBillSearch.mockReset()
  })

  describe('text search mode (q param)', () => {
    beforeEach(() => {
      const supabaseMock = buildQueryMock([])
      mockCreateClient.mockResolvedValue(supabaseMock)
    })

    it('uses hybridBillSearch when q is set', async () => {
      mockHybridBillSearch.mockResolvedValue([
        {
          bill_id: '119-hr-1',
          title: 'Test',
          bill_number: 'H.R. 1',
          sponsor_name: 'Doe',
          sponsor_party: 'D',
          sponsor_bioguide_id: null,
          last_action_text: 'Introduced.',
          last_action_date: '2025-06-01',
          introduced_date: '2025-06-01',
          policy_area: 'Health',
          summary: 'A bill.',
        },
      ])
      const res = await GET(makeReq({ q: 'healthcare' }))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.bills).toHaveLength(1)
      expect(mockHybridBillSearch).toHaveBeenCalled()
    })

    it('passes status filter and topic to hybrid search', async () => {
      mockHybridBillSearch.mockResolvedValue([])
      await GET(makeReq({ q: 'test', status: 'Active', topics: 'healthcare' }))
      expect(mockHybridBillSearch).toHaveBeenCalledWith(
        expect.objectContaining({
          statusFilter: 'Active',
          topicFilters: ['healthcare'],
        }),
      )
    })

    it('caps limit at 250', async () => {
      mockHybridBillSearch.mockResolvedValue([])
      await GET(makeReq({ q: 'test', limit: '999' }))
      expect(mockHybridBillSearch).toHaveBeenCalledWith(
        expect.objectContaining({ resultLimit: 250 }),
      )
    })
  })

  describe('browse mode (no q param)', () => {
    it('queries supabase directly', async () => {
      const supabaseMock = buildQueryMock([
        {
          bill_id: '119-hr-2',
          title: 'Browse Bill',
          bill_number: 'H.R. 2',
          sponsor_name: 'Smith',
          sponsor_party: 'R',
          sponsor_bioguide_id: null,
          last_action_text: 'Committee.',
          last_action_date: '2025-05-01',
          introduced_date: '2025-01-01',
          policy_area: null,
          summary: null,
        },
      ], 1)
      mockCreateClient.mockResolvedValue(supabaseMock)

      const res = await GET(makeReq({}))
      expect(res.status).toBe(200)
      const json = await res.json()
      expect(json.bills).toHaveLength(1)
      expect(json.pagination.total).toBe(1)
      expect(mockHybridBillSearch).not.toHaveBeenCalled()
    })

    it('applies topic filter via overlaps', async () => {
      const supabaseMock = buildQueryMock([], 0)
      mockCreateClient.mockResolvedValue(supabaseMock)

      const res = await GET(makeReq({ topics: 'healthcare,gun-policy' }))
      expect(res.status).toBe(200)
      expect(supabaseMock.overlaps).toHaveBeenCalledWith('topics', ['healthcare', 'gun-policy'])
    })
  })

  describe('error handling', () => {
    it('returns 500 on hybridBillSearch failure', async () => {
      const supabaseMock = buildQueryMock()
      mockCreateClient.mockResolvedValue(supabaseMock)
      mockHybridBillSearch.mockRejectedValue(new Error('DB down'))
      const res = await GET(makeReq({ q: 'test' }))
      expect(res.status).toBe(500)
    })

    it('returns 500 on supabase query error', async () => {
      const supabaseMock = buildQueryMock([], 0, { message: 'query failed' })
      mockCreateClient.mockResolvedValue(supabaseMock)
      const res = await GET(makeReq({}))
      expect(res.status).toBe(500)
    })
  })
})
