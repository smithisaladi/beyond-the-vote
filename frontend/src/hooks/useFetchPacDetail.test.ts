import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { waitFor } from '@testing-library/react'
import { renderHookWithProviders } from '@/lib/test/render'
import { useFetchPacDetail, type PacDetail } from './useFetchPacDetail'

function makePacDetail(overrides: Partial<PacDetail> = {}): Omit<PacDetail, 'summary'> {
  return {
    cmteId: 'C00123456',
    name: 'Test PAC',
    connectedOrg: 'Test Corp',
    totalContributions: 500000,
    directTotal: 300000,
    ieForTotal: 150000,
    ieAgainstTotal: 50000,
    recipientCount: 3,
    recipients: [
      {
        bioguideId: 'B000001',
        name: 'Jane Smith',
        party: 'Democrat',
        state: 'CA',
        chamber: 'Senate',
        amount: 10000,
        direct: 5000,
        ieFor: 5000,
      },
    ],
    ...overrides,
  }
}

describe('useFetchPacDetail', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches PAC detail then summary sequentially', async () => {
    const pacData = makePacDetail()

    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => pacData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ summary: 'AI-generated summary of PAC activity.' }),
      })

    const { result } = renderHookWithProviders(() =>
      useFetchPacDetail('C00123456')
    )

    expect(result.current.loading).toBe(true)
    expect(result.current.pac).toBeNull()

    // Wait for PAC data to load
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pac).toBeTruthy()
    expect(result.current.pac?.name).toBe('Test PAC')
    expect(result.current.pac?.recipientCount).toBe(3)

    // Wait for summary to load
    await waitFor(() => expect(result.current.summaryLoading).toBe(false))
    expect(result.current.pac?.summary).toBe('AI-generated summary of PAC activity.')
    expect(result.current.error).toBeNull()
  })

  it('sets error on failed PAC fetch', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'PAC not found' }),
    })

    const { result } = renderHookWithProviders(() =>
      useFetchPacDetail('C00999999')
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('PAC not found')
    expect(result.current.pac).toBeNull()
  })

  it('shows PAC data even if summary fails', async () => {
    const pacData = makePacDetail()

    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => pacData,
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'Summary generation failed' }),
      })

    const { result } = renderHookWithProviders(() =>
      useFetchPacDetail('C00123456')
    )

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.pac).toBeTruthy()
    expect(result.current.pac?.name).toBe('Test PAC')

    await waitFor(() => expect(result.current.summaryLoading).toBe(false))
    expect(result.current.pac?.summary).toBe('')
    expect(result.current.error).toBeNull()
  })
})
