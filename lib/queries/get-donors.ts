// lib/queries/get-donors.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Donor, TopContributor, FundingBreakdown } from '@/lib/types/politicians'

interface TopPacRow {
  rank: number
  cmte_id: string
  cmte_name: string
  connected_org: string | null
  direct_contribution: number | null
  ie_for: number | null
  ie_against: number | null
  total_support: number | null
  cycle: number | null
}

interface TopContributorRow {
  rank: number
  org_name: string
  individual_total: number
  pac_total: number
  grand_total: number
  cycle: number
  cmte_id: string | null
}

interface FundingSummaryRow {
  total_receipts: number | null
  pac_direct_total: number | null
  pac_direct_pct: number | null
  large_donor_total: number | null
  large_donor_pct: number | null
  small_donor_total: number | null
  small_donor_pct: number | null
  pol_pty_total: number | null
  pol_pty_pct: number | null
  self_funded_total: number | null
  self_funded_pct: number | null
  other_total: number | null
  other_pct: number | null
  superpac_ie_for: number | null
  superpac_ie_against: number | null
  in_state_total: number | null
  out_of_state_total: number | null
  dc_donor_total: number | null
  cycle: number
}

export const PAC_SKIP = new Set([
  'ACTBLUE', 'WINRED',
  'DEMOCRATIC SENATORIAL CAMPAIGN COMMITTEE', 'DSCC',
  'DEMOCRATIC CONGRESSIONAL CAMPAIGN COMMITTEE', 'DCCC',
  'NRSC', 'NRCC',
  'NATIONAL REPUBLICAN SENATORIAL COMMITTEE',
  'NATIONAL REPUBLICAN CONGRESSIONAL COMMITTEE',
  'DEMOCRATIC NATIONAL COMMITTEE', 'DNC',
  'REPUBLICAN NATIONAL COMMITTEE', 'RNC',
  'SENATE MAJORITY PAC', 'HOUSE MAJORITY PAC',
  'SENATE LEADERSHIP FUND', 'CONGRESSIONAL LEADERSHIP FUND',
  "EMILY'S LIST", 'END CITIZENS UNITED',
])

export function isDonorDataStale(finishedAt: string | null | undefined): boolean {
  if (!finishedAt) return true
  return Date.now() - new Date(finishedAt).getTime() > 30 * 24 * 60 * 60 * 1000
}

export async function fetchDonors(opts: {
  bioguideId: string
  fecIds: string[] | null
  supabase: SupabaseClient
}): Promise<{ donors: Donor[]; pacDonors: Donor[]; topContributors: TopContributor[]; fecUrl: string | null; fundingBreakdown: FundingBreakdown | null }> {
  const { bioguideId, fecIds, supabase } = opts
  const fecUrl = fecIds && fecIds.length > 0
    ? `https://www.fec.gov/data/candidate/${fecIds[0]}/`
    : null

  const [topPacsRes, fundingSummaryRes, topContributorsRes] = await Promise.allSettled([
    supabase
      .from('legislator_top_pacs')
      .select('rank, cmte_id, cmte_name, connected_org, direct_contribution, ie_for, ie_against, total_support, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .order('rank', { ascending: true })
      .limit(40),

    supabase
      .from('legislator_funding_summary')
      .select('total_receipts, pac_direct_total, pac_direct_pct, large_donor_total, large_donor_pct, small_donor_total, small_donor_pct, pol_pty_total, pol_pty_pct, self_funded_total, self_funded_pct, other_total, other_pct, superpac_ie_for, superpac_ie_against, in_state_total, out_of_state_total, dc_donor_total, cycle')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .limit(2),

    supabase
      .from('legislator_top_contributors')
      .select('rank, org_name, individual_total, pac_total, grand_total, cycle, cmte_id')
      .eq('bioguide_id', bioguideId)
      .order('cycle', { ascending: false })
      .order('rank', { ascending: true })
      .limit(40),
  ])

  // PAC donors — merge across cycles by committee, sum total_support, top 10
  const rawPacRows = topPacsRes.status === 'fulfilled' ? ((topPacsRes.value.data ?? []) as TopPacRow[]) : []
  const pacMerged = new Map<string, { name: string; total: number; category: string }>()
  for (const row of rawPacRows) {
    const name = (row.cmte_name ?? '').toUpperCase().trim()
    if (!name || PAC_SKIP.has(name)) continue
    const key = row.cmte_id ?? name
    const existing = pacMerged.get(key)
    const support = Number(row.total_support ?? 0)
    if (existing) {
      existing.total += support
    } else {
      pacMerged.set(key, {
        name: row.cmte_name ?? row.connected_org ?? row.cmte_id,
        total: support,
        category: 'PAC',
      })
    }
  }
  const pacDonors: Donor[] = [...pacMerged.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d, i) => ({
      rank: i + 1,
      name: d.name,
      amount: `$${Math.round(d.total).toLocaleString()}`,
      category: d.category,
    }))

  // Top contributors — merge across cycles by org name, sum totals, top 10
  const rawContribRows = topContributorsRes.status === 'fulfilled' ? ((topContributorsRes.value.data ?? []) as TopContributorRow[]) : []
  const contribMerged = new Map<string, { orgName: string; total: number; cmteId: string | null }>()
  for (const row of rawContribRows) {
    const orgName = (row.org_name ?? '').trim()
    if (!orgName) continue
    const existing = contribMerged.get(orgName)
    const total = Number(row.grand_total ?? 0)
    const cmteId = row.cmte_id ?? null
    if (existing) {
      existing.total += total
      // Rows arrive in cycle DESC order — keep the most recent non-null cmte_id we saw first.
      if (!existing.cmteId && cmteId) existing.cmteId = cmteId
    } else {
      contribMerged.set(orgName, { orgName, total, cmteId })
    }
  }
  const topContributors: TopContributor[] = [...contribMerged.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((d, i) => ({
      rank: i + 1,
      orgName: d.orgName,
      total: `$${Math.round(d.total).toLocaleString()}`,
      cmteId: d.cmteId,
    }))

  // Funding breakdown — aggregate across available cycles
  let fundingBreakdown: FundingBreakdown | null = null
  const fundingRows = fundingSummaryRes.status === 'fulfilled' ? ((fundingSummaryRes.value.data ?? []) as FundingSummaryRow[]) : []
  if (fundingRows.length > 0) {
    const maxCycle = fundingRows[0].cycle
    const minCycle = fundingRows[fundingRows.length - 1].cycle

    const sum = (field: keyof FundingSummaryRow) => fundingRows.reduce((acc, r) => acc + Number(r[field] ?? 0), 0)
    const total = sum('total_receipts')
    const pct = (val: number) => total > 0 ? (val / total) * 100 : 0

    const pac = sum('pac_direct_total')
    const individualLarge = sum('large_donor_total')
    const individualSmall = sum('small_donor_total')
    const partyContributions = sum('pol_pty_total')
    const selfFunded = sum('self_funded_total')
    const other = sum('other_total')

    // Geographic breakdown of individual donations only (PAC money has no geo).
    // DC is folded into out-of-state per product decision.
    const inStateTotal = sum('in_state_total')
    const outOfStateTotal = sum('out_of_state_total') + sum('dc_donor_total')
    const geoTotal = inStateTotal + outOfStateTotal
    const inStatePct = geoTotal > 0 ? (inStateTotal / geoTotal) * 100 : 0
    const outOfStatePct = geoTotal > 0 ? (outOfStateTotal / geoTotal) * 100 : 0

    fundingBreakdown = {
      pac,
      pacPct: pct(pac),
      individualLarge,
      individualLargePct: pct(individualLarge),
      individualSmall,
      individualSmallPct: pct(individualSmall),
      partyContributions,
      partyContributionsPct: pct(partyContributions),
      selfFunded,
      selfFundedPct: pct(selfFunded),
      other,
      otherPct: pct(other),
      total,
      superPacFor: sum('superpac_ie_for'),
      superPacAgainst: sum('superpac_ie_against'),
      inStateTotal,
      outOfStateTotal,
      inStatePct,
      outOfStatePct,
      cycle: maxCycle,
      minCycle,
    }
  }

  return { donors: [], pacDonors, topContributors, fecUrl, fundingBreakdown }
}
