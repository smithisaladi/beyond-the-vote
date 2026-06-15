

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { STATUS_STYLES } from '@/lib/ui'
import type { ActivityItem } from '@/lib/types'
import { filterActivityByTab, type ActivityTab } from '@/lib/activity'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { StaggerGrid, StaggerItem } from '@/components/ui/motion'

interface ActivityFeedProps {
  activityFeed: ActivityItem[]
  loading: boolean
  isNew: (timestamp: number) => boolean
}

export function ActivityFeed({ activityFeed, loading, isNew }: ActivityFeedProps) {
  const [activityTab, setActivityTab] = useState<ActivityTab>('all')

  const filteredActivity = filterActivityByTab(activityFeed, activityTab)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-serif font-semibold text-fg">Activity</h2>
          <span className="text-xs text-fg/38">Recent updates</span>
        </div>
        <div className="flex items-center gap-1">
          {(['all', 'bills', 'votes'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActivityTab(tab)}
              className={`text-xs font-medium px-3 py-2 rounded-lg border transition-colors ${
                activityTab === tab
                  ? 'bg-accent-deep/10 text-accent border-accent/20'
                  : 'text-fg/45 hover:text-fg/70 border-transparent'
              }`}
            >
              {tab === 'all' ? 'All' : tab === 'bills' ? 'Bills' : 'Votes'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card className="animate-pulse space-y-3">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="flex gap-3">
              <Skeleton className="w-6 h-6 rounded-md flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-2.5 w-5/6" />
                <Skeleton className="h-2.5 w-1/4" />
              </div>
            </div>
          ))}
        </Card>
      ) : filteredActivity.length === 0 ? (
        <Card padding="none" className="px-5 py-8 text-center">
          <p className="text-[13px] text-fg/45">
            {activityFeed.length === 0
              ? 'No activity yet \u2014 follow politicians and track bills to see updates here.'
              : 'No items in this category yet.'}
          </p>
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden max-h-[560px] overflow-y-auto">
          <StaggerGrid>
            {filteredActivity.map((item, idx) => {
              const isVote = item.politician !== null
              const unread = isNew(item.timestamp)
              const dotColor = isVote
                ? unread ? 'bg-accent' : 'bg-accent/50'
                : unread ? 'bg-fg/50' : 'bg-fg/25'
              const alertDotStyle = item.isAlert ? { backgroundColor: STATUS_STYLES.Stalled.hex } : undefined
              const rowClass = `flex items-start gap-3 pl-[18px] pr-5 py-3 border-l-2 transition-all duration-150 ${
                unread ? 'border-accent bg-accent-deep/[0.04]' : 'border-transparent'
              } ${
                idx < filteredActivity.length - 1 ? 'border-b border-b-edge-soft' : ''
              } ${item.href ? 'hover:bg-raised cursor-pointer' : ''}`
              const inner = (
                <>
                  <div className={`w-1.5 h-1.5 rounded-full mt-[6px] flex-shrink-0 ${item.isAlert ? '' : dotColor}`} style={alertDotStyle} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-snug">
                      {item.politician && (
                        <span className="text-fg font-medium">{item.politician} </span>
                      )}
                      <span className="text-fg/45">{item.action}</span>
                    </p>
                    <p className="text-[13px] text-fg/80 leading-snug mt-0.5">
                      {item.subject}
                    </p>
                  </div>
                  <span className="text-xs text-fg/32 flex-shrink-0 mt-0.5 whitespace-nowrap">{item.date}</span>
                </>
              )
              return (
                <StaggerItem key={item.id}>
                  {item.href ? (
                    <Link to={item.href as any} className={`block ${rowClass}`}>
                      {inner}
                    </Link>
                  ) : (
                    <div className={rowClass}>
                      {inner}
                    </div>
                  )}
                </StaggerItem>
              )
            })}
          </StaggerGrid>
        </Card>
      )}
    </section>
  )
}
