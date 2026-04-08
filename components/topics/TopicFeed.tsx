'use client'

import Link from 'next/link'
import { topicToSlug, type Topic } from '@/lib/topics'
import { useAuth } from '@/hooks/useAuth'
import { useTopicPreferences } from '@/hooks/useTopicPreferences'
import { useTopicFeed } from '@/hooks/useTopicFeed'

export function TopicFeed() {
  const { user } = useAuth()
  const { selectedTopics, loaded } = useTopicPreferences(user)
  const topics = Array.from(selectedTopics) as Topic[]

  const { feedItems } = useTopicFeed(topics)

  if (!loaded || topics.length === 0) return null
  if (feedItems.length === 0) return null

  return (
    <section className="w-full border-t border-[rgba(28,28,26,0.08)] py-12 bg-[#F5F0E8]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h2 className="text-2xl text-[#1C1C1A] tracking-tight" style={{ fontFamily: 'var(--font-serif)' }}>
              Your Topics
            </h2>
            <p className="text-sm text-[#1C1C1A]/50 mt-1">Recent activity on topics you follow.</p>
          </div>
          <Link href="/topics" className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]">
            Manage →
          </Link>
        </div>

        {/* Topic chips */}
        <div className="flex flex-wrap gap-2 mb-6">
          {topics.map(t => (
            <Link
              key={t}
              href={`/topics/${topicToSlug(t)}`}
              className="text-xs font-medium px-3 py-1.5 rounded-full bg-[#9B7FA6]/10 text-[#9B7FA6] border border-[#9B7FA6]/20 hover:bg-[#9B7FA6]/18 transition-colors"
            >
              {t}
            </Link>
          ))}
        </div>

        {/* Feed items */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {feedItems.map(({ topic, bill }, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-5 flex flex-col gap-3"
            >
              <div className="flex items-center gap-1.5">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#9B7FA6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
                  <line x1="7" y1="7" x2="7.01" y2="7" />
                </svg>
                <span className="text-[10px] text-[#9B7FA6] font-medium truncate">Because you follow {topic}</span>
              </div>
              <div>
                <p className="text-[11px] font-mono text-[#1C1C1A]/38 mb-1">{bill.number}</p>
                <p className="text-sm text-[#1C1C1A] leading-snug" style={{ fontFamily: 'var(--font-serif)' }}>
                  {bill.title}
                </p>
              </div>
              <div className="mt-auto pt-1">
                <Link
                  href="/bills"
                  className="text-xs text-[#9B7FA6]/70 hover:text-[#9B7FA6] transition-colors"
                >
                  View in Bills Tracker →
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
