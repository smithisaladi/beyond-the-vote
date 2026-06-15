import { describe, it, expect } from 'vitest'
import { makeIsNew, filterActivityByTab } from './activity'
import type { ActivityItem } from '@/lib/types'

const item = (over: Partial<ActivityItem>): ActivityItem => ({
  id: 'x', politician: null, action: 'a', subject: 's',
  date: 'Jan 1, 2024', timestamp: 0, href: null, isAlert: false, ...over,
})

describe('makeIsNew', () => {
  it('returns false for everything when lastSeenAt is null', () => {
    expect(makeIsNew(null)(Date.now())).toBe(false)
  })

  it('marks items strictly newer than lastSeenAt as new', () => {
    const isNew = makeIsNew('2024-01-10T00:00:00Z')
    expect(isNew(Date.parse('2024-01-15T00:00:00Z'))).toBe(true)
    expect(isNew(Date.parse('2024-01-05T00:00:00Z'))).toBe(false)
    expect(isNew(Date.parse('2024-01-10T00:00:00Z'))).toBe(false)
  })

  it('returns false when lastSeenAt is unparseable', () => {
    expect(makeIsNew('not-a-date')(Date.now())).toBe(false)
  })
})

describe('filterActivityByTab', () => {
  const items = [item({ id: 'v', politician: 'Rep. A' }), item({ id: 'b', politician: null })]

  it('votes tab keeps politician-attributed items', () => {
    expect(filterActivityByTab(items, 'votes').map(i => i.id)).toEqual(['v'])
  })

  it('bills tab keeps non-politician items', () => {
    expect(filterActivityByTab(items, 'bills').map(i => i.id)).toEqual(['b'])
  })

  it('all tab keeps everything', () => {
    expect(filterActivityByTab(items, 'all')).toHaveLength(2)
  })
})
