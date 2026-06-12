

import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { motion } from 'motion/react'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useAuth } from '@/components/auth/AuthContext'
import { useTabState } from '@/hooks/useTabState'
import { usePoliticianDetail } from '@/hooks/queries/usePoliticians'
import { useFollowedPoliticians, useFollowPolitician } from '@/hooks/queries/useDashboard'
import type { Politician } from '@/lib/types/politicians'
import { DonorTab } from '@/components/representatives/DonorTab'
import { Card } from '@/components/ui/Card'
import { PageTransition } from '@/components/ui/motion'
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
    <PageTransition>
    <div className="flex flex-col min-h-screen">
      <div className="flex flex-col flex-1">
        <main className="flex-1 px-6 pt-8 pb-8">
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <ErrorState
              message={error === 'Politician not found' ? 'Representative not found.' : 'Failed to load representative data.'}
            />
          ) : !politician ? null : (
            <div className="max-w-5xl mx-auto space-y-5">
              <Link
                to="/representatives"
                className="flex items-center gap-2 text-[13px] text-fg/50 hover:text-fg transition-colors"
              >
                <ArrowLeft size={16} strokeWidth={1.8} />
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

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
                <Card padding="none" className="overflow-hidden">
                  <div className="flex border-b border-edge" role="tablist">
                    {tabs.map(tab => (
                      <button
                        key={tab.key}
                        role="tab"
                        aria-selected={activeTab === tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`relative px-4 py-3 text-[13px] font-medium transition-colors ${
                          activeTab === tab.key
                            ? 'text-fg'
                            : 'text-fg/50 hover:text-fg/70'
                        }`}
                      >
                        {tab.label}
                        {activeTab === tab.key && (
                          <motion.div
                            layoutId="rep-tab-indicator"
                            className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                          />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="divide-y divide-edge-soft">
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
    </PageTransition>
  )
}
