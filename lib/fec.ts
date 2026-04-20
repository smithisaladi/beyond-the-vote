export const FEC_DISPLAY_CYCLES = '2023–2026'

export const getFecCommitteeUrl = (cmteId: string) =>
  `https://www.fec.gov/data/committee/${cmteId}/`

export const getOpenSecretsUrl = (cmteId: string) =>
  `https://www.opensecrets.org/pacs/lookup2.php?strID=${cmteId}`

// ---------------------------------------------------------------------------
// Plain-English glossary for FEC terminology used across the donor surfaces.
// Authored once here so wording is consistent everywhere. Rendered via
// <InfoTooltip term="..."> next to the label it explains.
// ---------------------------------------------------------------------------

export type FecTermKey =
  | 'pac'
  | 'fec'
  | 'cycle'
  | 'fecCycle'
  | 'direct'
  | 'ie'
  | 'ieFor'
  | 'ieAgainst'
  | 'itemized'
  | 'smallDonors'
  | 'largeIndividual'
  | 'pacAndCorporate'
  | 'otherFunding'
  | 'topContributors'
  | 'inOutState'
  | 'connectedOrg'

export const FEC_GLOSSARY: Record<FecTermKey, { term: string; body: string }> = {
  pac: {
    term: 'PAC',
    body: 'Political Action Committee \u2014 a group that pools donations to support or oppose candidates.',
  },
  fec: {
    term: 'FEC',
    body: 'Federal Election Commission \u2014 the agency that publishes all campaign-finance data.',
  },
  cycle: {
    term: 'Election cycle',
    body: 'A two-year fundraising period aligned to federal elections.',
  },
  fecCycle: {
    term: 'FEC \u00b7 2023\u20132026',
    body: 'Covers the last four years of FEC campaign-finance filings.',
  },
  direct: {
    term: 'Direct contribution',
    body: 'Money given straight to a candidate\u2019s campaign, capped at $5,000 per PAC per election.',
  },
  ie: {
    term: 'Independent expenditure',
    body: 'PAC spending on ads or outreach for/against a candidate, with no coordination or cap.',
  },
  ieFor: {
    term: 'IE \u2014 Support',
    body: 'Outside spending to promote a candidate, with no coordination or cap.',
  },
  ieAgainst: {
    term: 'IE \u2014 Opposition',
    body: 'Outside spending to oppose a candidate, with no coordination or cap.',
  },
  itemized: {
    term: 'Why only itemized?',
    body: 'Campaigns only have to name donors who give more than $200. Smaller donations are lumped together, so we can\u2019t tell where they came from geographically.',
  },
  smallDonors: {
    term: 'Small donors (under $200)',
    body: 'Everyday supporters giving small amounts. A high percentage here can signal broad grassroots support rather than reliance on wealthy backers.',
  },
  largeIndividual: {
    term: 'Large individual donors',
    body: 'People who gave over $200 \u2014 the point at which campaigns must disclose their names. These donors often have more direct access to the candidate.',
  },
  pacAndCorporate: {
    term: 'PAC & corporate money',
    body: 'Funds from Political Action Committees linked to corporations, unions, or trade groups. A high share may indicate strong ties to organized interest groups.',
  },
  otherFunding: {
    term: 'Other sources',
    body: 'Includes party transfers, the candidate\u2019s own money, and miscellaneous sources that don\u2019t fit the main categories.',
  },
  topContributors: {
    term: 'How this is calculated',
    body: 'We combine an organization\u2019s PAC donations with personal donations from its employees. The totals show who has the biggest financial relationship with this legislator.',
  },
  inOutState: {
    term: 'Why this matters',
    body: 'Legislators funded mostly by out-of-state donors may be responding to national interests rather than the concerns of the people they represent.',
  },
  connectedOrg: {
    term: 'Connected organization',
    body: 'The company, union, or trade group that sponsors this PAC.',
  },
}

