const CONGRESS_BASE = 'https://api.congress.gov/v3'

export interface HouseVoteMember {
  bioguide_id: string
  name: string
  party: string
  state: string
  position: string  // "Yea" | "Nay" | "Not Voting" | "Present"
}

export interface HouseVoteSummary {
  question: string
  result: string
  yea_total: number
  nay_total: number
  present_total: number
  not_voting_total: number
  yea_democrat: number
  nay_democrat: number
  yea_republican: number
  nay_republican: number
  yea_independent: number
  nay_independent: number
  members: HouseVoteMember[]
}

// Maps raw Congress.gov votePosition values to normalised labels
function normalisePosition(raw: string): string {
  const r = raw.toLowerCase()
  if (r === 'yea' || r === 'aye') return 'Yea'
  if (r === 'nay' || r === 'no')  return 'Nay'
  if (r === 'present')            return 'Present'
  return 'Not Voting'
}

export async function fetchHouseVote(
  congress: number,
  rollNumber: number,
  apiKey: string
): Promise<HouseVoteSummary | null> {
  const url =
    `${CONGRESS_BASE}/house-vote/${congress}/${rollNumber}?format=json&api_key=${apiKey}`

  const res = await fetch(url)
  if (!res.ok) return null
  const data = await res.json()

  const vote = data.houseVote ?? data.vote
  if (!vote) return null

  // Fetch member-level positions (separate endpoint or nested in response)
  const membersUrl =
    `${CONGRESS_BASE}/house-vote/${congress}/${rollNumber}/members?format=json&limit=500&api_key=${apiKey}`

  const membersRes = await fetch(membersUrl)
  if (!membersRes.ok) return null
  const membersData = await membersRes.json()

  const rawMembers: any[] = membersData.members ?? membersData.houseVoteMembers ?? []

  const members: HouseVoteMember[] = rawMembers
    .filter((m: any) => m.bioguideId)
    .map((m: any) => ({
      bioguide_id: m.bioguideId,
      name: m.name ?? m.fullName ?? '',
      party: m.party ?? '',
      state: m.state ?? '',
      position: normalisePosition(m.votePosition ?? m.position ?? ''),
    }))

  // Compute aggregates from member data (more reliable than header totals for party breakdown)
  let yea_total = 0, nay_total = 0, present_total = 0, not_voting_total = 0
  let yea_democrat = 0, nay_democrat = 0
  let yea_republican = 0, nay_republican = 0
  let yea_independent = 0, nay_independent = 0

  for (const m of members) {
    const party = m.party.toLowerCase()
    const isDem = party.includes('d') || party.includes('democrat')
    const isRep = party.includes('r') || party.includes('republican')

    switch (m.position) {
      case 'Yea':
        yea_total++
        if (isDem) yea_democrat++
        else if (isRep) yea_republican++
        else yea_independent++
        break
      case 'Nay':
        nay_total++
        if (isDem) nay_democrat++
        else if (isRep) nay_republican++
        else nay_independent++
        break
      case 'Present':
        present_total++
        break
      default:
        not_voting_total++
    }
  }

  return {
    question: vote.question ?? vote.voteQuestion ?? '',
    result: vote.result ?? vote.voteResult ?? '',
    yea_total,
    nay_total,
    present_total,
    not_voting_total,
    yea_democrat,
    nay_democrat,
    yea_republican,
    nay_republican,
    yea_independent,
    nay_independent,
    members,
  }
}
