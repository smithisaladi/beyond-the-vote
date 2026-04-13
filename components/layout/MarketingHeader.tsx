import Link from 'next/link'
import { siteConfig } from '@/lib/site-config'

/**
 * Minimal sticky header used on static marketing / legal pages
 * (`/privacy`, `/terms`, and similar unauthenticated content routes).
 *
 * Matches the landing page header styling (see CLAUDE.md → Sticky Landing
 * Nav) but strips out the navigation tabs and auth CTAs — those belong on
 * the landing page itself, not on terms-of-service style content pages.
 */
export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-20 bg-[#F5F0E8]/95 backdrop-blur-sm border-b border-[rgba(28,28,26,0.1)]">
      <div className="max-w-6xl mx-auto px-6 flex items-center h-16 gap-6">
        <Link
          href="/"
          className="text-base text-[#1C1C1A] tracking-[0.01em] flex-shrink-0"
          style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
        >
          {siteConfig.name}
        </Link>
      </div>
    </header>
  )
}
