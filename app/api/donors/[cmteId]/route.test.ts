import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockPacDetail = vi.fn()
const mockAnthropicCreate = vi.fn()

vi.mock('@/lib/queries/pac-detail', () => ({
  pacDetail: (...args: unknown[]) => mockPacDetail(...args),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class MockAnthropic {
    messages = { create: mockAnthropicCreate }
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePacRow(overrides: Record<string, unknown> = {}) {
  return {
    cmte_id: 'C00123456',
    cmte_name: 'TEST PAC',
    connected_org: 'TEST ORG',
    total_contributions: 50000,
    direct_total: 30000,
    ie_for_total: 15000,
    ie_against_total: 5000,
    recipient_count: 5,
    recipients: [
      {
        bioguide_id: 'D000001',
        name: 'Jane Doe',
        party: 'Democrat',
        state: 'CA',
        chamber: 'senate',
        amount: 10000,
        direct: 8000,
        ie_for: 2000,
      },
    ],
    ...overrides,
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('GET /api/donors/[cmteId]', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.resetModules()
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
  })

  async function callGET(cmteId: string, params: Record<string, string> = {}) {
    const { GET } = await import('./route')
    const url = new URL(`http://localhost/api/donors/${cmteId}`)
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
    return GET(new NextRequest(url), {
      params: Promise.resolve({ cmteId }),
    })
  }

  it('returns 200 with PAC details on happy path', async () => {
    mockPacDetail.mockResolvedValue([makePacRow()])

    const res = await callGET('C00123456')
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.cmteId).toBe('C00123456')
    expect(json.name).toBe('Test Pac')
    expect(json.connectedOrg).toBe('Test Org')
    expect(json.totalContributions).toBe(50000)
    expect(json.recipients).toHaveLength(1)
    expect(json.recipients[0].bioguideId).toBe('D000001')
    // No summary when not requested
    expect(json.summary).toBe('')
  })

  it('returns 404 when PAC not found', async () => {
    mockPacDetail.mockResolvedValue([])

    const res = await callGET('C00NOTFOUND')
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toMatch(/not found/i)
  })

  it('calls Anthropic and includes summary when summary=1', async () => {
    mockPacDetail.mockResolvedValue([makePacRow()])
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'This PAC supports healthcare initiatives.' }],
    })

    const res = await callGET('C00123456', { summary: '1' })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.summary).toBe('This PAC supports healthcare initiatives.')
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
  })

  it('does NOT call Anthropic when summary param is absent', async () => {
    mockPacDetail.mockResolvedValue([makePacRow()])

    const res = await callGET('C00123456')
    expect(res.status).toBe(200)
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('returns empty string summary when Anthropic fails', async () => {
    mockPacDetail.mockResolvedValue([makePacRow()])
    mockAnthropicCreate.mockRejectedValue(new Error('API quota exceeded'))

    const res = await callGET('C00123456', { summary: '1' })
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.summary).toBe('')
  })

  it('returns 500 when pacDetail throws', async () => {
    mockPacDetail.mockRejectedValue(new Error('DB connection failed'))

    const res = await callGET('C00123456')
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBeDefined()
  })
})
