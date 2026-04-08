import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Topics',
  description: 'Follow the policy areas that matter to you.',
}

export default function TopicsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
