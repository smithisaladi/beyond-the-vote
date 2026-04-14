import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSql = vi.fn()
vi.mock('@/lib/db', () => ({ sql: mockSql }))

const { lookupBill } = await import('./lookup-bill')

const sampleRow = {
  bill_id: '119-hr-1234',
  congress: 119,
  title: 'Test Bill',
  summary: null,
  combined_text: null,
  synced_at: null,
  topics: [],
  status: 'Active',
  bill_number: 'H.R.1234',
  sponsor_name: null,
  sponsor_bioguide_id: null,
  sponsor_party: null,
  introduced_date: null,
  policy_area: null,
  congress_gov_url: null,
  last_action_text: null,
  last_action_date: null,
  referenced_agencies: null,
  referenced_laws: null,
  referenced_usc: null,
}

describe('lookupBill', () => {
  beforeEach(() => {
    mockSql.mockReset()
    mockSql.mockResolvedValue([sampleRow])
  })

  it('passes lowercased bill_id and uppercased bill_number', async () => {
    await lookupBill('119-HR-1234')
    const values = mockSql.mock.calls[0].slice(1)
    expect(values).toContain('119-hr-1234')   // toLowerCase
    expect(values).toContain('119-HR-1234')    // toUpperCase
  })

  it('trims whitespace from input', async () => {
    await lookupBill('  119-hr-1234  ')
    const values = mockSql.mock.calls[0].slice(1)
    expect(values).toContain('119-hr-1234')
  })

  it('returns results', async () => {
    const result = await lookupBill('119-hr-1234')
    expect(result).toEqual([sampleRow])
  })

  it('returns empty array when no match', async () => {
    mockSql.mockResolvedValue([])
    const result = await lookupBill('nonexistent')
    expect(result).toEqual([])
  })
})
