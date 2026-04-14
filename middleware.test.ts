import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock @supabase/ssr before importing middleware
const mockGetUser = vi.fn()
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: mockGetUser },
  }),
}))

// Now import the middleware — the mock is already in place
const { middleware } = await import('./middleware')

function makeRequest(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost:3000'))
}

describe('middleware', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  describe('when user is authenticated', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: { id: '1' } } })
    })

    it('redirects /dashboard to /', async () => {
      const res = await middleware(makeRequest('/dashboard'))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/')
    })

    it('redirects /dashboard/anything to /', async () => {
      const res = await middleware(makeRequest('/dashboard/overview'))
      expect(res.status).toBe(307)
      expect(new URL(res.headers.get('location')!).pathname).toBe('/')
    })

    it('allows /settings through', async () => {
      const res = await middleware(makeRequest('/settings'))
      expect(res.status).toBe(200)
    })

    it('allows public routes through', async () => {
      for (const path of ['/', '/bills', '/representatives', '/donors']) {
        const res = await middleware(makeRequest(path))
        expect(res.status).toBe(200)
      }
    })
  })

  describe('when user is unauthenticated', () => {
    beforeEach(() => {
      mockGetUser.mockResolvedValue({ data: { user: null } })
    })

    it('redirects /settings to / with ?redirect=/settings', async () => {
      const res = await middleware(makeRequest('/settings'))
      expect(res.status).toBe(307)
      const loc = new URL(res.headers.get('location')!)
      expect(loc.pathname).toBe('/')
      expect(loc.searchParams.get('redirect')).toBe('/settings')
    })

    it('allows public routes through', async () => {
      for (const path of ['/', '/bills', '/representatives', '/donors', '/bills/119-hr-1234']) {
        const res = await middleware(makeRequest(path))
        expect(res.status).toBe(200)
      }
    })

    it('does not redirect /dashboard when unauthenticated (only logged-in users are redirected)', async () => {
      const res = await middleware(makeRequest('/dashboard'))
      // No user → not matching the `user && pathname.startsWith('/dashboard')` branch
      expect(res.status).toBe(200)
    })
  })
})
