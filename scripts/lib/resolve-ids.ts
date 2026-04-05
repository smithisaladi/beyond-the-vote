import type { SupabaseClient } from '@supabase/supabase-js'

// Resolves a batch of lis_member_ids to bioguide_ids using the legislators table.
// Returns a map of lis_id → bioguide_id for fast lookup.
export async function buildLisMap(
  supabase: SupabaseClient,
  lisIds: string[]
): Promise<Map<string, string>> {
  if (lisIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('legislators')
    .select('lis_id, bioguide_id')
    .in('lis_id', lisIds)

  if (error) throw new Error(`buildLisMap: ${error.message}`)

  const map = new Map<string, string>()
  for (const row of data ?? []) {
    if (row.lis_id && row.bioguide_id) map.set(row.lis_id, row.bioguide_id)
  }
  return map
}
