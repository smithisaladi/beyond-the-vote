import { describe, it, expect } from 'vitest'
import { ALL_TOPICS, topicToSlug, slugToTopic } from './topics'

describe('topicToSlug', () => {
  it.each([
    ['Climate & Environment', 'climate-environment'],
    ['Healthcare', 'healthcare'],
    ['Economy & Jobs', 'economy-jobs'],
    ['Education', 'education'],
    ['Housing', 'housing'],
    ['Immigration', 'immigration'],
    ['Tech & Privacy', 'tech-privacy'],
    ['Criminal Justice', 'criminal-justice'],
    ['Voting Rights', 'voting-rights'],
    ['Social Security', 'social-security'],
    ['Gun Policy', 'gun-policy'],
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

