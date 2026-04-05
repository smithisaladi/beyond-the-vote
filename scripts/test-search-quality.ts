/**
 * Search quality validation for hybrid_bill_search.
 *
 * Tests representative queries across all expected input categories and prints
 * the top-3 results for each with their RRF scores.  Run after a full bill sync.
 *
 * Run: npx tsx scripts/test-search-quality.ts
 *
 * Optional: TEST_LIMIT=5 to show more results per query.
 */

import { createServiceClient } from '@/lib/supabase/service'

const LIMIT = parseInt(process.env.TEST_LIMIT ?? '3', 10)

interface SearchResult {
  bill_id: string
  bill_number: string
  title: string
  rrf_score: number
}

interface LookupResult {
  bill_id: string
  bill_number: string
  title: string
}

const TEST_QUERIES: Array<{ label: string; query: string; expectSignal: 'fts' | 'trgm' | 'lookup' }> = [
  // ── Bill number / ID lookups ─────────────────────────────────────────────────
  { label: 'Bill ID format',           query: '119-s-1247',    expectSignal: 'lookup' },
  { label: 'Senate formatted number',  query: 'S. 1247',       expectSignal: 'lookup' },
  { label: 'House formatted number',   query: 'HR 3076',       expectSignal: 'lookup' },
  { label: 'HR with period',           query: 'H.R. 3076',     expectSignal: 'lookup' },

  // ── Single keyword ───────────────────────────────────────────────────────────
  { label: 'immigration',              query: 'immigration',   expectSignal: 'fts'    },
  { label: 'healthcare',               query: 'healthcare',    expectSignal: 'fts'    },
  { label: 'guns',                     query: 'guns',          expectSignal: 'fts'    },
  { label: 'education',                query: 'education',     expectSignal: 'fts'    },
  { label: 'climate',                  query: 'climate',       expectSignal: 'fts'    },

  // ── Multi-word / phrase ──────────────────────────────────────────────────────
  { label: 'clean energy tax credit',  query: 'clean energy tax credit',          expectSignal: 'fts' },
  { label: 'student loan forgiveness', query: 'student loan forgiveness',         expectSignal: 'fts' },
  { label: 'border security',          query: 'border security',                  expectSignal: 'fts' },
  { label: 'affordable housing',       query: 'affordable housing',               expectSignal: 'fts' },
  { label: 'prescription drug prices', query: 'prescription drug prices',         expectSignal: 'fts' },

  // ── Natural language ─────────────────────────────────────────────────────────
  { label: 'kids online safety',       query: 'bills about protecting kids online',        expectSignal: 'fts' },
  { label: 'veterans healthcare',      query: 'healthcare for veterans',                   expectSignal: 'fts' },
  { label: 'data privacy',             query: 'data privacy protections',                  expectSignal: 'fts' },
  { label: 'immigration reform',       query: 'comprehensive immigration reform',          expectSignal: 'fts' },
  { label: 'climate change',           query: 'bills about climate change',               expectSignal: 'fts' },

  // ── Typos / fuzzy (trigram signal expected) ──────────────────────────────────
  { label: 'typo: helthcare',          query: 'helthcare',     expectSignal: 'trgm'   },
  { label: 'typo: imigration',         query: 'imigration',    expectSignal: 'trgm'   },
  { label: 'typo: educaton',           query: 'educaton',      expectSignal: 'trgm'   },
  { label: 'partial: infrastructur',   query: 'infrastructur', expectSignal: 'trgm'   },

  // ── Sponsor name ─────────────────────────────────────────────────────────────
  { label: 'sponsor by last name',     query: 'Sanders',       expectSignal: 'fts'    },
  { label: 'sponsor by first+last',    query: 'Bernie Sanders', expectSignal: 'fts'   },
]

// Bill number pattern — same regexes as /api/bills/search/route.ts
const BILL_ID_RE     = /^\d{3}-[a-z]+-\d+$/i
const BILL_NUMBER_RE = /^[hs]\.?\s*(?:r(?:es)?|j\.?res|con\.?res)?\.?\s*\d+$/i

function isLookup(query: string): boolean {
  return BILL_ID_RE.test(query) || BILL_NUMBER_RE.test(query.replace(/\s+/g, ''))
}

async function runQuery(supabase: ReturnType<typeof createServiceClient>, query: string): Promise<SearchResult[] | LookupResult[]> {
  if (isLookup(query)) {
    const { data } = await supabase.rpc('lookup_bill', { query_text: query })
    return (data ?? []).slice(0, LIMIT).map((r: any) => ({
      bill_id: r.bill_id, bill_number: r.bill_number, title: r.title,
    }))
  }

  const { data, error } = await supabase.rpc('hybrid_bill_search', {
    query_text:      query,
    result_limit:    LIMIT,
    offset_count:    0,
    status_filter:   null,
    topic_filter:    null,
    policy_areas:    null,
    congress_filter: null,
  })
  if (error) throw new Error(`RPC error: ${error.message}`)
  return (data ?? []) as SearchResult[]
}

async function main() {
  const supabase = createServiceClient()
  let passed = 0
  let noResults = 0

  console.log(`\n${'─'.repeat(70)}`)
  console.log(`  HYBRID SEARCH QUALITY TEST  (top ${LIMIT} results per query)`)
  console.log(`${'─'.repeat(70)}\n`)

  for (const { label, query, expectSignal } of TEST_QUERIES) {
    let results: any[]
    try {
      results = await runQuery(supabase, query)
    } catch (err) {
      console.error(`  ✗ [${label}] ERROR: ${err}`)
      continue
    }

    const hasResults = results.length > 0
    if (hasResults) passed++; else noResults++

    const statusIcon = hasResults ? '✓' : '○'
    const signalTag  = `[${expectSignal}]`
    console.log(`${statusIcon} ${signalTag.padEnd(9)} "${query}"  (${label})`)

    if (hasResults) {
      for (const r of results) {
        const score = 'rrf_score' in r ? `  score=${r.rrf_score.toFixed(5)}` : '  (exact match)'
        console.log(`     • ${r.bill_number ?? r.bill_id}  ${r.title?.slice(0, 70)}${score}`)
      }
    } else {
      console.log(`     (no results)`)
    }
    console.log()
  }

  console.log(`${'─'.repeat(70)}`)
  console.log(`  ${passed}/${TEST_QUERIES.length} queries returned results   ${noResults} returned nothing`)
  console.log(`${'─'.repeat(70)}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
