import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://beyondtheVote.app'),
  title: {
    default: 'Beyond the Vote',
    template: '%s | Beyond the Vote',
  },
  description: 'Uncover the votes, funding, and values behind your elected officials.',
  openGraph: {
    siteName: 'Beyond the Vote',
    type: 'website',
    images: [{ url: '/api/og?type=default', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/api/og?type=default'],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
