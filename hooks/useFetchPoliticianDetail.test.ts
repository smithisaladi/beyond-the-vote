import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { useFetchPoliticianDetail } from './useFetchPoliticianDetail'
import type { Politician } from '@/lib/types/politicians'

function makePolitician(overrides: Partial<Politician> = {}): Politician {
  return {
    id: 'p-001',
    bioguideId: 'B000001',
    name: 'Jane Smith',
    title: 'Senator',
    party: 'Democrat',
    state: 'California',
    stateCode: 'CA',
    since: '2019-01-03',
    photo: 'https://example.com/photo.jpg',
    photoCredit: null,
    website: 'https://smith.senate.gov',
    address: '123 Senate Office',
    phone: '202-555-0100',
    fecUrl: null,
    nextElectionYear: 2026,
    stats: {
      yearsInOffice: 6,
      attendance: 95,
      ideologyScore: -0.3,
    },
    votes: [],
    bills: [],
    donors: [],
    pacDonors: [],
    topContributors: [],
    fundingBreakdown: null,
    committees: [],
    ...overrides,
  }
}

describe('useFetchPoliticianDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches politician when no initialPolitician provided', async () => {
    const politician = makePolitician()
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ politician }),
    })

    const { result } = renderHookWithProviders(() =>
      useFetchPoliticianDetail('p-001')
    )

    expect(result.current.loading).toBe(true)
    expect(result.current.politician).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.politician).toEqual(politician)
    expect(result.current.error).toBeNull()
  })

  it('uses initialPolitician immediately and enriches in background', async () => {
    const initial = makePolitician({ bills: [], votes: [], photoCredit: null })
    const enriched = makePolitician({
      bills: [
        { id: 'b-1', name: 'Test Act', number: 'S. 100', status: 'Passed', date: '2025-03-01' },
      ],
      votes: [
        {
          id: 'v-1',
          bill: 'S. 200',
          billId: 'b-2',
          billTitle: 'Another Act',
          date: '2025-04-01',
          vote: 'Yea',
          question: 'On Passage',
          donorAlignments: [],
        },
      ],
      photoCredit: 'Official Senate Photo',
    })

    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ politician: enriched }),
    })

    const { result } = renderHookWithProviders(() =>
      useFetchPoliticianDetail('p-001', initial)
    )

    // Initial data is available immediately, no loading state
    expect(result.current.loading).toBe(false)
    expect(result.current.politician).toEqual(initial)

    // After background fetch, data is enriched
    await waitFor(() => {
      expect(result.current.politician?.bills).toHaveLength(1)
    })
    expect(result.current.politician?.photoCredit).toBe('Official Senate Photo')
    expect(result.current.politician?.votes).toHaveLength(1)
  })

  it('sets error on failed fetch', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Politician not found' }),
    })

    const { result } = renderHookWithProviders(() =>
      useFetchPoliticianDetail('p-999')
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Politician not found')
    expect(result.current.politician).toBeNull()
  })
})
