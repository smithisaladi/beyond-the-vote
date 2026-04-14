import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockGetBillsByTopic = vi.fn()
vi.mock('@/lib/queries/get-bills-by-topic', () => ({ getBillsByTopic: mockGetBillsByTopic }))

const { GET } = await import('./route')

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/bills/by-topic')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/bills/by-topic', () => {
  beforeEach(() => {
    mockGetBillsByTopic.mockReset()
    mockGetBillsByTopic.mockResolvedValue([])
  })

  it('returns 400 when slug is missing', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/slug/)
  })

  it('returns bills for valid slug', async () => {
    mockGetBillsByTopic.mockResolvedValue([
      { bill_id: '119-hr-1', bill_number: 'H.R. 1', title: 'Test', status: 'Active', topics: ['healthcare'], summary: null },
    ])
    const res = await GET(makeReq({ slug: 'healthcare' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.bills).toHaveLength(1)
    expect(json.bills[0].id).toBe('119-hr-1')
    expect(json.slug).toBe('healthcare')
    expect(json.count).toBe(1)
  })

  it('passes status filter to query', async () => {
    await GET(makeReq({ slug: 'healthcare', status: 'Passed' }))
    expect(mockGetBillsByTopic).toHaveBeenCalledWith('healthcare', expect.any(Number), 'Passed')
  })

  it('caps limit at 100', async () => {
    await GET(makeReq({ slug: 'healthcare', limit: '999' }))
    expect(mockGetBillsByTopic).toHaveBeenCalledWith('healthcare', 100, null)
  })

  it('returns 500 on internal error', async () => {
    mockGetBillsByTopic.mockRejectedValue(new Error('fail'))
    const res = await GET(makeReq({ slug: 'healthcare' }))
    expect(res.status).toBe(500)
  })
})
