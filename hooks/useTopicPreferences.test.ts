import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { useTopicPreferences } from './useTopicPreferences'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}))

describe('useTopicPreferences', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads topics from localStorage for anonymous users', async () => {
    localStorage.setItem('btb_topics', JSON.stringify(['Healthcare', 'Education']))

    const { result } = renderHookWithProviders(() => useTopicPreferences(null))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.selectedTopics).toEqual(new Set(['Healthcare', 'Education']))
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('fetches topics from API for authenticated users', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ topics: ['Defense', 'Energy'] }),
    })

    const user = { id: 'user-1' } as import('@supabase/supabase-js').User

    const { result } = renderHookWithProviders(() => useTopicPreferences(user))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.selectedTopics).toEqual(new Set(['Defense', 'Energy']))
  })

  it('toggle adds a topic optimistically', async () => {
    const { result } = renderHookWithProviders(() => useTopicPreferences(null))

    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.selectedTopics.size).toBe(0)

    act(() => {
      result.current.toggle('Healthcare')
    })

    await waitFor(() => {
      expect(result.current.selectedTopics.has('Healthcare')).toBe(true)
    })
  })
})
