
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ActivityItem } from '@/hooks/useDashboard'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'

interface ActivityFeedProps {
  activityFeed: ActivityItem[]
  loading: boolean
  isNew: (timestamp: number) => boolean
}

export function ActivityFeed({ activityFeed, loading, isNew }: ActivityFeedProps) {
  const [activityTab, setActivityTab] = useState<'all' | 'bills' | 'votes'>('all')

  const filteredActivity = activityFeed.filter(item => {
    if (activityTab === 'votes') return item.politician !== null
    if (activityTab === 'bills') return item.politician === null
    return true
  })

  return (
    <section>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-baseline gap-2.5">
          <h2 className="text-lg font-semibold text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>Activity</h2>
          <span className="text-sm text-[#1C1C1A]/38" style={{ fontFamily: 'var(--font-serif)' }}>Recent updates</span>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'bills', 'votes'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActivityTab(tab)}
              className={`text-xs font-medium px-4 py-2 rounded-lg border transition-colors ${
                activityTab === tab
                  ? 'bg-[#7B5E8A]/10 text-[#7B5E8A] border-[#7B5E8A]/20'
                  : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 border-transparent'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'bills' ? 'Bills' : 'Votes'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card className="animate-pulse space-y-4">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-7 h-7 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3 w-5/6" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </Card>
      ) : filteredActivity.length === 0 ? (
        <Card padding="none" className="px-6 py-10 text-center">
          <p className="text-sm text-[#1C1C1A]/45">
            {activityFeed.length === 0
              ? 'No activity yet \u2014 follow politicians and track bills to see updates here.'
              : 'No items in this category yet.'}
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden max-h-[600px] overflow-y-auto">
          {filteredActivity.map((item, idx) => {
            const isVote = item.politician !== null
            const unread = isNew(item.timestamp)
            const dotColor = item.isAlert
              ? 'bg-[#B85C38]'
              : isVote
                ? unread ? 'bg-[#7B5E8A]' : 'bg-[#7B5E8A]/50'
                : unread ? 'bg-[#8A8A7A]' : 'bg-[#8A8A7A]/50'
            const rowClass = `flex items-start gap-3.5 pl-[22px] pr-6 py-4 border-l-2 transition-all duration-150 ${
              unread ? 'border-[#7B5E8A] bg-[#7B5E8A]/[0.04]' : 'border-transparent'
            } ${
              idx < filteredActivity.length - 1 ? 'border-b border-b-[rgba(28,28,26,0.05)]' : ''
            } ${item.href ? 'hover:bg-[#F5F0E8]/60 cursor-pointer' : ''}`
            const inner = (
              <>
                <div className={`w-1.5 h-1.5 rounded-full mt-[7px] flex-shrink-0 ${dotColor}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">
                    {item.politician && (
                      <span className="text-[#1C1C1A] font-medium">{item.politician} </span>
                    )}
                    <span className="text-[#1C1C1A]/45">{item.action}</span>
                  </p>
                  <p className="text-sm text-[#1C1C1A]/80 leading-snug mt-0.5">
                    {item.subject}
                  </p>
                </div>
                <span className="text-[11px] text-[#1C1C1A]/32 flex-shrink-0 mt-0.5 whitespace-nowrap">{item.date}</span>
              </>
            )
            return item.href ? (
              <Link key={item.id} href={item.href} className={`block ${rowClass}`}>
                {inner}
              </Link>
            ) : (
              <div key={item.id} className={rowClass}>
                {inner}
              </div>
            )
          })}
        </Card>
      )}
    </section>
  )
}
