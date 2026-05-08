import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { usePaginatedFetch } from './usePaginatedFetch'

interface Item {
  id: number
  name: string
}

function makeParams(offset: number, extra?: string) {
  const p = new URLSearchParams({ limit: '2', offset: String(offset) })
  if (extra) p.set('q', extra)
  return p
}

describe('usePaginatedFetch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the first page on mount and exposes data/total', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ id: 1, name: 'a' }], pagination: { total: 5 } }),
    })

    const { result } = renderHookWithProviders(() =>
      usePaginatedFetch<Item>({
        endpoint: '/api/items',
        buildParams: offset => makeParams(offset),
        responseKey: 'items',
        resetKey: '',
        pageSize: 2,
      })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.data).toEqual([{ id: 1, name: 'a' }])
    expect(result.current.total).toBe(5)
    expect(result.current.hasMore).toBe(true)
    expect(result.current.error).toBeNull()
  })

  it('loadMore appends the next page using the incremented offset', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }], pagination: { total: 4 } }),
    })
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ id: 3, name: 'c' }, { id: 4, name: 'd' }], pagination: { total: 4 } }),
    })

    const { result } = renderHookWithProviders(() =>
      usePaginatedFetch<Item>({
        endpoint: '/api/items',
        buildParams: offset => makeParams(offset),
        responseKey: 'items',
        resetKey: '',
        pageSize: 2,
      })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    act(() => result.current.loadMore())
    await waitFor(() => expect(result.current.loadingMore).toBe(false))

    expect(result.current.data.map(i => i.id)).toEqual([1, 2, 3, 4])
    expect(result.current.hasMore).toBe(false)
  })

  it('falls back to data length when pagination.total is absent', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ id: 1, name: 'a' }] }),
    })

    const { result } = renderHookWithProviders(() =>
      usePaginatedFetch<Item>({
        endpoint: '/api/items',
        buildParams: offset => makeParams(offset),
        responseKey: 'items',
        resetKey: '',
      })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.total).toBe(1)
    expect(result.current.hasMore).toBe(false)
  })

  it('surfaces error on non-ok response and uses body.error when present', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server blew up' }),
    })

    const { result } = renderHookWithProviders(() =>
      usePaginatedFetch<Item>({
        endpoint: '/api/items',
        buildParams: offset => makeParams(offset),
        responseKey: 'items',
        resetKey: '',
        errorFallback: 'fallback',
      })
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('Server blew up')
    expect(result.current.data).toEqual([])
  })

  it('refetches from page 0 when resetKey changes', async () => {
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], pagination: { total: 0 } }),
    })

    const { result, rerender } = renderHookWithProviders(
      ({ q }: { q: string }) =>
        usePaginatedFetch<Item>({
          endpoint: '/api/items',
          buildParams: offset => makeParams(offset, q),
          responseKey: 'items',
          resetKey: q,
        }),
      { initialProps: { q: 'first' } }
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    rerender({ q: 'second' })
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2))
  })
})
