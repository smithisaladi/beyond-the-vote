export interface SenateVoteMember {
  lis_member_id: string
  vote_cast: string
  party: string
  state: string
}

export interface SenateVoteSummary {
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
  members: SenateVoteMember[]
}

function extractTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)<\/${tag}>`, 'i'))
  return match?.[1]?.trim() ?? ''
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const results: string[] = []
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) {
    results.push(m[1])
  }
  return results
}

export function parseSenateVoteXml(xml: string): SenateVoteSummary {
  const question = extractTag(xml, 'vote_question_text') || extractTag(xml, 'question')
  const result = extractTag(xml, 'vote_result')
  const yea_total = parseInt(extractTag(xml, 'yeas')) || 0
  const nay_total = parseInt(extractTag(xml, 'nays')) || 0
  const present_total = parseInt(extractTag(xml, 'present')) || 0
  const not_voting_total = parseInt(extractTag(xml, 'absent')) || 0

  let yea_democrat = 0, nay_democrat = 0
  let yea_republican = 0, nay_republican = 0
  let yea_independent = 0, nay_independent = 0

  for (const block of extractAllBlocks(xml, 'party_totals')) {
    const party = extractTag(block, 'party_name').toLowerCase()
    const yeas = parseInt(extractTag(block, 'yeas')) || 0
    const nays = parseInt(extractTag(block, 'nays')) || 0
    if (party.includes('democrat')) {
      yea_democrat = yeas; nay_democrat = nays
    } else if (party.includes('republican')) {
      yea_republican = yeas; nay_republican = nays
    } else {
      yea_independent += yeas; nay_independent += nays
    }
  }

  const members: SenateVoteMember[] = extractAllBlocks(xml, 'member')
    .map(block => ({
      lis_member_id: extractTag(block, 'lis_member_id'),
      vote_cast: extractTag(block, 'vote_cast'),
      party: extractTag(block, 'party'),
      state: extractTag(block, 'state'),
    }))
    .filter(m => m.lis_member_id && m.vote_cast)

  return {
    question,
    result,
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
