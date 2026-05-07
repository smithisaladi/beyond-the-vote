import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { useFetchBillDetail } from './useFetchBillDetail'
import type { BillDetail } from '@/lib/types/bills'

function makeBillDetail(overrides: Partial<BillDetail> = {}): BillDetail {
  return {
    id: 'hr-1234-119',
    number: 'H.R. 1234',
    title: 'Test Bill',
    congress: 119,
    introducedDate: '2025-01-15',
    status: 'Active',
    summary: 'A test bill summary',
    sponsor: { name: 'Jane Doe', bioguideId: 'D000001', party: 'Democrat', state: 'CA', district: '12' },
    cosponsors: [],
    policyArea: 'Health',
    topics: ['healthcare'],
    subjects: ['Public Health'],
    congressGovUrl: 'https://congress.gov/bill/119/hr1234',
    actions: [{ date: '2025-01-15', text: 'Introduced', type: 'IntroReferral' }],
    votes: [],
    _hasDetailedVotes: false,
    ...overrides,
  }
}

describe('useFetchBillDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches bill detail when no initialBill is provided', async () => {
    const bill = makeBillDetail()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bill }),
    })

    const { result } = renderHookWithProviders(() =>
      useFetchBillDetail('hr-1234-119')
    )

    expect(result.current.loading).toBe(true)
    expect(result.current.bill).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.bill).toEqual(bill)
    expect(result.current.error).toBeNull()
  })

  it('uses initialBill immediately and enriches in background', async () => {
    const initial = makeBillDetail({ cosponsors: [], subjects: [] })
    const enriched = makeBillDetail({
      cosponsors: [{ name: 'John Smith', bioguideId: 'S000001', party: 'Republican', state: 'TX' }],
      subjects: ['Public Health', 'Medicare'],
      actions: [
        { date: '2025-01-15', text: 'Introduced', type: 'IntroReferral' },
        { date: '2025-02-01', text: 'Referred to committee', type: 'Committee' },
      ],
    })

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bill: enriched }),
    })

    const { result } = renderHookWithProviders(() =>
      useFetchBillDetail('hr-1234-119', initial)
    )

    // Initial data is available immediately, no loading state
    expect(result.current.loading).toBe(false)
    expect(result.current.bill).toEqual(initial)

    // After background fetch, data is enriched
    await waitFor(() => {
      expect(result.current.bill?.cosponsors).toHaveLength(1)
    })
    expect(result.current.bill?.subjects).toEqual(['Public Health', 'Medicare'])
    expect(result.current.bill?.actions).toHaveLength(2)
  })

  it('sets error on failed fetch', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Bill not found' }),
    })

    const { result } = renderHookWithProviders(() =>
      useFetchBillDetail('hr-9999-119')
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Bill not found')
    expect(result.current.bill).toBeNull()
  })
})
