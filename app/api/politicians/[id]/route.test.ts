import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockCreateClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

vi.mock('@/lib/ideology', () => ({
  getIdeologyLabel: (dim1: number | null) => {
    if (dim1 === null) return null
    if (dim1 < 0) return 'Liberal'
    return 'Conservative'
  },
}))

vi.mock('@/lib/bills', () => ({
  mapStatus: () => 'Active',
}))

vi.mock('@/lib/format', () => ({
  formatBillType: (t: string) => {
    const m: Record<string, string> = { hr: 'H.R.', s: 'S.' }
    return m[t] ?? t.toUpperCase()
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Build a Supabase mock that routes based on the table being queried.
 * The politician route uses Promise.allSettled with multiple from() calls,
 * so we track which table was last accessed to return appropriate data.
 */
function buildSupabaseMock(opts: {
  legislator?: any
  scores?: any
  committees?: any[]
  pipelineRun?: any
  topPacs?: any[]
  fundingSummary?: any[]
  topContributors?: any[]
  votes?: any[]
  billTitles?: any[]
} = {}) {
  const mock: Record<string, any> = {}
  let lastTable = ''

  mock.from = vi.fn().mockImplementation((table: string) => {
    lastTable = table
    return mock
  })
  mock.select = vi.fn().mockReturnValue(mock)
  mock.eq = vi.fn().mockImplementation(() => {
    // committee_memberships.eq(bioguide_id) is the terminal call
    if (lastTable === 'committee_memberships') {
      return Promise.resolve({ data: opts.committees ?? [], error: null })
    }
    return mock
  })
  mock.in = vi.fn().mockImplementation(() => {
    if (lastTable === 'bills') {
      return Promise.resolve({ data: opts.billTitles ?? [], error: null })
    }
    return mock
  })
  mock.or = vi.fn().mockReturnValue(mock)
  mock.order = vi.fn().mockReturnValue(mock)
  mock.limit = vi.fn().mockImplementation(() => {
    if (lastTable === 'bill_vote_positions') {
      return Promise.resolve({ data: opts.votes ?? [], error: null })
    }
    if (lastTable === 'legislator_top_pacs') {
      return Promise.resolve({ data: opts.topPacs ?? [], error: null })
    }
    if (lastTable === 'legislator_funding_summary') {
      return Promise.resolve({ data: opts.fundingSummary ?? [], error: null })
    }
    if (lastTable === 'legislator_top_contributors') {
      return Promise.resolve({ data: opts.topContributors ?? [], error: null })
    }
    return mock
  })

  let maybeSingleCount = 0
  mock.maybeSingle = vi.fn().mockImplementation(() => {
    maybeSingleCount++
    switch (maybeSingleCount) {
      case 1: return Promise.resolve({ data: opts.legislator ?? null, error: null })
      case 2: return Promise.resolve({ data: opts.scores ?? null, error: null })
      case 3: return Promise.resolve({ data: opts.pipelineRun ?? null, error: null })
      default: return Promise.resolve({ data: null, error: null })
    }
  })

  mock.auth = { getUser: vi.fn() }
  return mock
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/politicians/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    vi.stubEnv('CONGRESS_API_KEY', 'test-key')
    // Default fetch mock for sponsored-legislation and senate.gov calls
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }))
  })

  async function callGET(id: string) {
    const { GET } = await import('./route')
    return GET(new NextRequest(`http://localhost/api/politicians/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  it('returns 200 with politician data when legislator exists in DB', async () => {
    const legislator = {
      bioguide_id: 'D000001',
      full_name: 'Jane Doe',
      title: 'U.S. Senator',
      party: 'Democrat',
      state_full: 'California',
      state: 'CA',
      district: null,
      chamber: 'senate',
      photo_url: 'https://example.com/photo.jpg',
      website: 'https://doe.senate.gov',
      address: '123 Hart Senate',
      phone: '202-555-0100',
      twitter: 'janedoe',
      fec_ids: ['H0CA12345'],
      lis_id: 'S100',
      raw_json: { terms: [{ start: '2019-01-03' }] },
      term_start: '2019-01-03',
      term_end: null,
      next_election: 2026,
      last_name: 'Doe',
    }

    const supabase = buildSupabaseMock({
      legislator,
      scores: { nominate_dim1: -0.5, nominate_dim2: 0.1, num_votes: 100 },
      committees: [
        { title: 'Member', committees: { name: 'Finance', url: 'https://example.com', chamber: 'Senate' } },
      ],
    })
    mockCreateClient.mockResolvedValue(supabase)

    // Sponsored legislation fetch
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sponsoredLegislation: [] }),
      })
      // senate.gov vote index XML (for senator) — not found
      .mockResolvedValue({ ok: false, status: 404 })
    )

    const res = await callGET('D000001')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.politician).toBeDefined()
    expect(json.politician.name).toBe('Jane Doe')
    expect(json.politician.party).toBe('Democrat')
    expect(json.politician.stats.ideologyScore).toBe(-0.5)
    expect(json.politician.committees).toHaveLength(1)
    expect(json.politician.committees[0].name).toBe('Finance')
  })

  it('returns 404 when not in DB and Congress.gov returns 404', async () => {
    const supabase = buildSupabaseMock({ legislator: null })
    mockCreateClient.mockResolvedValue(supabase)

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ sponsoredLegislation: [] }) })
      .mockResolvedValueOnce({ ok: false, status: 404, json: () => Promise.resolve({}) })
      // Any further senate.gov etc
      .mockResolvedValue({ ok: false, status: 404 })
    )

    const res = await callGET('Z999999')
    expect(res.status).toBe(404)
  })

  it('returns 404 when not in DB and no CONGRESS_API_KEY', async () => {
    vi.stubEnv('CONGRESS_API_KEY', '')
    const supabase = buildSupabaseMock({ legislator: null })
    mockCreateClient.mockResolvedValue(supabase)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/politicians/Z999999'), {
      params: Promise.resolve({ id: 'Z999999' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 500 on unexpected error', async () => {
    mockCreateClient.mockRejectedValue(new Error('DB down'))

    const res = await callGET('D000001')
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })
})
