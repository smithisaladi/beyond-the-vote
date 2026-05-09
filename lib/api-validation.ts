import { z } from 'zod'

// ── Pagination & query limits ────────────────────────────────────────────────
export const DEFAULT_PAGE_SIZE = 20
export const MAX_BILLS_LIMIT = 250
export const MAX_BILL_SEARCH_LIMIT = 50
export const MAX_TOPIC_BILLS_LIMIT = 100
export const MAX_DONORS_LIMIT = 100
export const MIN_SEARCH_LENGTH = 3

const intParam = (def: number) => z.coerce.number().int().nonnegative().default(def)

export const BillsParams = z.object({
  q: z.string().trim().optional(),
  status: z.string().optional(),
  topics: z.string().optional(),
  date: z.enum(['month', 'year']).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  limit: intParam(DEFAULT_PAGE_SIZE).pipe(z.number().transform(n => Math.max(1, Math.min(n, MAX_BILLS_LIMIT)))),
  offset: intParam(0),
  billIds: z.string().optional(),
})

export const BillSearchParams = z.object({
  q: z.string().min(MIN_SEARCH_LENGTH, `Query must be at least ${MIN_SEARCH_LENGTH} characters`),
  limit: intParam(DEFAULT_PAGE_SIZE).pipe(z.number().transform(n => Math.max(1, Math.min(n, MAX_BILL_SEARCH_LIMIT)))),
  congress: z.coerce.number().int().optional(),
})

export const BillsByTopicParams = z.object({
  slug: z.string({ error: 'Topic slug is required' }).min(1, 'Topic slug is required'),
  limit: intParam(DEFAULT_PAGE_SIZE).pipe(z.number().transform(n => Math.max(1, Math.min(n, MAX_TOPIC_BILLS_LIMIT)))),
  status: z.string().optional(),
})

export const PoliticianSearchParams = z.object({
  q: z.string().min(MIN_SEARCH_LENGTH, `Query must be at least ${MIN_SEARCH_LENGTH} characters`),
})

export const DonorsParams = z.object({
  q: z.string().optional(),
  limit: intParam(DEFAULT_PAGE_SIZE).pipe(z.number().transform(n => Math.max(1, Math.min(n, MAX_DONORS_LIMIT)))),
  offset: intParam(0),
})

export const RepresentativesParams = z.object({
  address: z.string().min(1, 'Address is required'),
})

export function parseSearchParams<T>(
  schema: z.ZodSchema<T>,
  searchParams: URLSearchParams
): { success: true; data: T } | { success: false; error: string } {
  const raw = Object.fromEntries(searchParams)
  const result = schema.safeParse(raw)
  if (!result.success) {
    return { success: false, error: result.error.issues[0]?.message ?? 'Invalid parameters' }
  }
  return { success: true, data: result.data }
}
