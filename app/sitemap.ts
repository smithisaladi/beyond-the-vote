import type { MetadataRoute } from 'next'
import { ALL_TOPICS, topicToSlug } from '@/lib/topics'
import { siteConfig } from '@/lib/site-config'

/**
 * `/sitemap.xml` generator.
 *
 * Next.js picks this up automatically via the file-based metadata routing
 * convention — the returned `MetadataRoute.Sitemap` is serialized into XML
 * at build time (or request time, if the file is dynamic).
 *
 * Only stable, publicly indexable routes are listed. Dynamic detail pages
 * (`/bills/[id]`, `/representatives/[id]`) are intentionally omitted because
 * they number in the thousands and their metadata churns daily — submitting
 * them through the sitemap would create more crawl noise than SEO value.
 * Search engines discover them via internal links.
 */

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: siteConfig.url,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${siteConfig.url}/bills`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}/representatives`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${siteConfig.url}/topics`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.7,
    },
  ]

  const topicRoutes: MetadataRoute.Sitemap = ALL_TOPICS.map((topic) => ({
    url: `${siteConfig.url}/topics/${topicToSlug(topic)}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }))

  return [...staticRoutes, ...topicRoutes]
}
