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
  mock.auth = { getUser: vi.fn() }
  return mock
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/dashboard/tracked-bills', () => {
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

  it('returns empty bills array when user has no tracked bills', async () => {
    const supabase = buildChain()
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    // tracked_bills returns empty
    supabase.eq.mockResolvedValueOnce({ data: [] })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await callGET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bills).toEqual([])
  })

  it('returns 200 with tracked bills on happy path', async () => {
    const supabase = buildChain()
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const tracked = [{ bill_id: '119-hr-1' }]
    const bills = [
      {
        bill_id: '119-hr-1',
        bill_number: 'H.R. 1',
        title: 'Test Bill',
        status: 'Active',
        last_action_date: '2025-06-01',
        last_action_text: 'Introduced.',
        policy_area: 'Health',
      },
    ]

    // .eq() on tracked_bills resolves tracked
    supabase.eq.mockResolvedValueOnce({ data: tracked })
    // .in() on bills resolves bills
    supabase.in.mockResolvedValueOnce({ data: bills })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await callGET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bills).toHaveLength(1)
    expect(json.bills[0].id).toBe('119-hr-1')
    expect(json.bills[0].number).toBe('H.R. 1')
    expect(json.bills[0].title).toBe('Test Bill')
    expect(json.bills[0].status).toBe('Active')
    expect(json.bills[0].category).toBe('Health')
  })

  it('returns empty bills when DB returns null bill rows', async () => {
    const supabase = buildChain()
    supabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    supabase.eq.mockResolvedValueOnce({ data: [{ bill_id: '119-hr-1' }] })
    supabase.in.mockResolvedValueOnce({ data: null })
    mockCreateClient.mockResolvedValue(supabase)

    const res = await callGET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bills).toEqual([])
  })

  it('returns 500 on unexpected error', async () => {
    mockCreateClient.mockRejectedValue(new Error('DB connection lost'))

    const res = await callGET()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })
})
