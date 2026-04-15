import { z } from 'zod'

const intParam = (def: number) => z.coerce.number().int().nonnegative().default(def)

export const BillsParams = z.object({
  q: z.string().trim().optional(),
  status: z.string().optional(),
  topics: z.string().optional(),
  date: z.enum(['month', 'year']).optional(),
  sort: z.enum(['newest', 'oldest']).default('newest'),
  limit: intParam(20).pipe(z.number().transform(n => Math.min(n, 250))),
  offset: intParam(0),
  billIds: z.string().optional(),
})

export const BillSearchParams = z.object({
  q: z.string().min(3, 'Query must be at least 3 characters'),
  limit: intParam(20).pipe(z.number().transform(n => Math.max(1, Math.min(n, 50)))),
  congress: z.coerce.number().int().optional(),
})

export const BillsByTopicParams = z.object({
  slug: z.string({ error: 'Topic slug is required' }).min(1, 'Topic slug is required'),
  limit: intParam(20).pipe(z.number().transform(n => Math.min(n, 100))),
  status: z.string().optional(),
})

export const PoliticianSearchParams = z.object({
  q: z.string().min(3, 'Query must be at least 3 characters'),
})

export const DonorsParams = z.object({
  q: z.string().optional(),
  limit: intParam(20).pipe(z.number().transform(n => Math.min(n, 100))),
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
