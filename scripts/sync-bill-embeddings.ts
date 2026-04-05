/**
 * Embeds bills that don't yet have a vector in bill_embeddings.
 * Uses OpenAI text-embedding-3-small (1536 dims).
 *
 * Run manually: npx tsx scripts/sync-bill-embeddings.ts
 * Or triggered via: POST /api/cron/sync-bill-embeddings
 */

import { createServiceClient } from '@/lib/supabase/service'
import { getEmbeddings } from '@/lib/embeddings'

const BATCH_SIZE = 50
const BATCH_DELAY_MS = 200

export interface SyncBillEmbeddingsResult {
  source: 'bill-embeddings'
  embedded: number
  total_candidates: number
  duration: string
}

interface UnembeddedBill {
  bill_id: string
  congress: number
  title: string | null
  summary: string | null
}

function buildCombinedText(bill: UnembeddedBill): string {
  const parts = [bill.title ?? bill.bill_id]
  if (bill.summary) parts.push(bill.summary)
  return parts.join('. ')
}

export async function syncBillEmbeddings(): Promise<SyncBillEmbeddingsResult> {
  const start = Date.now()
  const supabase = createServiceClient()
  let embedded = 0

  // Fetch bills that don't yet have an embedding
  const { data: candidates, error: fetchErr } = await supabase.rpc('get_unembedded_bills')
  if (fetchErr) throw new Error(`get_unembedded_bills failed: ${fetchErr.message}`)

  const bills: UnembeddedBill[] = candidates ?? []
  const total_candidates = bills.length

  console.log(`Found ${total_candidates} bills to embed`)

  // Process in batches
  for (let i = 0; i < bills.length; i += BATCH_SIZE) {
    const batch = bills.slice(i, i + BATCH_SIZE)
    const texts = batch.map(buildCombinedText)

    let embeddings: number[][]
    try {
      embeddings = await getEmbeddings(texts)
    } catch (err) {
      console.error(`Batch ${i / BATCH_SIZE + 1} embedding failed:`, err)
      continue
    }

    const rows = batch.map((bill, j) => ({
      bill_id:       bill.bill_id,
      congress:      bill.congress,
      title:         bill.title ?? bill.bill_id,
      summary:       bill.summary ?? null,
      combined_text: texts[j],
      embedding:     JSON.stringify(embeddings[j]),
      embedded_at:   new Date().toISOString(),
      synced_at:     new Date().toISOString(),
    }))

    const { error: upsertErr } = await supabase
      .from('bill_embeddings')
      .upsert(rows, { onConflict: 'bill_id' })

    if (upsertErr) {
      console.error(`Batch ${i / BATCH_SIZE + 1} upsert failed:`, upsertErr.message)
      continue
    }

    embedded += batch.length
    console.log(`Embedded ${embedded}/${total_candidates}`)

    if (i + BATCH_SIZE < bills.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  const duration = `${((Date.now() - start) / 1000).toFixed(1)}s`
  return { source: 'bill-embeddings', embedded, total_candidates, duration }
}

if (require.main === module || process.argv[1]?.endsWith('sync-bill-embeddings.ts')) {
  syncBillEmbeddings()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error(err); process.exit(1) })
}
