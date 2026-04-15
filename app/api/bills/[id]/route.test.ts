import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockCreateClient = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => mockCreateClient(),
}))

vi.mock('@/lib/format', () => ({
  formatBillType: (t: string) => {
    const m: Record<string, string> = { hr: 'H.R.', s: 'S.' }
    return m[t] ?? t.toUpperCase()
  },
}))

vi.mock('@/lib/bills', () => ({
  mapStatus: () => 'Active',
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildSupabaseMock(voteData: unknown[] = [], voteError: unknown = null) {
  const mock: Record<string, unknown> = {}
  mock.from = vi.fn().mockReturnValue(mock)
  mock.select = vi.fn().mockReturnValue(mock)
  mock.eq = vi.fn().mockReturnValue(mock)
  mock.order = vi.fn().mockResolvedValue({ data: voteData, error: voteError })
  return mock
}

function makeBillDetail(overrides: Record<string, unknown> = {}) {
  return {
    bill: {
      title: 'A Test Bill',
      introducedDate: '2025-06-01',
      sponsors: [{ fullName: 'Jane Doe', bioguideId: 'D000001', party: 'D', state: 'CA', district: 12 }],
      cosponsors: [],
      policyArea: { name: 'Health' },
      subjects: { legislativeSubjects: [] },
      ...overrides,
    },
  }
}

function makeActionsResponse(actions: unknown[] = []) {
  return { actions }
}

function makeSummariesResponse(text = 'A summary.') {
  return { summaries: [{ text }] }
}

function jsonResponse(data: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(data) }
}

function errorResponse(status: number) {
  return { ok: false, status }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/bills/[id]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    vi.stubEnv('CONGRESS_API_KEY', 'test-key')
  })

  async function callGET(id: string) {
    const { GET } = await import('./route')
    return GET(new NextRequest(`http://localhost/api/bills/${id}`), {
      params: Promise.resolve({ id }),
    })
  }

  it('returns 400 for invalid bill ID format', async () => {
    const res = await callGET('bad-id')
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/Invalid bill ID/i)
  })

  it('returns 500 when CONGRESS_API_KEY is missing', async () => {
    vi.stubEnv('CONGRESS_API_KEY', '')
    const { GET } = await import('./route')
    const res = await GET(new NextRequest('http://localhost/api/bills/119-hr-1234'), {
      params: Promise.resolve({ id: '119-hr-1234' }),
    })
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toMatch(/configuration/i)
  })

  it('returns 404 when Congress.gov returns 404', async () => {
    const supabase = buildSupabaseMock()
    mockCreateClient.mockResolvedValue(supabase)

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(errorResponse(404))
      .mockResolvedValueOnce(errorResponse(404))
      .mockResolvedValueOnce(errorResponse(404))
    )

    const res = await callGET('119-hr-9999')
    expect(res.status).toBe(404)
  })

  it('returns Congress.gov error status on non-404 failure', async () => {
    const supabase = buildSupabaseMock()
    mockCreateClient.mockResolvedValue(supabase)

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(503))
      .mockResolvedValueOnce(errorResponse(503))
    )

    const res = await callGET('119-hr-1234')
    expect(res.status).toBe(503)
  })

  it('returns 200 with full bill object on happy path', async () => {
    const supabase = buildSupabaseMock()
    mockCreateClient.mockResolvedValue(supabase)

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(makeBillDetail()))
      .mockResolvedValueOnce(jsonResponse(makeActionsResponse([
        { actionDate: '2025-06-01', text: 'Introduced.', type: 'IntroReferral' },
      ])))
      .mockResolvedValueOnce(jsonResponse(makeSummariesResponse('A <b>summary</b>.')))
    )

    const res = await callGET('119-hr-1234')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.bill).toBeDefined()
    expect(json.bill.id).toBe('119-hr-1234')
    expect(json.bill.number).toBe('H.R. 1234')
    expect(json.bill.title).toBe('A Test Bill')
    expect(json.bill.summary).toBe('A summary.')
    expect(json.bill.sponsor.name).toBe('Jane Doe')
    expect(json.bill.actions).toHaveLength(1)
  })

  it('includes partyBreakdown and memberPositions when DB votes exist', async () => {
    const dbVotes = [
      {
        id: 'house-119-100',
        chamber: 'House',
        date: '2025-06-01',
        title: 'On Passage',
        question: 'On Passage',
        result: 'Passed',
        required: 'Simple Majority',
        yea_total: 220,
        nay_total: 210,
        present_total: 0,
        not_voting_total: 5,
        yea_democrat: 10,
        nay_democrat: 200,
        yea_republican: 210,
        nay_republican: 10,
        yea_independent: 0,
        nay_independent: 0,
        source_url: 'https://example.com/vote',
        bill_vote_positions: [
          {
            bioguide_id: 'D000001',
            position: 'Yea',
            legislators: { full_name: 'Jane Doe', party: 'Democrat', state: 'CA', photo_url: null },
          },
        ],
      },
    ]
    const supabase = buildSupabaseMock(dbVotes)
    mockCreateClient.mockResolvedValue(supabase)

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(jsonResponse(makeBillDetail()))
      .mockResolvedValueOnce(jsonResponse(makeActionsResponse()))
      .mockResolvedValueOnce(jsonResponse(makeSummariesResponse()))
    )

    const res = await callGET('119-hr-1234')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.bill._hasDetailedVotes).toBe(true)
    expect(json.bill.votes).toHaveLength(1)

    const vote = json.bill.votes[0]
    expect(vote.partyBreakdown.democrat.yea).toBe(10)
    expect(vote.partyBreakdown.republican.yea).toBe(210)
    expect(vote.memberPositions).toHaveLength(1)
    expect(vote.memberPositions[0].bioguideId).toBe('D000001')
  })
})
