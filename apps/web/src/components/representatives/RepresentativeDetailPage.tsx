

import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useAuth } from '@/components/auth/AuthContext'
import { useTabState } from '@/hooks/useTabState'
import { usePoliticianDetail } from '@/hooks/queries/usePoliticians'
import { useFollowedPoliticians, useFollowPolitician } from '@/hooks/queries/useDashboard'
import type { Politician } from '@/lib/types/politicians'
import { DonorTab } from '@/components/representatives/DonorTab'
import { DotGridBackground } from '@/components/shared/DotGridBackground'
import { Card } from '@/components/ui/Card'
import { ProfileSkeleton } from './sections/ProfileSkeleton'
import { ErrorState } from './sections/ErrorState'
import { HeroCard } from './sections/HeroCard'
import { VotesTab } from './sections/VotesTab'
import { SponsoredBillsTab } from './sections/SponsoredBillsTab'
import { ProfileSidebar } from './sections/ProfileSidebar'

type Tab = 'votes' | 'bills' | 'donors'

export default function RepresentativeDetailPage({ id, initialPolitician }: { id: string; initialPolitician?: Politician | null }) {
  const { activeTab, setActiveTab } = useTabState<Tab>({
    paramName: 'tab',
    defaultValue: 'votes',
    validValues: ['votes', 'bills', 'donors'],
  })

  const [photoError, setPhotoError] = useState(false)
  const { openSignIn } = useAuthModal()

  const { user } = useAuth()
  const { data: politician, isLoading: loading, error: _error } = usePoliticianDetail(id)
  const { data: followedData } = useFollowedPoliticians()
  const followMutation = useFollowPolitician()
  const followedIds = new Set(
    (followedData?.politicians ?? []).map((p: any) => p.id)
  )
  const following = followedIds.has(id)
  const followLoading = followMutation.isPending
  const handleFollow = () => {
    if (!user) { openSignIn(); return }
    followMutation.mutate({ politicianId: id, follow: !following })
  }
  const error = _error ? String(_error) : null

  useEffect(() => {
    setPhotoError(false)
  }, [id])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'votes', label: 'Recent Votes' },
    { key: 'bills', label: 'Sponsored Bills' },
    { key: 'donors', label: 'Donor Profile' },
  ]

  return (
    <div className="relative flex flex-col min-h-screen overflow-hidden">
      <DotGridBackground id="dot-grid-rep-detail" />

      <div className="relative z-10 flex flex-col flex-1">
        <main className="flex-1 px-6 pt-8 pb-8">
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <ErrorState
              message={error === 'Politician not found' ? 'Representative not found.' : 'Failed to load representative data.'}
            />
          ) : !politician ? null : (
            <div className="max-w-5xl mx-auto space-y-6">
              <Link
                to="/representatives"
                className="flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Back to representatives
              </Link>

              <HeroCard
                politician={politician}
                following={following}
                followLoading={followLoading}
                photoError={photoError}
                onFollow={handleFollow}
                onPhotoError={() => setPhotoError(true)}
              />

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">
                <Card padding="none" className="overflow-hidden">
                  <div className="flex border-b border-[rgba(28,28,26,0.08)]" role="tablist">
                    {tabs.map(tab => (
                      <button
                        key={tab.key}
                        role="tab"
                        aria-selected={activeTab === tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                          activeTab === tab.key
                            ? 'border-[#7B5E8A] text-[#1C1C1A]'
                            : 'border-transparent text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="divide-y divide-[rgba(28,28,26,0.06)]">
                    {activeTab === 'votes' && (
                      <VotesTab votes={politician.votes ?? []} politicianId={id} />
                    )}
                    {activeTab === 'bills' && (
                      <SponsoredBillsTab bills={politician.bills ?? []} politicianId={id} />
                    )}
                    {activeTab === 'donors' && (
                      <DonorTab
                        pacDonors={politician.pacDonors ?? []}
                        topContributors={politician.topContributors ?? []}
                        fundingBreakdown={politician.fundingBreakdown}
                        fecUrl={politician.fecUrl}
                      />
                    )}
                  </div>
                </Card>

                <ProfileSidebar
                  stats={politician.stats}
                  nextElectionYear={politician.nextElectionYear}
                  committees={politician.committees}
                />
              </div>
            </div>
          )}
        </main>
      </div>

    </div>
  )
}
