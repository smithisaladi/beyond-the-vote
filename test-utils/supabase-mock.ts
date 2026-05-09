import { vi } from 'vitest'

type MockFn = ReturnType<typeof vi.fn>

export interface SupabaseMock {
  from: MockFn
  select: MockFn
  eq: MockFn
  in: MockFn
  gte: MockFn
  ilike: MockFn
  overlaps: MockFn
  order: MockFn
  range: MockFn
  limit: MockFn
  auth: { getUser: MockFn }
  /** Internal terminal node (used by donors route where range() returns a thenable sub-chain) */
  _terminal?: SupabaseTerminal
}

export interface SupabaseTerminal {
  ilike: MockFn
  then: (resolve: (v: unknown) => void) => Promise<unknown>
}

interface MockOptions {
  data?: unknown[]
  count?: number
  error?: unknown
  /**
   * When true, `range()` returns a thenable terminal object instead of a
   * plain resolved promise. This matches the donors route pattern where
   * `.ilike()` is chained after `.range()`.
   */
  thenableRange?: boolean
  /** When true, adds `auth.getUser` support (for routes requiring auth). */
  withAuth?: boolean
}

/**
 * Build a chainable Supabase PostgREST mock.
 *
 * Supports the common chain: `.from().select().eq().in().order().range()`
 * and the donors variant where `.range()` returns a thenable that also
 * supports `.ilike()`.
 */
export function createSupabaseMock({
  data = [],
  count = 0,
  error = null,
  thenableRange = false,
  withAuth = false,
}: MockOptions = {}): SupabaseMock {
  const finalResult = { data, error, count }

  const mock = {} as Record<string, unknown>

  // Standard chainable methods — each returns the mock itself
  mock.from = vi.fn().mockReturnValue(mock)
  mock.select = vi.fn().mockReturnValue(mock)
  mock.eq = vi.fn().mockReturnValue(mock)
  mock.in = vi.fn().mockReturnValue(mock)
  mock.gte = vi.fn().mockReturnValue(mock)
  mock.ilike = vi.fn().mockReturnValue(mock)
  mock.overlaps = vi.fn().mockReturnValue(mock)
  mock.order = vi.fn().mockReturnValue(mock)

  if (thenableRange) {
    // Donors-style: range() returns a thenable terminal that also chains ilike
    const terminal: Record<string, unknown> = {}
    terminal.ilike = vi.fn().mockReturnValue(terminal)
    terminal.then = (resolve: (v: unknown) => void) =>
      Promise.resolve(finalResult).then(resolve)
    mock.range = vi.fn().mockReturnValue(terminal)
    mock._terminal = terminal
  } else {
    mock.range = vi.fn().mockResolvedValue(finalResult)
  }

  mock.limit = vi.fn().mockResolvedValue(finalResult)

  // Auth support
  mock.auth = { getUser: vi.fn() }

  return mock as unknown as SupabaseMock
}
