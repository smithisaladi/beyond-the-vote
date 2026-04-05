/**
 * Syncs legislators + committees from unitedstates/congress-legislators.
 * Run manually: npx tsx scripts/sync-legislators.ts
 * Or triggered via: POST /api/cron/sync-legislators
 */

import { createServiceClient } from '@/lib/supabase/service'

const LEGISLATORS_URL =
  'https://unitedstates.github.io/congress-legislators/legislators-current.json'
const COMMITTEES_URL =
  'https://unitedstates.github.io/congress-legislators/committees-current.json'
const COMMITTEE_MEMBERSHIP_URL =
  'https://unitedstates.github.io/congress-legislators/committee-membership-current.json'

export interface SyncLegislatorsResult {
  source: 'legislators'
  upserted: number
  scoresSkipped: number
  committeesUpserted: number
  membershipsUpserted: number
  duration: string
}

export async function syncLegislators(): Promise<SyncLegislatorsResult> {
  const start = Date.now()
  const supabase = createServiceClient()

  // ── Legislators ──────────────────────────────────────────────────────────────
  const legRes = await fetch(LEGISLATORS_URL, { cache: 'no-store' })
  if (!legRes.ok) throw new Error(`Failed to fetch legislators: ${legRes.status}`)
  const legislators: any[] = await legRes.json()

  const rows = legislators.map((leg: any) => {
    const ids = leg.id ?? {}
    const term = (leg.terms ?? []).at(-1) ?? {}
    const bio = leg.bio ?? {}
    const contact = leg.contact ?? {}
    const social = leg.social ?? {}
    const name = leg.name ?? {}

    const normaliseParty = (p: string): string => {
      if (!p) return 'Independent'
      const lp = p.toLowerCase()
      if (lp.includes('democrat')) return 'Democrat'
      if (lp.includes('republican')) return 'Republican'
      return 'Independent'
    }

    return {
      bioguide_id:  ids.bioguide,
      lis_id:       ids.lis ?? null,
      icpsr_id:     ids.icpsr ?? null,
      fec_ids:      ids.fec ? (Array.isArray(ids.fec) ? ids.fec : [ids.fec]) : null,
      govtrack_id:  ids.govtrack?.toString() ?? null,
      thomas_id:    ids.thomas ?? null,

      first_name:   name.first ?? '',
      last_name:    name.last ?? '',
      full_name:    name.official_full ?? `${name.first ?? ''} ${name.last ?? ''}`.trim(),
      party:        normaliseParty(term.party ?? ''),
      chamber:      term.type === 'sen' ? 'senate' : 'house',
      state:        term.state ?? '',
      state_full:   term.state_full ?? term.state ?? '',
      district:     term.district ?? null,
      title:        term.type === 'sen' ? 'Senator' : 'Representative',
      in_office:    true,

      birthday:     bio.birthday ?? null,
      gender:       bio.gender ?? null,
      website:      contact.url ?? null,
      phone:        contact.phone ?? null,
      address:      contact.address ?? null,
      photo_url:    `https://theunitedstates.io/images/congress/450x550/${ids.bioguide}.jpg`,

      term_start:   term.start ?? null,
      term_end:     term.end ?? null,
      senate_class: term.class ?? null,
      next_election: term.state_rank ? null : term.end ? new Date(term.end).getFullYear() : null,

      twitter:      social.twitter ?? null,
      facebook:     social.facebook ?? null,
      youtube:      social.youtube ?? null,

      raw_json:     leg,
      synced_at:    new Date().toISOString(),
    }
  }).filter(r => r.bioguide_id)

  const { error: legErr } = await supabase
    .from('legislators')
    .upsert(rows, { onConflict: 'bioguide_id' })
  if (legErr) throw new Error(`Legislators upsert: ${legErr.message}`)

  // ── Committees ───────────────────────────────────────────────────────────────
  const commRes = await fetch(COMMITTEES_URL, { cache: 'no-store' })
  const committeesRaw: any[] = commRes.ok ? await commRes.json() : []

  const committeeRows: any[] = []
  const subcommitteeRows: any[] = []

  for (const c of committeesRaw) {
    if (!c.thomas_id) continue
    committeeRows.push({
      thomas_id: c.thomas_id,
      name: c.name,
      chamber: c.type === 'senate' ? 'senate' : 'house',
      url: c.url ?? null,
      parent_id: null,
    })
    for (const sub of c.subcommittees ?? []) {
      if (!sub.thomas_id) continue
      subcommitteeRows.push({
        thomas_id: `${c.thomas_id}${sub.thomas_id}`,
        name: sub.name,
        chamber: c.type === 'senate' ? 'senate' : 'house',
        url: null,
        parent_id: c.thomas_id,
      })
    }
  }

  const allCommittees = [...committeeRows, ...subcommitteeRows]
  if (allCommittees.length > 0) {
    // Upsert parent committees first, then subcommittees
    const { error: cErr } = await supabase
      .from('committees')
      .upsert(committeeRows, { onConflict: 'thomas_id' })
    if (cErr) throw new Error(`Committees upsert: ${cErr.message}`)

    if (subcommitteeRows.length > 0) {
      const { error: scErr } = await supabase
        .from('committees')
        .upsert(subcommitteeRows, { onConflict: 'thomas_id' })
      if (scErr) throw new Error(`Subcommittees upsert: ${scErr.message}`)
    }
  }

  // ── Committee Memberships ────────────────────────────────────────────────────
  const memRes = await fetch(COMMITTEE_MEMBERSHIP_URL, { cache: 'no-store' })
  const membershipsRaw: any = memRes.ok ? await memRes.json() : {}

  const membershipRows: any[] = []
  for (const [committeeId, members] of Object.entries(membershipsRaw)) {
    for (const m of members as any[]) {
      if (!m.bioguide) continue
      membershipRows.push({
        bioguide_id:  m.bioguide,
        committee_id: committeeId,
        title:        m.title ?? null,
      })
    }
  }

  // Only insert memberships for legislators + committees that exist
  const { data: existingLeg } = await supabase
    .from('legislators')
    .select('bioguide_id')
  const { data: existingComm } = await supabase
    .from('committees')
    .select('thomas_id')

  const legSet  = new Set((existingLeg ?? []).map((r: any) => r.bioguide_id))
  const commSet = new Set((existingComm ?? []).map((r: any) => r.thomas_id))

  const validMemberships = membershipRows.filter(
    r => legSet.has(r.bioguide_id) && commSet.has(r.committee_id)
  )

  if (validMemberships.length > 0) {
    // Delete existing memberships first to avoid stale data
    await supabase.from('committee_memberships').delete().neq('bioguide_id', '')
    const { error: mErr } = await supabase
      .from('committee_memberships')
      .insert(validMemberships)
    if (mErr) throw new Error(`Memberships insert: ${mErr.message}`)
  }

  const duration = `${((Date.now() - start) / 1000).toFixed(1)}s`
  return {
    source: 'legislators',
    upserted: rows.length,
    scoresSkipped: 0,
    committeesUpserted: allCommittees.length,
    membershipsUpserted: validMemberships.length,
    duration,
  }
}

// Allow direct execution
if (require.main === module || process.argv[1]?.endsWith('sync-legislators.ts')) {
  syncLegislators()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error(err); process.exit(1) })
}
