import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { useTrackedBills } from './useTrackedBills'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}))

describe('useTrackedBills', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty set when no userId', () => {
    const { result } = renderHookWithProviders(() => useTrackedBills(null))

    expect(result.current.trackedBills).toEqual(new Set())
    expect(result.current.loading).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fetches tracked bill IDs for authenticated user', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ bills: [{ id: 'b1' }, { id: 'b2' }] }),
    })

    const { result } = renderHookWithProviders(() => useTrackedBills('user-1'))

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.trackedBills).toEqual(new Set(['b1', 'b2']))
    expect(result.current.error).toBeNull()
  })

  it('toggleTrack optimistically adds a bill', async () => {
    // First call: initial fetch; second call: refetch after mutation includes b3
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ bills: [{ id: 'b1' }] }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ bills: [{ id: 'b1' }, { id: 'b3' }] }),
      })

    const { result } = renderHookWithProviders(() => useTrackedBills('user-1'))

    await waitFor(() => expect(result.current.trackedBills).toEqual(new Set(['b1'])))

    act(() => {
      result.current.toggleTrack('b3')
    })

    // Optimistic update should appear quickly
    await waitFor(() => {
      expect(result.current.trackedBills.has('b3')).toBe(true)
    })
  })
})
