import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { useDashboard } from './useDashboard'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      insert: () => Promise.resolve({ error: null }),
    }),
  }),
}))

describe('useDashboard', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns empty state when no user', () => {
    const { result } = renderHookWithProviders(() => useDashboard(null))

    expect(result.current.followedPoliticians).toEqual([])
    expect(result.current.trackedBillDetails).toEqual([])
    expect(result.current.topicFeedItems).toEqual([])
    expect(result.current.followedTopics).toEqual([])
    expect(result.current.activity).toEqual([])
    expect(result.current.loading).toBe(false)
  })

  it('fetches followed politicians for authenticated user', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/dashboard/followed') {
        return {
          ok: true,
          json: async () => ({
            politicians: [
              {
                id: 'p1',
                name: 'Rep A',
                title: 'Rep',
                party: 'Democrat',
                state: 'CA',
                latestVote: null,
              },
            ],
          }),
        }
      }
      if (url === '/api/dashboard/tracked-bills') {
        return { ok: true, json: async () => ({ bills: [] }) }
      }
      if (url.includes('/api/dashboard/topic-preferences')) {
        return { ok: true, json: async () => ({ topics: [] }) }
      }
      return { ok: true, json: async () => ({}) }
    })

    const fakeUser = { id: 'user-1' } as User

    const { result } = renderHookWithProviders(() => useDashboard(fakeUser))

    await waitFor(() => {
      expect(result.current.followedPoliticians).toHaveLength(1)
    })

    expect(result.current.followedPoliticians[0].name).toBe('Rep A')
  })
})
