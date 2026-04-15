import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockCreateClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildChain() {
  const mock: Record<string, any> = {}
  mock.from = vi.fn().mockReturnValue(mock)
  mock.select = vi.fn().mockReturnValue(mock)
  mock.eq = vi.fn().mockReturnValue(mock)
  mock.in = vi.fn().mockReturnValue(mock)
  mock.order = vi.fn().mockReturnValue(mock)
  mock.limit = vi.fn().mockResolvedValue({ data: [], error: null })
  mock.auth = { getUser: vi.fn() }
  return mock
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/dashboard/followed', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
  })

  async function callGET() {
    const { GET } = await import('./route')
    return GET()
  }

  it('returns 401 when user is not authenticated', async () => {
    const supabase = buildChain()
    supabase.auth.getUser.mockResolvedValue({ data: { user: null } })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await callGET()
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.error).toMatch(/Unauthorized/i)
  })

  it('returns empty politicians array when user has no follows', async () => {
    const supabase = buildChain()
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    // followed_politicians query: .from().select().eq() returns empty
    supabase.eq.mockResolvedValueOnce({ data: [] })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await callGET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.politicians).toEqual([])
  })

  it('returns 200 with politicians on happy path', async () => {
    const supabase = buildChain()
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const follows = [{ politician_id: 'D000001' }]
    const legislators = [
      {
        bioguide_id: 'D000001',
        full_name: 'Jane Doe',
        title: 'U.S. Senator',
        party: 'Democrat',
        state_full: 'California',
        state: 'CA',
        district: null,
        photo_url: 'https://example.com/photo.jpg',
      },
    ]

    // .eq() on followed_politicians returns follows
    supabase.eq.mockResolvedValueOnce({ data: follows })
    // .in() on legislators returns legislators
    let inCallCount = 0
    supabase.in.mockImplementation(() => {
      inCallCount++
      if (inCallCount === 1) return Promise.resolve({ data: legislators })
      return supabase
    })
    // .limit() on bill_vote_positions returns empty
    supabase.limit.mockResolvedValue({ data: [] })

    mockCreateClient.mockResolvedValue(supabase)

    const res = await callGET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.politicians).toHaveLength(1)
    expect(json.politicians[0].id).toBe('D000001')
    expect(json.politicians[0].name).toBe('Jane Doe')
  })

  it('returns 500 on unexpected error', async () => {
    mockCreateClient.mockRejectedValue(new Error('DB connection lost'))

    const res = await callGET()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })
})
