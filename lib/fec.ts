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
    term: 'Itemized donations',
    body: 'Donations over $200 that must be reported by name \u2014 smaller gifts only appear as a lump sum.',
  },
  smallDonors: {
    term: 'Small donors',
    body: 'Donors who gave under $200 total \u2014 names aren\u2019t required to be reported.',
  },
  largeIndividual: {
    term: 'Large individual donors',
    body: 'Donors who gave over $200 \u2014 the threshold where campaigns must report names.',
  },
  pacAndCorporate: {
    term: 'PAC & corporate',
    body: 'Money from PACs tied to corporations, trade groups, unions, and ideological organizations.',
  },
  otherFunding: {
    term: 'Other funding',
    body: 'Party transfers, self-funded loans, and other miscellaneous sources.',
  },
  topContributors: {
    term: 'Top contributors',
    body: 'An organization\u2019s PAC donations plus personal donations from its employees, grouped under one name.',
  },
  inOutState: {
    term: 'In-state vs. out-of-state',
    body: 'Where a candidate\u2019s individual donors live.',
  },
  connectedOrg: {
    term: 'Connected organization',
    body: 'The company, union, or trade group that sponsors this PAC.',
  },
}

