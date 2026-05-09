'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAuthModal } from '@/components/auth/AuthModalContext'
import { useAuth } from '@/hooks/useAuth'
import { useTabState } from '@/hooks/useTabState'
import { useFollowPolitician } from '@/hooks/useFollowPolitician'
import { useFetchPoliticianDetail, type Politician } from '@/hooks/useFetchPoliticianDetail'
import { DonorTab } from '@/components/representatives/DonorTab'
import { PageHeader } from '@/components/layout/PageHeader'
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
  const { politician, loading, error } = useFetchPoliticianDetail(id, initialPolitician)
  const { following, loading: followLoading, toggleFollow: handleFollow } = useFollowPolitician(
    id,
    user?.id ?? null,
    openSignIn,
  )

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
        <PageHeader title="Politicians" />

        <main className="flex-1 px-6 pt-16 pb-8">
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <ErrorState
              message={error === 'Politician not found' ? 'Representative not found.' : 'Failed to load representative data.'}
            />
          ) : !politician ? null : (
            <div className="max-w-5xl mx-auto space-y-6">
              <Link
                href="/representatives"
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
