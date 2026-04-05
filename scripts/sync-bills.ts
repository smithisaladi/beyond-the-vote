/**
 * Fetches bills from Congress.gov and upserts them into bill_embeddings so
 * that smart search has a broad corpus to query against.  No OpenAI needed —
 * the search_vector column is GENERATED from title + summary automatically.
 *
 * Run manually: npx tsx scripts/sync-bills.ts
 * Or triggered via: POST /api/cron/sync-bills
 *
 * Options (env vars):
 *   SYNC_BILLS_CONGRESS   - congress number to sync (default: 119)
 *   SYNC_BILLS_MAX        - max bills to fetch (default: 2000)
 */

import { createServiceClient } from '@/lib/supabase/service'
import { mapStatus, formatBillId } from '@/lib/bills'
import { classifyBillTopics } from '@/lib/topics'
import { fetchBillTextXml, extractTextFromBillXml } from './lib/fetch-bill-text'
import { extractAgencies } from './lib/federal-agencies'
import { extractCitations } from './lib/parse-citations'

const CONGRESS_API_KEY = process.env.CONGRESS_API_KEY ?? ''
const CONGRESS_BASE = 'https://api.congress.gov/v3'
const PAGE_SIZE = 250
const TARGET_CONGRESS = parseInt(process.env.SYNC_BILLS_CONGRESS ?? '119', 10)
const MAX_BILLS = parseInt(process.env.SYNC_BILLS_MAX ?? '2000', 10)
const UPSERT_BATCH = 50

export interface SyncBillsResult {
  source: 'bills'
  fetched: number
  upserted: number
  duration: string
}

function buildBillId(congress: number, type: string, number: number): string {
  return `${congress}-${type.toLowerCase()}-${number}`
}

function buildCongressGovUrl(congress: number, type: string, number: number): string {
  const typeMap: Record<string, string> = {
    hr: 'house-bill', s: 'senate-bill',
    hjres: 'house-joint-resolution', sjres: 'senate-joint-resolution',
    hconres: 'house-concurrent-resolution', sconres: 'senate-concurrent-resolution',
    hres: 'house-resolution', sres: 'senate-resolution',
  }
  const slug = typeMap[type.toLowerCase()] ?? type.toLowerCase()
  return `https://www.congress.gov/bill/${congress}th-congress/${slug}/${number}`
}

async function fetchPage(congress: number, offset: number): Promise<any[]> {
  const url =
    `${CONGRESS_BASE}/bill/${congress}?format=json` +
    `&limit=${PAGE_SIZE}&offset=${offset}&sort=updateDate+desc` +
    `&api_key=${CONGRESS_API_KEY}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Congress.gov /bill/${congress}: ${res.status}`)
  const data = await res.json()
  return data.bills ?? []
}

async function fetchSummary(congress: number, type: string, number: number): Promise<string | null> {
  try {
    const url =
      `${CONGRESS_BASE}/bill/${congress}/${type.toLowerCase()}/${number}/summaries` +
      `?format=json&limit=1&api_key=${CONGRESS_API_KEY}`
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const text: string | undefined = data.summaries?.[0]?.text
    if (!text) return null
    // Strip HTML tags that sometimes appear in CRS summaries
    return text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000) || null
  } catch {
    return null
  }
}

export async function syncBills(
  congress: number = TARGET_CONGRESS,
  maxBills: number = MAX_BILLS,
): Promise<SyncBillsResult> {
  if (!CONGRESS_API_KEY) throw new Error('CONGRESS_API_KEY not set')

  const start = Date.now()
  const supabase = createServiceClient()

  const allBills: any[] = []
  let offset = 0

  console.log(`Fetching up to ${maxBills} bills from the ${congress}th Congress…`)

  while (allBills.length < maxBills) {
    const page = await fetchPage(congress, offset)
    if (page.length === 0) break
    allBills.push(...page)
    console.log(`  fetched ${allBills.length} bills so far`)
    if (page.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  const bills = allBills.slice(0, maxBills)
  console.log(`Fetched ${bills.length} bills total. Upserting into bill_embeddings…`)

  let upserted = 0

  for (let i = 0; i < bills.length; i += UPSERT_BATCH) {
    const batch = bills.slice(i, i + UPSERT_BATCH)

    const rows = await Promise.all(
      batch
        .filter((b: any) => b.congress && b.type && b.number && b.title)
        .map(async (b: any) => {
          const [summary, billXml] = await Promise.all([
            fetchSummary(b.congress, b.type, b.number),
            fetchBillTextXml(b.congress, b.type, b.number),
          ])

          const title = (b.title as string).slice(0, 1000)
          const combined = summary ? `${title}. ${summary}` : title
          const bill_id = buildBillId(b.congress, b.type, b.number)

          let referenced_agencies: string[] = []
          let referenced_laws: string[] = []
          let referenced_usc: string[] = []

          if (billXml) {
            const fullText = extractTextFromBillXml(billXml)
            referenced_agencies = extractAgencies(fullText)
            const citations = extractCitations(fullText)
            referenced_laws = [...citations.actNames, ...citations.publicLaws]
            referenced_usc = citations.uscSections
          }

          return {
            bill_id,
            congress:      b.congress as number,
            title,
            summary,
            combined_text: combined,
            bill_number:   formatBillId(bill_id),
            status:        mapStatus(b.latestAction?.text, b.introducedDate),
            topics:              classifyBillTopics(b.policyArea?.name, title, summary, referenced_agencies),
            sponsor_name:        b.sponsors?.[0]?.fullName ?? null,
            sponsor_bioguide_id: b.sponsors?.[0]?.bioguideId ?? null,
            sponsor_party:       null, // not available in list endpoint
            introduced_date:     b.introducedDate ?? null,
            policy_area:         b.policyArea?.name ?? null,
            congress_gov_url:    buildCongressGovUrl(b.congress, b.type, b.number),
            last_action_text:    b.latestAction?.text ?? null,
            last_action_date:    b.latestAction?.actionDate ?? null,
            referenced_agencies,
            referenced_laws,
            referenced_usc,
            synced_at:           new Date().toISOString(),
          }
        })
    )

    const { error } = await supabase
      .from('bill_embeddings')
      .upsert(rows, { onConflict: 'bill_id' })

    if (error) {
      console.error(`Batch ${Math.floor(i / UPSERT_BATCH) + 1} upsert error:`, error.message)
    } else {
      upserted += rows.length
      console.log(`  upserted ${upserted}/${bills.length}`)
    }
  }

  const duration = `${((Date.now() - start) / 1000).toFixed(1)}s`
  return { source: 'bills', fetched: bills.length, upserted, duration }
}

if (require.main === module || process.argv[1]?.endsWith('sync-bills.ts')) {
  syncBills()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error(err); process.exit(1) })
}
