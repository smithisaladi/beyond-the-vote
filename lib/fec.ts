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
    term: 'PAC (Political Action Committee)',
    body: 'An organized group that pools money from members, employees, or donors to support or oppose political candidates. Examples include corporate PACs, union PACs, and ideological groups.',
  },
  fec: {
    term: 'FEC (Federal Election Commission)',
    body: 'The U.S. agency that collects and publishes campaign-finance filings. All numbers on this page come from FEC bulk data.',
  },
  cycle: {
    term: 'Election cycle',
    body: 'The two-year federal election period. Congressional fundraising is reported cycle by cycle; totals here cover the cycles shown.',
  },
  fecCycle: {
    term: 'FEC · 2023\u20132026',
    body: 'Numbers come from Federal Election Commission bulk filings covering the 2023\u20132024 and 2025\u20132026 congressional cycles \u2014 the last four years of campaign-finance activity.',
  },
  direct: {
    term: 'Direct contribution',
    body: 'Money donated straight to the candidate\u2019s own campaign fund. FEC limits apply \u2014 currently $5,000 per election per PAC.',
  },
  ie: {
    term: 'Independent Expenditure (IE)',
    body: 'Money a PAC spends on ads, mail, or media supporting or opposing a candidate, without coordinating with the candidate\u2019s campaign. Not subject to contribution caps \u2014 which is why IE totals can dwarf direct contributions.',
  },
  ieFor: {
    term: 'IE Support',
    body: 'Independent expenditures spent to promote a candidate \u2014 ads, mailers, canvassing \u2014 without coordinating with their campaign. Not capped by FEC limits.',
  },
  ieAgainst: {
    term: 'IE Against',
    body: 'Independent expenditures spent to attack or oppose a candidate. Paid for by the PAC, not coordinated with any rival campaign, and not capped.',
  },
  itemized: {
    term: 'Itemized contributions',
    body: 'Individual donations over $200 that campaigns must report by donor name, address, and employer. Smaller gifts are reported only in aggregate \u2014 so donor-by-donor analysis only covers the $200+ bucket.',
  },
  smallDonors: {
    term: 'Small donors (under $200)',
    body: 'Individuals who gave less than $200 in total. FEC rules don\u2019t require campaigns to report them by name, so we only see the lump-sum total.',
  },
  largeIndividual: {
    term: 'Large individual donors',
    body: 'People who gave more than $200 \u2014 the threshold at which the FEC requires campaigns to name them. A higher share here usually signals a campaign drawing from wealthier, more engaged donors.',
  },
  pacAndCorporate: {
    term: 'PAC & Corporate money',
    body: 'Funds from organized political committees: corporate PACs, trade associations, unions, and ideological groups. Note that U.S. law bars corporations from giving directly \u2014 this money flows through their affiliated PACs.',
  },
  otherFunding: {
    term: 'Other funding',
    body: 'Transfers from party committees, self-funded loans, and miscellaneous sources that don\u2019t fit the PAC or individual-donor categories.',
  },
  topContributors: {
    term: 'Top Contributors',
    body: 'Each row combines two things under one organization name: the company\u2019s affiliated PAC AND personal donations from its employees and their families. Corporations themselves cannot legally donate \u2014 this is the OpenSecrets convention for attribution.',
  },
  inOutState: {
    term: 'In-state vs. out-of-state',
    body: 'Where this candidate\u2019s itemized individual donors live. A high out-of-state share often reflects national donor networks or high-profile races.',
  },
  connectedOrg: {
    term: 'Connected organization',
    body: 'The company, union, or trade group the PAC is affiliated with. The PAC raises money from that organization\u2019s members or employees.',
  },
}

