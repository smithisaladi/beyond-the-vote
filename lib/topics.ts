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
] as const

export type Topic = (typeof ALL_TOPICS)[number]

export function topicToSlug(topic: Topic): string {
  return topic
    .toLowerCase()
    .replace(/&/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function slugToTopic(slug: string): Topic | null {
  return ALL_TOPICS.find(t => topicToSlug(t) === slug) ?? null
}

// Maps a topic to the bills API `category` param where applicable
export const TOPIC_TO_CATEGORY: Partial<Record<Topic, string>> = {
  'Climate & Environment': 'Environment',
  'Healthcare': 'Healthcare',
  'Economy & Jobs': 'Economy',
  'Education': 'Education',
  'Housing': 'Housing',
  'Immigration': 'Immigration',
  'Tech & Privacy': 'Technology',
  'Foreign Policy': 'Defense',
}

export const TOPIC_BILLS: Record<Topic, { number: string; title: string; status: string }[]> = {
  'Climate & Environment': [
    { number: 'S. 1247',   title: 'Clean Energy Transition Act',        status: 'Active'    },
    { number: 'H.R. 5503', title: 'Renewable Portfolio Standards Act',  status: 'Committee' },
  ],
  'Healthcare': [
    { number: 'S. 712',    title: 'Medicare Expansion Act',             status: 'Active'    },
    { number: 'H.R. 1987', title: 'Community Health Centers Act',       status: 'Stalled'   },
  ],
  'Economy & Jobs': [
    { number: 'H.R. 3892', title: 'Small Business Tax Relief Act',      status: 'Committee' },
    { number: 'S. 1633',   title: 'Agricultural Subsidy Reform Act',    status: 'Failed'    },
  ],
  'Education': [
    { number: 'H.R. 4401', title: 'Universal Pre-K Funding Act',        status: 'Committee' },
    { number: 'S. 1401',   title: 'Universal Pre-K Education Act',      status: 'Committee' },
  ],
  'Housing': [
    { number: 'H.R. 2108', title: 'Affordable Housing Investment Act',  status: 'Active'    },
    { number: 'H.R. 5503', title: 'Affordable Housing Development Act', status: 'Stalled'   },
  ],
  'Immigration': [
    { number: 'S. 0891',   title: 'Border Security and Enforcement Act',status: 'Stalled'   },
    { number: 'S. 2891',   title: 'Secure Borders Enforcement Act',     status: 'Committee' },
  ],
  'Tech & Privacy': [
    { number: 'H.R. 4455', title: 'Digital Privacy Protection Act',     status: 'Active'    },
    { number: 'H.R. 1820', title: 'Digital Privacy Protection Act',     status: 'Active'    },
  ],
  'Criminal Justice': [
    { number: 'H.R. 4832', title: 'Criminal Justice Reform Act',        status: 'Committee' },
  ],
  'Voting Rights': [
    { number: 'H.R. 6112', title: 'Voting Access and Security Act',     status: 'Active'    },
  ],
  'Social Security': [
    { number: 'S. 2205',   title: 'Social Security Preservation Act',   status: 'Active'    },
    { number: 'S. 712',    title: 'Medicare Expansion Act',             status: 'Active'    },
  ],
  'Gun Policy': [
    { number: 'S. 3304',   title: 'Background Check Expansion Act',     status: 'Stalled'   },
  ],
  'Foreign Policy': [
    { number: 'S. 1788',   title: 'Defense Modernization Act',          status: 'Passed'    },
    { number: 'S. 0722',   title: 'Defense Modernization Act',          status: 'Active'    },
  ],
}

export const TOPIC_POLITICIANS: Record<Topic, { name: string; title: string; party: string; state: string; bioguideId: string }[]> = {
  'Climate & Environment': [
    { name: 'Margaret Chen', title: 'U.S. Senator',        party: 'Democrat',    state: 'California', bioguideId: 'C001113' },
  ],
  'Healthcare': [
    { name: 'Margaret Chen', title: 'U.S. Senator',        party: 'Democrat',    state: 'California', bioguideId: 'C001113' },
    { name: 'Priya Mehta',   title: 'U.S. Representative', party: 'Democrat',    state: 'New York',   bioguideId: 'M001211' },
  ],
  'Economy & Jobs': [
    { name: 'Robert Harmon', title: 'U.S. Senator',        party: 'Republican',  state: 'California', bioguideId: 'H001071' },
    { name: 'Samuel Okafor', title: 'U.S. Senator',        party: 'Independent', state: 'Maine',      bioguideId: 'O000174' },
  ],
  'Education': [
    { name: 'Margaret Chen', title: 'U.S. Senator',        party: 'Democrat',    state: 'California', bioguideId: 'C001113' },
    { name: 'Diana Reyes',   title: 'U.S. Representative', party: 'Democrat',    state: 'California', bioguideId: 'R000600' },
  ],
  'Housing': [
    { name: 'Diana Reyes',   title: 'U.S. Representative', party: 'Democrat',    state: 'California', bioguideId: 'R000600' },
  ],
  'Immigration': [
    { name: 'Robert Harmon',     title: 'U.S. Senator',        party: 'Republican', state: 'California', bioguideId: 'H001071' },
    { name: 'Thomas Gallagher',  title: 'U.S. Representative', party: 'Republican', state: 'Texas',      bioguideId: 'G000579' },
  ],
  'Tech & Privacy': [
    { name: 'Margaret Chen', title: 'U.S. Senator',        party: 'Democrat',    state: 'California', bioguideId: 'C001113' },
    { name: 'Priya Mehta',   title: 'U.S. Representative', party: 'Democrat',    state: 'New York',   bioguideId: 'M001211' },
  ],
  'Criminal Justice': [
    { name: 'Priya Mehta',   title: 'U.S. Representative', party: 'Democrat',    state: 'New York',   bioguideId: 'M001211' },
  ],
  'Voting Rights': [
    { name: 'Diana Reyes',   title: 'U.S. Representative', party: 'Democrat',    state: 'California', bioguideId: 'R000600' },
    { name: 'Samuel Okafor', title: 'U.S. Senator',        party: 'Independent', state: 'Maine',      bioguideId: 'O000174' },
  ],
  'Social Security': [
    { name: 'Samuel Okafor', title: 'U.S. Senator',        party: 'Independent', state: 'Maine',      bioguideId: 'O000174' },
    { name: 'Diana Reyes',   title: 'U.S. Representative', party: 'Democrat',    state: 'California', bioguideId: 'R000600' },
  ],
  'Gun Policy': [
    { name: 'Thomas Gallagher', title: 'U.S. Representative', party: 'Republican', state: 'Texas', bioguideId: 'G000579' },
  ],
  'Foreign Policy': [
    { name: 'Robert Harmon', title: 'U.S. Senator',        party: 'Republican',  state: 'California', bioguideId: 'H001071' },
    { name: 'Priya Mehta',   title: 'U.S. Representative', party: 'Democrat',    state: 'New York',   bioguideId: 'M001211' },
    { name: 'Samuel Okafor', title: 'U.S. Senator',        party: 'Independent', state: 'Maine',      bioguideId: 'O000174' },
  ],
}
