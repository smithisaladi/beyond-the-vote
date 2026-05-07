import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { useTopicBills } from './useTopicBills'
import type { Topic } from '@/lib/topics'

describe('useTopicBills', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty items when no topics selected', () => {
    const { result } = renderHookWithProviders(() =>
      useTopicBills(new Set<Topic>())
    )

    expect(result.current.items).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('fetches bills for each selected topic', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        bills: [{ id: 'bill-1', number: 'S. 100', title: 'Test Bill', status: 'active' }],
      }),
    })

    const { result } = renderHookWithProviders(() =>
      useTopicBills(new Set<Topic>(['Healthcare']))
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.items.length).toBe(1))

    expect(result.current.items[0]).toEqual({
      topic: 'Healthcare',
      bill: { id: 'bill-1', number: 'S. 100', title: 'Test Bill', status: 'active' },
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/bills/by-topic?slug=healthcare&limit=10'
    )
  })

  it('deduplicates bills across topics', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        bills: [{ id: 'bill-dup', number: 'H.R. 1', title: 'Shared Bill', status: 'active' }],
      }),
    })

    const { result } = renderHookWithProviders(() =>
      useTopicBills(new Set<Topic>(['Healthcare', 'Education']))
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    await waitFor(() => expect(result.current.items.length).toBe(1))

    expect(result.current.items[0].bill.id).toBe('bill-dup')
  })
})
