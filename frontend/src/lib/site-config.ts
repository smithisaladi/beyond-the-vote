/**
 * Centralized site configuration.
 *
 * Single source of truth for the canonical site URL, brand name, and
 * tagline-level copy used throughout `<head>` metadata, OpenGraph images,
 * the sitemap, and robots.txt.
 *
 * Production deployments should set `VITE_SITE_URL` in the hosting
 * environment. The fallback URL is only used for local development and is
 * not expected to match the production origin.
 */

// Strip trailing slashes so `${siteConfig.url}/path` is always well-formed.
const rawUrl = import.meta.env.VITE_SITE_URL ?? 'http://localhost:5173'
const normalizedUrl = rawUrl.replace(/\/+$/, '')

export const siteConfig = {
  /** Brand / product name — rendered in titles, footers, and the wordmark. */
  name: 'Beyond the Vote',

  /** Short tagline used under the hero and in social previews. */
  tagline: 'Political Transparency for Every Voter',

  /** Default meta description — overridden by individual routes when relevant. */
  description:
    "Uncover the votes, funding, and values behind your elected officials.",

  /** Canonical absolute URL (no trailing slash). Used for sitemap, robots, and metadataBase. */
  url: normalizedUrl,

  /** Default OpenGraph / Twitter card image path (served by `/app/api/og`). */
  defaultOgImage: '/api/og?type=default',
} as const

export type SiteConfig = typeof siteConfig
