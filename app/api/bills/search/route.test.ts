import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const mockLookupBill = vi.fn()
const mockHybridBillSearch = vi.fn()

vi.mock('@/lib/queries/lookup-bill', () => ({ lookupBill: mockLookupBill }))
vi.mock('@/lib/queries/hybrid-bill-search', () => ({ hybridBillSearch: mockHybridBillSearch }))

const { GET } = await import('./route')

function makeReq(params: Record<string, string>) {
  const url = new URL('http://localhost/api/bills/search')
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  return new NextRequest(url)
}

describe('GET /api/bills/search', () => {
  beforeEach(() => {
    mockLookupBill.mockReset()
    mockHybridBillSearch.mockReset()
    mockHybridBillSearch.mockResolvedValue([])
  })

  it('returns 400 when q < 3 characters', async () => {
    const res = await GET(makeReq({ q: 'ab' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toMatch(/at least 3/)
  })

  it('returns 400 when q is empty', async () => {
    const res = await GET(makeReq({}))
    expect(res.status).toBe(400)
  })

  it('tries exact bill lookup for bill ID format', async () => {
    mockLookupBill.mockResolvedValue([{ bill_id: '119-hr-4521', title: 'Test' }])
    const res = await GET(makeReq({ q: '119-hr-4521' }))
    expect(res.status).toBe(200)
    expect(mockLookupBill).toHaveBeenCalledWith('119-hr-4521')
    // Should NOT call hybrid search since exact lookup returned results
    expect(mockHybridBillSearch).not.toHaveBeenCalled()
  })

  it('falls through to hybrid search when exact lookup returns nothing', async () => {
    mockLookupBill.mockResolvedValue([])
    mockHybridBillSearch.mockResolvedValue([{ bill_id: '119-hr-999', title: 'Fuzzy' }])
    const res = await GET(makeReq({ q: '119-hr-0000' }))
    expect(res.status).toBe(200)
    expect(mockLookupBill).toHaveBeenCalled()
    expect(mockHybridBillSearch).toHaveBeenCalled()
  })

  it('uses hybrid search for regular text query', async () => {
    mockHybridBillSearch.mockResolvedValue([{ bill_id: '119-hr-1', title: 'Climate' }])
    const res = await GET(makeReq({ q: 'climate change' }))
    expect(res.status).toBe(200)
    expect(mockLookupBill).not.toHaveBeenCalled()
    expect(mockHybridBillSearch).toHaveBeenCalled()
  })

  it('passes congress filter to hybrid search', async () => {
    mockHybridBillSearch.mockResolvedValue([])
    await GET(makeReq({ q: 'healthcare', congress: '119' }))
    expect(mockHybridBillSearch).toHaveBeenCalledWith(
      expect.objectContaining({ congressFilter: 119 }),
    )
  })

  it('caps limit at 50', async () => {
    mockHybridBillSearch.mockResolvedValue([])
    await GET(makeReq({ q: 'test query', limit: '999' }))
    expect(mockHybridBillSearch).toHaveBeenCalledWith(
      expect.objectContaining({ resultLimit: 50 }),
    )
  })

  it('returns 500 on internal error', async () => {
    mockHybridBillSearch.mockRejectedValue(new Error('DB down'))
    const res = await GET(makeReq({ q: 'test query' }))
    expect(res.status).toBe(500)
  })
})
