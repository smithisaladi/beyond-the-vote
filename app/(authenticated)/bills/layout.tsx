import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Bills',
  description: 'Track legislation moving through Congress. Filter by topic, status, and more.',
}

export default function BillsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
