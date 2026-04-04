import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Beyond the Ballot',
  description: 'Uncover the votes, funding, and values behind your elected officials.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
