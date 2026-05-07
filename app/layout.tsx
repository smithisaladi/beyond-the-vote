import type { Metadata, Viewport } from 'next'
import { Fraunces, Inter } from 'next/font/google'
import { siteConfig } from '@/lib/site-config'
import { Providers } from '@/components/shared/Providers'
import './globals.css'

/**
 * Root layout — applied to every route in the app.
 *
 * Responsibilities:
 *   1. Load fonts via `next/font` so Next can self-host the font files,
 *      inline the CSS, and avoid the render-blocking `@import url(...)`
 *      pattern that a Google Fonts stylesheet would cause.
 *   2. Provide default `<head>` metadata + viewport settings that downstream
 *      routes can extend via their own `metadata` / `generateMetadata` exports.
 *   3. Render the `<html>` and `<body>` shell. No navigation or chrome lives
 *      here — that's the responsibility of the route group layouts
 *      (e.g. `app/(authenticated)/layout.tsx`).
 */

// --- Fonts -----------------------------------------------------------------
// CSS variables are referenced by Tailwind and inline styles throughout the
// app (see `CLAUDE.md` → Typography). Keeping `display: 'swap'` avoids FOIT
// (flash of invisible text) while the font file is still downloading.

const fraunces = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-serif',
  // Fraunces is a variable font; request the axes we actually use so the
  // served file stays small.
  axes: ['opsz'],
})

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
  // Only the weights referenced by the design system (500/600 emphasis,
  // 400 body) — adding more would bloat the initial payload.
  weight: ['400', '500', '600'],
})

// --- Metadata --------------------------------------------------------------
// `metadataBase` lets child routes use relative OG image URLs.
// The `title.template` pattern prepends each page title with the brand name,
// while `title.default` is used on routes that don't set their own title.

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  referrer: 'origin-when-cross-origin',
  openGraph: {
    siteName: siteConfig.name,
    type: 'website',
    url: siteConfig.url,
    images: [{ url: siteConfig.defaultOgImage, width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: [siteConfig.defaultOgImage],
  },
  // Prevent indexing of non-production deployments (e.g. Vercel previews) to
  // keep duplicate content out of search results.
  robots:
    process.env.NEXT_PUBLIC_VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production'
      ? undefined
      : { index: false, follow: false },
}

// --- Viewport --------------------------------------------------------------
// Next.js 15 separates viewport/theme from metadata so it can be streamed
// independently. `themeColor` matches the page background and gives iOS
// Safari a seamless status-bar tint.

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F5F0E8',
  colorScheme: 'light',
}

// --- Layout ----------------------------------------------------------------

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // `suppressHydrationWarning` is not needed here — we don't mutate the
    // <html> element on the client. If a theme toggle is added later that
    // sets `class="dark"` pre-hydration, add it then.
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
