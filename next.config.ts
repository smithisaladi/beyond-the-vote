import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'raw.githubusercontent.com',
        pathname: '/unitedstates/images/**',
      },
      {
        protocol: 'https',
        hostname: 'theunitedstates.io',
        pathname: '/images/congress/**',
      },
      {
        protocol: 'https',
        hostname: 'bioguide.congress.gov',
        pathname: '/bioguide/photo/**',
      },
      {
        protocol: 'https',
        hostname: 'www.congress.gov',
        pathname: '/img/member/**',
      },
    ],
  },
}

export default nextConfig
