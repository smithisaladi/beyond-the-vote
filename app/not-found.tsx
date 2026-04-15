import type { Metadata } from 'next'
import Link from 'next/link'
import { siteConfig } from '@/lib/site-config'

/**
 * Global 404 page — rendered whenever `notFound()` is called or when a
 * user navigates to a route that doesn't exist.
 *
 * This is a *server component*, which lets Next.js return the response
 * with a proper `404` status code (a client-rendered 404 would respond
 * with `200` and confuse crawlers).
 */

export const metadata: Metadata = {
  title: 'Page not found',
  // Don't let 404s show up in search results.
  robots: { index: false, follow: false },
}

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        <p
          className="text-8xl font-bold text-[#7B5E8A]/20 mb-2 leading-none select-none"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          404
        </p>
        <h1
          className="text-2xl text-[#1C1C1A] mb-3"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
        >
          Page not found
        </h1>
        <p className="text-sm text-[#1C1C1A]/55 mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or may have been moved.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#7B5E8A] text-white text-sm font-medium rounded-lg hover:bg-[#6A4F78] transition-colors"
        >
          Back to home
        </Link>
      </div>

      <p
        className="absolute bottom-8 text-xs text-[#1C1C1A]/30"
        style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
      >
        {siteConfig.name}
      </p>
    </div>
  )
}
