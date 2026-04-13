import type { MetadataRoute } from 'next'
import { siteConfig } from '@/lib/site-config'

/**
 * `/robots.txt` generator.
 *
 * Rules:
 *   - Allow indexing of the public, content-heavy routes (home, bills,
 *     representatives, topic indexes).
 *   - Disallow anything behind auth (`/settings`) and the JSON API surface
 *     (`/api/`), which has no SEO value and is rate-limited.
 */

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/bills', '/representatives', '/topics'],
        disallow: ['/settings', '/api/'],
      },
    ],
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  }
}
