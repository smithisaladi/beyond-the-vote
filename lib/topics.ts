export const ALL_TOPICS = [
  'Climate & Environment',
  'Healthcare',
  'Economy & Jobs',
  'Education',
  'Housing',
  'Immigration',
  'Tech & Privacy',
  'Criminal Justice',
  'Voting Rights',
  'Social Security',
  'Gun Policy',
  'Foreign Policy',
  'Agriculture',
  'Defense',
  'Culture',
  'Civil Rights',
  'Energy',
  'Social Policy',
  'Trade',
  'Government',
  'Labor',
  'Law',
  'Indigenous Rights',
  'Technology',
  'Taxes',
  'Transportation',
  'Emergency Management',
  'Environment',
] as const

export type Topic = (typeof ALL_TOPICS)[number]

// Explicit slug ↔ topic mapping to handle pipeline slugs that don't
// round-trip cleanly through the auto-generated slug function.
const SLUG_TO_TOPIC: Record<string, Topic> = {
  'climate-environment': 'Climate & Environment',
  'healthcare':          'Healthcare',
  'economy':             'Economy & Jobs',
  'economy-jobs':        'Economy & Jobs',
  'education':           'Education',
  'housing':             'Housing',
  'immigration':         'Immigration',
  'tech-privacy':        'Tech & Privacy',
  'criminal-justice':    'Criminal Justice',
  'voting-rights':       'Voting Rights',
  'social-security':     'Social Security',
  'gun-policy':          'Gun Policy',
  'foreign-policy':      'Foreign Policy',
  'agriculture':         'Agriculture',
  'defense':             'Defense',
  'culture':             'Culture',
  'civil-rights':        'Civil Rights',
  'energy':              'Energy',
  'social-policy':       'Social Policy',
  'trade':               'Trade',
  'government':          'Government',
  'labor':               'Labor',
  'law':                 'Law',
  'indigenous-rights':   'Indigenous Rights',
  'technology':          'Technology',
  'taxes':               'Taxes',
  'transportation':      'Transportation',
  'emergency-management':'Emergency Management',
  'environment':         'Environment',
}

const TOPIC_TO_SLUG: Record<string, string> = Object.fromEntries(
  Object.entries(SLUG_TO_TOPIC).map(([slug, topic]) => [topic, slug])
)

export function topicToSlug(topic: Topic): string {
  return TOPIC_TO_SLUG[topic] ?? topic
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function slugToTopic(slug: string): Topic | null {
  return SLUG_TO_TOPIC[slug] ?? null
}

// Congress.gov policyArea → topic slug
// Derived from POLICY_AREA_MAP in app/api/bills/route.ts, extended with
// additional policyAreas not covered by the existing category mapping.
const POLICY_AREA_TO_TOPIC_SLUG: Record<string, string> = {
  'Environmental Protection':           'climate-environment',
  'Energy':                             'climate-environment',
  'Public Lands and Natural Resources': 'climate-environment',
  'Water Resources Development':        'climate-environment',
  'Health':                             'healthcare',
  'Economics and Public Finance':       'economy-jobs',
  'Commerce':                           'economy-jobs',
  'Finance and Financial Sector':       'economy-jobs',
  'Labor and Employment':               'economy-jobs',
  'Taxation':                           'economy-jobs',
  'Armed Forces and National Security': 'foreign-policy',
  'International Affairs':              'foreign-policy',
  'Education':                          'education',
  'Housing and Community Development':  'housing',
  'Science, Technology, Communications':'tech-privacy',
  'Immigration':                        'immigration',
  'Crime and Law Enforcement':          'criminal-justice',
  'Civil Rights and Liberties, Minority Issues': 'voting-rights',
  'Social Welfare':                     'social-security',
}

// Keyword arrays per topic slug — matched against lowercased title + summary.
// Supplements the policyArea mapping and catches cross-topic bills.
export const TOPIC_KEYWORDS: Record<string, string[]> = {
  'climate-environment': ['climate', 'emission', 'renewable', 'carbon', 'pollution', 'conservation', 'clean energy', 'epa', 'greenhouse'],
  'healthcare':          ['medicaid', 'medicare', 'drug price', 'prescription drug', 'insurance coverage', 'public health'],
  'economy-jobs':        ['tariff', 'small business', 'federal budget', 'debt ceiling', 'minimum wage'],
  'education':           ['student loan', 'pell grant', 'higher education', 'k-12', 'head start'],
  'housing':             ['affordable housing', 'hud', 'eviction', 'homelessness', 'rental assistance'],
  'immigration':         ['immigr', 'asylum seeker', 'undocumented', 'daca', 'deportat', 'border patrol'],
  'tech-privacy':        ['data privacy', 'artificial intelligence', 'cybersecurity', 'broadband', 'social media platform'],
  'criminal-justice':    ['criminal justice', 'mass incarceration', 'parole', 'juvenile justice', 'law enforcement reform'],
  'voting-rights':       ['voting rights', 'voter suppression', 'campaign finance', 'redistricting', 'gerrymandering', 'election integrity'],
  'social-security':     ['social security', 'disability insurance', 'social security administration'],
  'gun-policy':          ['firearm', 'gun control', 'gun violence', 'assault weapon', 'second amendment', 'concealed carry', 'background check'],
  'foreign-policy':      ['foreign policy', 'foreign aid', 'nato', 'military alliance', 'diplomatic', 'sanctions regime'],
}

// Maps canonical agency name → topic slugs it implies
const AGENCY_TOPIC_MAP: Record<string, string[]> = {
  'Environmental Protection Agency':         ['climate-environment'],
  'Department of Energy':                    ['climate-environment', 'economy-jobs'],
  'NOAA':                                    ['climate-environment'],
  'Bureau of Land Management':               ['climate-environment'],
  'Fish and Wildlife Service':               ['climate-environment'],
  'Forest Service':                          ['climate-environment'],
  'Army Corps of Engineers':                 ['climate-environment'],
  'Department of Health and Human Services': ['healthcare'],
  'CDC':                                     ['healthcare'],
  'FDA':                                     ['healthcare'],
  'NIH':                                     ['healthcare'],
  'CMS':                                     ['healthcare'],
  'SAMHSA':                                  ['healthcare'],
  'HRSA':                                    ['healthcare'],
  'Department of Education':                 ['education'],
  'Department of Housing and Urban Development': ['housing'],
  'Federal Housing Administration':          ['housing'],
  'ICE':                                     ['immigration'],
  'Customs and Border Protection':           ['immigration'],
  'Federal Communications Commission':       ['tech-privacy'],
  'Federal Trade Commission':                ['tech-privacy'],
  'CISA':                                    ['tech-privacy'],
  'Bureau of Prisons':                       ['criminal-justice'],
  'ATF':                                     ['gun-policy', 'criminal-justice'],
  'Drug Enforcement Administration':         ['criminal-justice'],
  'Social Security Administration':          ['social-security'],
  'Department of State':                     ['foreign-policy'],
  'Department of Defense':                   ['foreign-policy'],
}

/**
 * Classifies a bill into one or more topic slugs using:
 * 1. Congress.gov policyArea → topic slug mapping
 * 2. Keyword matching on lowercased title + summary
 * 3. (Optional) Referenced agency names → topic slug mapping
 *
 * Returns an array of matched topic slugs. Bills with no match return [].
 */
export function classifyBillTopics(
  policyArea: string | undefined,
  title: string,
  summary: string | undefined | null,
  agencies: string[] = [],
): string[] {
  const matched = new Set<string>()
  const text = `${title} ${summary ?? ''}`.toLowerCase()

  if (policyArea) {
    const slug = POLICY_AREA_TO_TOPIC_SLUG[policyArea]
    if (slug) matched.add(slug)
  }

  for (const [slug, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(kw => text.includes(kw))) matched.add(slug)
  }

  for (const agency of agencies) {
    const slugs = AGENCY_TOPIC_MAP[agency]
    if (slugs) slugs.forEach(s => matched.add(s))
  }

  return Array.from(matched)
}

