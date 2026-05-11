import { FeatureCard } from './FeatureCard'

export function Features() {
  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-16">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <FeatureCard
          title="Track Votes"
          description="See how your representatives voted on every bill, resolution, and amendment. Filter by issue, date, or party alignment."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24"="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
        />
        <FeatureCard
          title="See Top Donors"
          description="Follow the money. Explore detailed breakdowns of campaign contributions, PAC funding, and lobbying connections."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24"="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          }
        />
        <FeatureCard
          title="Compare Your Values"
          description="Answer a few questions about issues you care about, then see which representatives align with your priorities."
          icon={
            <svg width="24" height="24" viewBox="0 0 24 24"="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 20V10" />
              <path d="M12 20V4" />
              <path d="M6 20v-6" />
            </svg>
          }
        />
      </div>
    </div>
  )
}
