import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSql = vi.fn()
vi.mock('@/lib/db', () => ({ sql: mockSql }))

const { getBillsByTopic } = await import('./get-bills-by-topic')

describe('getBillsByTopic', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockSql.mockResolvedValue([])
  })

  it('passes topicSlug, default matchCount=20, null statusFilter', async () => {
    await getBillsByTopic('healthcare')
    const values = mockSql.mock.calls[0].slice(1)
    expect(values).toContain('healthcare')
    expect(values).toContain(20)
    expect(values).toContain(null)
  })

  it('passes custom matchCount and statusFilter', async () => {
    await getBillsByTopic('healthcare', 10, 'Active')
    const values = mockSql.mock.calls[0].slice(1)
    expect(values).toContain(10)
    expect(values).toContain('Active')
  })

  it('returns results', async () => {
    const row = { bill_id: '119-hr-1', congress: 119, title: 'T', summary: null, bill_number: null, status: 'Active', topics: ['healthcare'] }
    mockSql.mockResolvedValue([row])
    const result = await getBillsByTopic('healthcare')
    expect(result).toEqual([row])
  })
})
