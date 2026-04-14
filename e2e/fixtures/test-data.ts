/**
 * Shared fixture data for e2e tests. These mirror the expected shape of API
 * responses. In CI, the local Supabase instance will be seeded with matching
 * rows via supabase/seed.test.sql. For development without a local DB, e2e
 * tests can intercept routes and return these fixtures directly.
 */

export const TEST_BILL = {
  id: '119-hr-1234',
  number: 'H.R. 1234',
  title: 'Climate Resilience Act of 2025',
  sponsor: 'Jane Smith',
  party: 'Democrat' as const,
  status: 'Active' as const,
  category: 'Environment',
  lastAction: 'Jan 15, 2025',
  lastActionTimestamp: 1736899200000,
  summary: 'A bill to promote climate resilience in federal infrastructure projects.',
}

export const TEST_REPRESENTATIVE = {
  id: 'S000001',
  bioguideId: 'S000001',
  name: 'Jane Smith',
  title: 'U.S. Senator',
  party: 'Democrat' as const,
  state: 'CA',
  district: undefined,
  photo: null,
  since: '2019',
  website: 'https://smith.senate.gov',
  phone: '202-555-0100',
  ideologyScore: -0.42,
}

export const TEST_PAC = {
  cmteId: 'C00401224',
  cmteName: 'AIPAC PAC',
  directTotal: 300_000,
  ieForTotal: 150_000,
  ieAgainstTotal: 50_000,
  totalContributions: 500_000,
  recipientCount: 15,
  topRecipients: [
    { bioguideId: 'S000001', name: 'Jane Smith', party: 'Democrat', state: 'CA', chamber: 'senate', amount: 50_000 },
    { bioguideId: 'J000002', name: 'John Jones', party: 'Republican', state: 'TX', chamber: 'house', amount: 40_000 },
  ],
}

export const TEST_USER = {
  email: 'testuser@example.com',
  password: 'TestPass123!',
}
