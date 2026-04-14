import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSql = vi.fn()
vi.mock('@/lib/db', () => ({ sql: mockSql }))

const { pacDetail } = await import('./pac-detail')

const sampleRow = {
  cmte_id: 'C00401224',
  cmte_name: 'AIPAC PAC',
  connected_org: 'AIPAC',
  total_contributions: 500_000,
  direct_total: 300_000,
  ie_for_total: 150_000,
  ie_against_total: 50_000,
  recipient_count: 15,
  recipients: [
    { bioguide_id: 'D000001', name: 'John Doe', party: 'Democrat', state: 'CA', chamber: 'house', amount: 50000, direct: 30000, ie_for: 20000 },
  ],
}

describe('pacDetail', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockSql.mockResolvedValue([sampleRow])
  })

  it('passes targetCmteId to the query', async () => {
    await pacDetail('C00401224')
    const values = mockSql.mock.calls[0].slice(1)
    // cmteId appears multiple times in the CTEs
    const cmteIdOccurrences = values.filter((v: unknown) => v === 'C00401224').length
    expect(cmteIdOccurrences).toBeGreaterThanOrEqual(1)
  })

  it('returns the result rows', async () => {
    const result = await pacDetail('C00401224')
    expect(result).toEqual([sampleRow])
  })

  it('returns empty recipients when no match', async () => {
    mockSql.mockResolvedValue([{ ...sampleRow, recipients: [], total_contributions: 0, recipient_count: 0 }])
    const result = await pacDetail('C00000000')
    expect(result[0].recipients).toEqual([])
    expect(result[0].recipient_count).toBe(0)
  })
})
