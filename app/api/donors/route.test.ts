import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createSupabaseMock } from '@/test-utils/supabase-mock'

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
    mockCreateClient.mockResolvedValue(
      createSupabaseMock({ data: [sampleRow], count: 1, thenableRange: true }),
    )
    const res = await GET(makeReq())
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.contributors).toHaveLength(1)
    expect(json.contributors[0].cmteId).toBe('C00401224')
    expect(json.contributors[0].totalContributions).toBe(175000)
    expect(json.pagination.total).toBe(1)
  })

  it('applies search filter when q is provided', async () => {
    const mock = createSupabaseMock({ thenableRange: true })
    mockCreateClient.mockResolvedValue(mock)
    await GET(makeReq({ q: 'AIPAC' }))
    const terminal = mock._terminal!
    expect(terminal.ilike).toHaveBeenCalledWith('cmte_name', '%AIPAC%')
  })

  it('caps limit at 100', async () => {
    const mock = createSupabaseMock({ thenableRange: true })
    mockCreateClient.mockResolvedValue(mock)
    await GET(makeReq({ limit: '999' }))
    expect(mock.range).toHaveBeenCalledWith(0, 99)
  })

  it('returns 500 on error', async () => {
    mockCreateClient.mockResolvedValue(
      createSupabaseMock({ error: { message: 'fail' }, thenableRange: true }),
    )
    const res = await GET(makeReq())
    expect(res.status).toBe(500)
  })

  it('returns 400 for negative limit values', async () => {
    const mock = createSupabaseMock({ thenableRange: true })
    mockCreateClient.mockResolvedValue(mock)
    const res = await GET(makeReq({ limit: '-5' }))
    // Zod's nonnegative() rejects negative numbers at validation
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid offset values', async () => {
    const mock = createSupabaseMock({ thenableRange: true })
    mockCreateClient.mockResolvedValue(mock)
    const res = await GET(makeReq({ offset: 'abc' }))
    // "abc" coerces to NaN which fails Zod's int().nonnegative()
    expect(res.status).toBe(400)
  })
})
