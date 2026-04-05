export const CACHE_CONFIG = {
  // ──── LOCAL DB (sync scripts) ────
  legislators: {
    source: 'unitedstates/congress-legislators',
    refresh: '24h',
    why: 'Member roster changes ~5-10x per year. Daily catches changes within 24h.',
  },
  memberScores: {
    source: 'VoteView HSall_members.csv',
    refresh: '24h',
    why: 'NOMINATE re-estimated periodically; meaningful changes only between Congresses.',
  },
  billVotes: {
    source: 'Congress.gov actions → Senate.gov XML / House API',
    refresh: '1h (session days only)',
    why: 'New votes happen on session days. 1h staleness acceptable for a transparency tool.',
  },
  committees: {
    source: 'unitedstates/congress-legislators',
    refresh: '24h',
    why: 'Set at start of Congress. Mid-session changes rare.',
  },

  // ──── REAL-TIME API (Next.js revalidate seconds) ────
  congressGovBills: { revalidate: 3600,  why: 'Bills get new actions daily.' },
  geocodio:         { revalidate: 3600,  why: 'Districts change every 10 years. Cache is rate-limit protection.' },
  openFEC:          { revalidate: 86400, why: 'FEC bulk data updates nightly.' },
} as const
