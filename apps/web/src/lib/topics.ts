export const ALL_TOPICS = [
  'Climate & Environment',
  'Healthcare',
  'Economy & Jobs',
  'Education',
  'Housing',
  'Immigration',
  'Criminal Justice',
  'Foreign Policy',
  'Agriculture',
  'Defense',
  'Culture',
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
  'education':           'Education',
  'housing':             'Housing',
  'immigration':         'Immigration',
  'criminal-justice':    'Criminal Justice',
  'foreign-policy':      'Foreign Policy',
  'agriculture':         'Agriculture',
  'defense':             'Defense',
  'culture':             'Culture',
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
