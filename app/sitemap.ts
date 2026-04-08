import type { MetadataRoute } from 'next'
import { ALL_TOPICS, topicToSlug } from '@/lib/topics'

const BASE_URL = 'https://beyondtheballot.app'

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: BASE_URL,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${BASE_URL}/bills`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${BASE_URL}/representatives`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${BASE_URL}/topics`,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  const topicRoutes: MetadataRoute.Sitemap = ALL_TOPICS.map(topic => ({
    url: `${BASE_URL}/topics/${topicToSlug(topic)}`,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }))

  return [...staticRoutes, ...topicRoutes]
}
