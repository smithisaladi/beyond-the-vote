import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSql = vi.fn()
vi.mock('@/lib/db', () => ({ sql: mockSql }))

const { hybridBillSearch } = await import('./hybrid-bill-search')

const sampleRow = {
  bill_id: '119-hr-1234',
  congress: 119,
  title: 'Test Bill',
  bill_number: 'H.R. 1234',
  status: 'Active',
  summary: 'A test bill summary',
  sponsor_name: 'John Doe',
  sponsor_bioguide_id: 'D000001',
  sponsor_party: 'Democrat',
  introduced_date: '2025-01-15',
  policy_area: 'Health',
  congress_gov_url: 'https://congress.gov/bill/119th/hr1234',
  last_action_text: 'Introduced.',
  last_action_date: '2025-01-15',
  topics: ['healthcare'],
  rrf_score: 0.016,
}

describe('hybridBillSearch', () => {
  beforeEach(() => {
    mockSql.mockReset()
    // The postgres tagged template returns a Promise-like array
    mockSql.mockResolvedValue([sampleRow])
  })

  it('calls sql with queryText and returns results', async () => {
    const result = await hybridBillSearch({ queryText: 'healthcare' })
    expect(mockSql).toHaveBeenCalledTimes(1)
    expect(result).toEqual([sampleRow])
  })

  it('uses default resultLimit=20 and offsetCount=0', async () => {
    await hybridBillSearch({ queryText: 'test' })
    // Verify the sql tagged template was called (we can inspect the call args)
    const call = mockSql.mock.calls[0]
    // Tagged template: first arg is template strings array, rest are interpolated values
    const templateStrings = call[0]
    const interpolatedValues = call.slice(1)

    // queryText appears in the interpolated values
    expect(interpolatedValues).toContain('test')
    // default resultLimit (20) and offsetCount (0) are in interpolated values
    expect(interpolatedValues).toContain(20)
    expect(interpolatedValues).toContain(0)
  })

  it('passes custom resultLimit and offsetCount', async () => {
    await hybridBillSearch({ queryText: 'test', resultLimit: 10, offsetCount: 5 })
    const values = mockSql.mock.calls[0].slice(1)
    expect(values).toContain(10)
    expect(values).toContain(5)
  })

  it('passes filters as interpolated values', async () => {
    await hybridBillSearch({
      queryText: 'climate',
      statusFilter: 'Active',
      topicFilters: ['climate-environment'],
      congressFilter: 119,
    })
    const values = mockSql.mock.calls[0].slice(1)
    expect(values).toContain('climate')
    expect(values).toContain('Active')
    expect(values).toContainEqual(['climate-environment'])
    expect(values).toContain(119)
  })

  it('passes null for unset filters', async () => {
    await hybridBillSearch({ queryText: 'test' })
    const values = mockSql.mock.calls[0].slice(1)
    // statusFilter, topicFilters, policyAreas, congressFilter, billIds default to null
    const nullCount = values.filter((v: unknown) => v === null).length
    expect(nullCount).toBeGreaterThanOrEqual(5)
  })

  it('returns empty array when no results', async () => {
    mockSql.mockResolvedValue([])
    const result = await hybridBillSearch({ queryText: 'nonexistent' })
    expect(result).toEqual([])
  })
})
