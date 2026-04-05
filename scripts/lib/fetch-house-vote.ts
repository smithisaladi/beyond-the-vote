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

// Maps raw Congress.gov voteCast values to normalised labels
function normalisePosition(raw: string): string {
  const r = raw.toLowerCase()
  if (r === 'yea' || r === 'aye') return 'Yea'
  if (r === 'nay' || r === 'no')  return 'Nay'
  if (r === 'present')            return 'Present'
  return 'Not Voting'
}

// API structure: /house-vote/{congress}/{session}/{rollNumber}
// Members:       /house-vote/{congress}/{session}/{rollNumber}/members
// Response keys: houseRollCallVote (detail), houseRollCallVoteMemberVotes.results (members)
// Member fields: bioguideID, voteCast, voteParty, voteState, firstName, lastName

export async function fetchHouseVote(
  congress: number,
  rollNumber: number,
  apiKey: string,
  session: number = 1
): Promise<HouseVoteSummary | null> {
  const base = `${CONGRESS_BASE}/house-vote/${congress}/${session}/${rollNumber}`

  const res = await fetch(`${base}?format=json&api_key=${apiKey}`)
  if (!res.ok) return null
  const data = await res.json()

  const vote = data.houseRollCallVote
  if (!vote) return null

  const membersRes = await fetch(`${base}/members?format=json&limit=500&api_key=${apiKey}`)
  if (!membersRes.ok) return null
  const membersData = await membersRes.json()

  // Congress.gov returns houseRollCallVoteMemberVotes as an object with a `results` array
  const rawMembers: any[] = membersData.houseRollCallVoteMemberVotes?.results ?? []

  const members: HouseVoteMember[] = rawMembers
    .filter((m: any) => m.bioguideID)
    .map((m: any) => ({
      bioguide_id: m.bioguideID,
      name: `${m.firstName ?? ''} ${m.lastName ?? ''}`.trim(),
      party: m.voteParty ?? '',
      state: m.voteState ?? '',
      position: normalisePosition(m.voteCast ?? ''),
    }))

  // Compute aggregates from member data
  let yea_total = 0, nay_total = 0, present_total = 0, not_voting_total = 0
  let yea_democrat = 0, nay_democrat = 0
  let yea_republican = 0, nay_republican = 0
  let yea_independent = 0, nay_independent = 0

  for (const m of members) {
    const party = m.party.toUpperCase()
    const isDem = party === 'D'
    const isRep = party === 'R'

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
    question: vote.voteQuestion ?? vote.question ?? '',
    result: vote.result ?? '',
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
