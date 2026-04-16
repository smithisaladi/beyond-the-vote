import { describe, it, expect } from 'vitest'
import { ALL_TOPICS, topicToSlug, slugToTopic } from './topics'

describe('topicToSlug', () => {
  it.each([
    ['Climate & Environment', 'climate-environment'],
    ['Healthcare', 'healthcare'],
    ['Economy & Jobs', 'economy'],
    ['Education', 'education'],
    ['Housing', 'housing'],
    ['Immigration', 'immigration'],
    ['Criminal Justice', 'criminal-justice'],
    ['Foreign Policy', 'foreign-policy'],
  ] as const)('maps "%s" → "%s"', (topic, slug) => {
    expect(topicToSlug(topic)).toBe(slug)
  })
})

describe('slugToTopic', () => {
  it('round-trips every canonical topic', () => {
    for (const topic of ALL_TOPICS) {
      expect(slugToTopic(topicToSlug(topic))).toBe(topic)
    }
  })

  it('returns null for unknown slug', () => {
    expect(slugToTopic('nonexistent-slug')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(slugToTopic('')).toBeNull()
  })
})

