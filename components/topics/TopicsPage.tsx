'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ALL_TOPICS, topicToSlug, type Topic } from '@/lib/topics'
import { useAuth } from '@/hooks/useAuth'
import { useTopicPreferences } from '@/hooks/useTopicPreferences'
import { useTopicBills, type TopicFeedItem } from '@/hooks/useTopicBills'
import { PageHeader } from '@/components/layout/PageHeader'
import type { BillStatus } from '@/lib/types'
import { STATUS_STYLES } from '@/lib/ui'

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.045 }}
    >
      <defs>
        <pattern id="topo-topics" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
          <ellipse cx="400" cy="300" rx="380" ry="260" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="400" cy="300" rx="320" ry="210" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="405" cy="295" rx="260" ry="165" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="410" cy="290" rx="205" ry="125" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="415" cy="285" rx="155" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="418" cy="282" rx="110" ry="62"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="420" cy="280" rx="70"  ry="40"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="422" cy="278" rx="38"  ry="22"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="110" cy="500" rx="140" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="115" cy="496" rx="95"  ry="58"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="118" cy="493" rx="55"  ry="32"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="700" cy="90"  rx="160" ry="100" fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="704" cy="87"  rx="110" ry="65"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="707" cy="85"  rx="65"  ry="38"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="709" cy="83"  rx="30"  ry="18"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo-topics)" />
    </svg>
  )
}

function BillRow({ item }: { item: TopicFeedItem }) {
  const { topic, bill } = item
  const s = STATUS_STYLES[bill.status as BillStatus] ?? STATUS_STYLES['Active']
  const router = useRouter()
  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => router.push(`/bills/${bill.id}`)}
      onKeyDown={e => e.key === 'Enter' && router.push(`/bills/${bill.id}`)}
      className="block group cursor-pointer"
    >
      <div className="bg-white rounded-xl border border-[#D6CFC4] px-6 py-4 flex items-start gap-4 hover:shadow-sm transition-shadow">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-mono text-[#1C1C1A]/38 mb-1">{bill.number}</p>
          <p className="text-sm text-[#1C1C1A] leading-snug mb-2.5 group-hover:text-[#9B7FA6] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
            {bill.title}
          </p>
          <Link
            href={`/topics/${topicToSlug(topic)}`}
            onClick={e => e.stopPropagation()}
            className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#9B7FA6]/[0.10] text-[#9B7FA6] hover:bg-[#9B7FA6]/[0.18] transition-colors"
          >
            {topic}
          </Link>
        </div>
        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
          {bill.status}
        </span>
      </div>
    </div>
  )
}

export default function TopicsPage() {
  const { user } = useAuth()
  const { selectedTopics, toggle, clearAll, loaded } = useTopicPreferences(user)

  const { items: bills, loading: loadingBills } = useTopicBills(selectedTopics)

  const hasSelection = selectedTopics.size > 0

  return (
    <div className="relative flex flex-col overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col">
        <PageHeader title="Topics" />
        <main className="flex-1 px-6 py-14">
          <div className="max-w-3xl mx-auto">

            {/* Header */}
            <div className="text-center mb-10">
              <h1
                className="text-4xl tracking-tight leading-[1.15] mb-3"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                What issues matter to you?
              </h1>
              <p className="text-[#1C1C1A]/60">
                Select topics to personalize your feed and see relevant bills.
                {!user && loaded && (
                  <span className="block text-xs text-[#1C1C1A]/38 mt-1">
                    Your selections are saved locally. Sign in to sync across devices.
                  </span>
                )}
              </p>
            </div>

            {/* Topic pills */}
            <div className="flex flex-wrap gap-3 justify-center mb-6">
              {ALL_TOPICS.map(topic => {
                const selected = selectedTopics.has(topic)
                return (
                  <div key={topic} className="relative group">
                    <button
                      onClick={() => toggle(topic)}
                      className={`px-4 py-2 rounded-full text-sm border transition-colors ${
                        selected
                          ? 'bg-[#9B7FA6] border-[#9B7FA6] text-white'
                          : 'bg-white border-[#D6CFC4] text-[#1C1C1A]/60 hover:border-[#9B7FA6]/60 hover:text-[#9B7FA6]'
                      }`}
                    >
                      {topic}
                    </button>
                    {selected && (
                      <Link
                        href={`/topics/${topicToSlug(topic)}`}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white border border-[#9B7FA6]/30 rounded-full flex items-center justify-center shadow-sm hover:bg-[#9B7FA6]/10 transition-colors"
                        title={`Browse ${topic}`}
                        aria-label={`Browse ${topic} topic page`}
                      >
                        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9B7FA6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17L17 7M7 7h10v10" />
                        </svg>
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Selection count + clear */}
            {hasSelection && (
              <div className="flex items-center justify-between mb-12 text-sm">
                <span className="text-[#1C1C1A]/50">
                  {selectedTopics.size} topic{selectedTopics.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  onClick={clearAll}
                  className="text-[#9B7FA6] hover:underline underline-offset-2"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Bills */}
            {hasSelection && (
              <section>
                <div className="flex items-baseline gap-2.5 mb-5">
                  <h2 className="text-lg text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                    Relevant Bills
                  </h2>
                  {!loadingBills && (
                    <span className="text-sm text-[#1C1C1A]/38">{bills.length} found</span>
                  )}
                </div>

                {loadingBills ? (
                  <div className="flex flex-col gap-3">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="bg-white rounded-xl border border-[#D6CFC4] px-6 py-4 h-20 animate-pulse" />
                    ))}
                  </div>
                ) : bills.length > 0 ? (
                  <>
                    <div className="flex flex-col gap-3">
                      {bills.map((item, i) => (
                        <BillRow key={item.bill.id + i} item={item} />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
                      {Array.from(selectedTopics).map(topic => (
                        <Link
                          key={topic}
                          href={`/topics/${topicToSlug(topic as Topic)}`}
                          className="text-sm text-[#9B7FA6] hover:underline underline-offset-2"
                        >
                          View all {topic} bills
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[#1C1C1A]/40 py-6 text-center">
                    No bills found for the selected topics.
                  </p>
                )}
              </section>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
