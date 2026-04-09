import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/bills', '/representatives', '/topics'],
        disallow: ['/settings', '/api/'],
      },
    ],
    sitemap: 'https://beyondtheVote.app/sitemap.xml',
  }
}
