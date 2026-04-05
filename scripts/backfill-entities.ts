/**
 * One-time backfill: iterates all existing bills in bill_embeddings,
 * fetches their XML from govinfo.gov, and populates the entity columns.
 *
 * Run: npx tsx scripts/backfill-entities.ts
 *
 * Resume-safe: skips bills where referenced_agencies is already non-empty.
 * Set FORCE=1 to reprocess all bills regardless.
 */

import { createServiceClient } from '@/lib/supabase/service'
import { fetchBillTextXml, extractTextFromBillXml } from './lib/fetch-bill-text'
import { extractAgencies } from './lib/federal-agencies'
import { extractCitations } from './lib/parse-citations'

const DELAY_MS = 200   // Between govinfo requests — be respectful
const FORCE = process.env.FORCE === '1'

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

async function backfillEntities() {
  const supabase = createServiceClient()

  let query = supabase
    .from('bill_embeddings')
    .select('bill_id, congress')
    .order('introduced_date', { ascending: false })

  if (!FORCE) {
    // Only process bills not yet populated
    query = query.eq('referenced_agencies', '{}')
  }

  const { data: bills, error } = await query

  if (error) {
    console.error('Failed to fetch bills:', error.message)
    process.exit(1)
  }

  const total = bills?.length ?? 0
  console.log(`Backfilling ${total} bills (FORCE=${FORCE})…`)

  let processed = 0
  let updated = 0
  let skipped = 0

  for (const bill of bills ?? []) {
    const parts = bill.bill_id.split('-')
    if (parts.length < 3) { skipped++; continue }

    const congress = parseInt(parts[0], 10)
    const type = parts[1]
    const number = parts.slice(2).join('-') // handles multi-part numbers

    const xml = await fetchBillTextXml(congress, type, number)

    if (xml) {
      const fullText = extractTextFromBillXml(xml)
      const agencies = extractAgencies(fullText)
      const citations = extractCitations(fullText)

      const { error: updateError } = await supabase
        .from('bill_embeddings')
        .update({
          referenced_agencies: agencies,
          referenced_laws: [...citations.actNames, ...citations.publicLaws],
          referenced_usc: citations.uscSections,
        })
        .eq('bill_id', bill.bill_id)

      if (updateError) {
        console.error(`  [${bill.bill_id}] update error:`, updateError.message)
      } else {
        updated++
      }
    } else {
      skipped++
    }

    processed++
    if (processed % 25 === 0 || processed === total) {
      console.log(`  ${processed}/${total} processed — ${updated} updated, ${skipped} skipped`)
    }

    await sleep(DELAY_MS)
  }

  console.log(`\nDone. ${updated} bills updated, ${skipped} skipped (no XML or parse error).`)
}

backfillEntities().catch(err => {
  console.error(err)
  process.exit(1)
})
