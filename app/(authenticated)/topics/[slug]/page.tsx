'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { slugToTopic } from '@/lib/topics'
import { useAuth } from '@/hooks/useAuth'
import { useTopicPreferences } from '@/hooks/useTopicPreferences'

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.15]', text: 'text-[#B85C38]' },
}

type ApiBill = {
  id: string
  number: string
  title: string
  status: string
}

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
    >
      <defs>
        <pattern id="topo-topic-detail" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
          <ellipse cx="400" cy="300" rx="380" ry="260" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="400" cy="300" rx="320" ry="210" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="405" cy="295" rx="260" ry="165" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="410" cy="290" rx="205" ry="125" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="415" cy="285" rx="155" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="418" cy="282" rx="110" ry="62"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="110" cy="500" rx="140" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="700" cy="90"  rx="160" ry="100" fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="704" cy="87"  rx="110" ry="65"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo-topic-detail)" />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill={filled ? '#9B7FA6' : 'none'} stroke="#9B7FA6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

export default function TopicDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const topic = slugToTopic(slug)

  const { user } = useAuth()
  const { selectedTopics, toggle } = useTopicPreferences(user)

  const [bills, setBills] = useState<ApiBill[]>([])
  const [loadingBills, setLoadingBills] = useState(false)

  const following = topic ? selectedTopics.has(topic) : false
  const handleFollow = () => { if (topic) toggle(topic) }

  useEffect(() => {
    if (!topic) return
    setLoadingBills(true)
    fetch(`/api/bills/by-topic?slug=${slug}&limit=10`)
      .then(r => r.json())
      .then(data => { setBills(data.bills ?? []); setLoadingBills(false) })
      .catch(() => setLoadingBills(false))
  }, [topic, slug])

  if (!topic) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-[#1C1C1A]/40 mb-4">Topic not found.</p>
          <Link href="/topics" className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]">
            ← Back to topics
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <TopoBackground />

      <main className="relative z-10 flex-1 px-6 py-10">
        <div className="max-w-3xl mx-auto space-y-8">

          {/* Back */}
          <Link
            href="/topics"
            className="inline-flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
            Topics
          </Link>

          {/* Header */}
          <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-[#1C1C1A]/38 uppercase tracking-wider mb-2">Topic</p>
                <h1
                  className="text-3xl text-[#1C1C1A] tracking-tight mb-3"
                  style={{ fontFamily: 'var(--font-serif)' }}
                >
                  {topic}
                </h1>
                {!loadingBills && (
                  <p className="text-sm text-[#1C1C1A]/45">
                    {bills.length} bill{bills.length !== 1 ? 's' : ''}
                  </p>
                )}
              </div>

              <button
                onClick={handleFollow}
                className={`inline-flex items-center gap-2 text-sm font-medium rounded-lg px-4 py-2 transition-colors flex-shrink-0 ${
                  following
                    ? 'bg-[#9B7FA6]/10 text-[#9B7FA6] hover:bg-[#9B7FA6]/15'
                    : 'border border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/60 hover:border-[#9B7FA6]/40 hover:text-[#9B7FA6]'
                }`}
              >
                <BookmarkIcon filled={following} />
                {following ? 'Following' : 'Follow topic'}
              </button>
            </div>
          </div>

          {/* Bills */}
          <section>
            <h2 className="text-base text-[#1C1C1A] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
              Related Bills
            </h2>

            {loadingBills ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-[#D6CFC4] h-20 animate-pulse" />
                ))}
              </div>
            ) : bills.length > 0 ? (
              <div className="space-y-3">
                {bills.map(bill => {
                  const s = STATUS_STYLES[bill.status] ?? STATUS_STYLES['Active']
                  return (
                    <Link key={bill.id} href={`/bills/${bill.id}`} className="block group">
                      <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm px-6 py-4 flex items-start justify-between gap-4 hover:shadow transition-shadow">
                        <div className="min-w-0">
                          <p className="text-[11px] font-mono text-[#1C1C1A]/38 mb-1">{bill.number}</p>
                          <p className="text-sm text-[#1C1C1A] leading-snug group-hover:text-[#9B7FA6] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
                            {bill.title}
                          </p>
                        </div>
                        <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                          {bill.status}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-[#D6CFC4] p-8 text-center">
                <p className="text-sm text-[#1C1C1A]/40">No bills found for this topic.</p>
              </div>
            )}

            <div className="mt-3 text-right">
              <Link href="/bills" className="text-xs text-[#9B7FA6] hover:text-[#8a6e95]">
                Browse all bills →
              </Link>
            </div>
          </section>

        </div>
      </main>
    </div>
  )
}
