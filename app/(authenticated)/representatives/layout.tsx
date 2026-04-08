import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Find My Representatives',
  description: 'Enter your address to find your federal senators and representatives.',
}

export default function RepresentativesLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
