import { describe, it, expect } from 'vitest'
import { topicToSlug, slugToTopic, ALL_TOPICS } from './topics'

describe('topicToSlug', () => {
  it('maps known topics to slugs', () => {
    expect(topicToSlug('Climate & Environment')).toBe('climate-environment')
    expect(topicToSlug('Healthcare')).toBe('healthcare')
    expect(topicToSlug('Economy & Jobs')).toBe('economy')
    expect(topicToSlug('Criminal Justice')).toBe('criminal-justice')
    expect(topicToSlug('Foreign Policy')).toBe('foreign-policy')
  })

  it('maps single-word topics to lowercase slugs', () => {
    expect(topicToSlug('Education')).toBe('education')
    expect(topicToSlug('Defense')).toBe('defense')
  })
})

describe('slugToTopic', () => {
  it('maps known slugs back to topics', () => {
    expect(slugToTopic('climate-environment')).toBe('Climate & Environment')
    expect(slugToTopic('healthcare')).toBe('Healthcare')
    expect(slugToTopic('economy')).toBe('Economy & Jobs')
    expect(slugToTopic('criminal-justice')).toBe('Criminal Justice')
  })

  it('returns null for unknown slugs', () => {
    expect(slugToTopic('nonexistent-topic')).toBeNull()
    expect(slugToTopic('')).toBeNull()
  })
})

describe('ALL_TOPICS', () => {
  it('is non-empty', () => {
    expect(ALL_TOPICS.length).toBeGreaterThan(0)
  })

  it('contains expected items', () => {
    expect(ALL_TOPICS).toContain('Healthcare')
    expect(ALL_TOPICS).toContain('Climate & Environment')
    expect(ALL_TOPICS).toContain('Education')
    expect(ALL_TOPICS).toContain('Defense')
    expect(ALL_TOPICS).toContain('Immigration')
  })
})
