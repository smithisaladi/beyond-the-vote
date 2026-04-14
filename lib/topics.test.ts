import { describe, it, expect } from 'vitest'
import {
  ALL_TOPICS, topicToSlug, slugToTopic, classifyBillTopics,
  TOPIC_KEYWORDS, TOPIC_TO_CATEGORY, TOPIC_SEARCH_QUERY,
} from './topics'

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

describe('classifyBillTopics', () => {
  it('matches by policyArea alone', () => {
    const result = classifyBillTopics('Health', 'Unrelated title', null)
    expect(result).toContain('healthcare')
  })

  it('matches by keyword in title', () => {
    const result = classifyBillTopics(undefined, 'A bill about climate change', null)
    expect(result).toContain('climate-environment')
  })

  it('matches by keyword in summary', () => {
    const result = classifyBillTopics(undefined, 'Some title', 'Reform medicaid coverage')
    expect(result).toContain('healthcare')
  })

  it('matches by agency', () => {
    const result = classifyBillTopics(undefined, 'Some title', null, ['CDC'])
    expect(result).toContain('healthcare')
  })

  it('deduplicates across sources (policyArea + keyword)', () => {
    const result = classifyBillTopics(
      'Health',
      'Expand medicaid coverage',
      null,
      ['CDC'],
    )
    const healthcareCount = result.filter(s => s === 'healthcare').length
    expect(healthcareCount).toBe(1)
  })

  it('returns multiple topics when matched', () => {
    const result = classifyBillTopics(
      undefined,
      'Gun violence and criminal justice reform',
      null,
    )
    expect(result).toContain('gun-policy')
    expect(result).toContain('criminal-justice')
  })

  it('returns empty array when nothing matches', () => {
    const result = classifyBillTopics(undefined, 'Lorem ipsum dolor sit amet', null)
    expect(result).toEqual([])
  })

  it('handles null/undefined summary gracefully', () => {
    expect(() => classifyBillTopics(undefined, 'title', null)).not.toThrow()
    expect(() => classifyBillTopics(undefined, 'title', undefined)).not.toThrow()
  })

  it('handles empty agencies array', () => {
    const result = classifyBillTopics(undefined, 'climate', null, [])
    expect(result).toContain('climate-environment')
  })

  it('keyword matching is case-insensitive', () => {
    const result = classifyBillTopics(undefined, 'CLIMATE Change Prevention Act', null)
    expect(result).toContain('climate-environment')
  })

  it('handles agency with multiple topic mappings (ATF → gun-policy + criminal-justice)', () => {
    const result = classifyBillTopics(undefined, 'Unrelated', null, ['ATF'])
    expect(result).toContain('gun-policy')
    expect(result).toContain('criminal-justice')
  })

  it('ignores unknown policyArea', () => {
    const result = classifyBillTopics('Fake Area', 'Unrelated title', null)
    expect(result).toEqual([])
  })

  it('documents substring matching behavior (e.g. "immigr" matches "immigration")', () => {
    const result = classifyBillTopics(undefined, 'Border and immigration reform', null)
    expect(result).toContain('immigration')
  })
})

describe('TOPIC_KEYWORDS exhaustiveness', () => {
  it('has keywords for every topic slug derivable from ALL_TOPICS', () => {
    const slugs = ALL_TOPICS.map(topicToSlug)
    for (const slug of slugs) {
      expect(TOPIC_KEYWORDS[slug]).toBeDefined()
      expect(TOPIC_KEYWORDS[slug].length).toBeGreaterThan(0)
    }
  })
})

describe('TOPIC_TO_CATEGORY / TOPIC_SEARCH_QUERY coverage', () => {
  it('every topic is in either TOPIC_TO_CATEGORY or TOPIC_SEARCH_QUERY', () => {
    for (const topic of ALL_TOPICS) {
      const covered = topic in TOPIC_TO_CATEGORY || topic in TOPIC_SEARCH_QUERY
      expect(covered).toBe(true)
    }
  })
})
