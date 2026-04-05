'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Navigation } from '@/components/Navigation'
import { createClient } from '@/lib/supabase/client'
import { slugToTopic, topicToSlug, TOPIC_BILLS, TOPIC_POLITICIANS, ALL_TOPICS, type Topic } from '@/lib/topics'

const LS_KEY = 'btb_topics'

type Party = 'Democrat' | 'Republican' | 'Independent'

const PARTY_STYLES: Record<Party, { bg: string; text: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.15]', text: 'text-[#B85C38]' },
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

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0][0]
  return (
    <div className="w-10 h-10 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-xs text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

export default function TopicDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const router = useRouter()
  const topic = slugToTopic(slug)

  const [user, setUser] = useState<User | null>(null)
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load follow state for this topic
  useEffect(() => {
    if (!topic) return
    async function load() {
      if (user) {
        const supabase = createClient()
        const { data } = await supabase
          .from('topic_preferences')
          .select('topic')
          .eq('user_id', user.id)
          .eq('topic', topic)
          .maybeSingle()
        setFollowing(!!data)
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY)
          if (raw) {
            const saved: string[] = JSON.parse(raw)
            setFollowing(saved.includes(topic!))
          }
        } catch {}
      }
    }
    load()
  }, [user, topic])

  const handleFollow = async () => {
    if (!topic) return
    const next = !following
    setFollowing(next)
    setFollowLoading(true)

    if (user) {
      const supabase = createClient()
      const { error } = next
        ? await supabase.from('topic_preferences').insert({ user_id: user.id, topic })
        : await supabase.from('topic_preferences').delete().eq('user_id', user.id).eq('topic', topic)
      if (error) setFollowing(!next)
    } else {
      try {
        const raw = localStorage.getItem(LS_KEY)
        const saved: string[] = raw ? JSON.parse(raw) : []
        const updated = next ? [...new Set([...saved, topic])] : saved.filter(t => t !== topic)
        localStorage.setItem(LS_KEY, JSON.stringify(updated))
      } catch {
        setFollowing(!next)
      }
    }
    setFollowLoading(false)
  }

  if (!topic) {
    return (
      <div className="relative min-h-screen flex flex-col bg-[#F5F0E8]">
        <Navigation />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-[#1C1C1A]/40 mb-4">Topic not found.</p>
            <Link href="/topics" className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]">
              ← Back to topics
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const bills = TOPIC_BILLS[topic] ?? []
  const politicians = TOPIC_POLITICIANS[topic] ?? []

  // Related topics (share some overlap - other topics that have common politicians)
  const relatedTopics = ALL_TOPICS.filter(t => {
    if (t === topic) return false
    return TOPIC_POLITICIANS[t].some(p => politicians.some(q => q.name === p.name))
  }).slice(0, 4)

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F5F0E8] overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <Navigation />

        <main className="flex-1 px-6 py-10">
          <div className="max-w-4xl mx-auto space-y-8">

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
                  <div className="flex items-center gap-3 text-sm text-[#1C1C1A]/45">
                    <span>{bills.length} bill{bills.length !== 1 ? 's' : ''}</span>
                    <span className="text-[#1C1C1A]/20">·</span>
                    <span>{politicians.length} active politician{politicians.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                <button
                  onClick={handleFollow}
                  disabled={followLoading}
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

            {/* Two-column grid */}
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">

              {/* Left: Bills */}
              <section>
                <h2 className="text-base text-[#1C1C1A] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                  Related Bills
                </h2>

                {bills.length > 0 ? (
                  <div className="space-y-3">
                    {bills.map((bill, i) => {
                      const s = STATUS_STYLES[bill.status] ?? STATUS_STYLES['Active']
                      return (
                        <div key={i} className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm px-6 py-4 flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[11px] font-mono text-[#1C1C1A]/38 mb-1">{bill.number}</p>
                            <p className="text-sm text-[#1C1C1A] leading-snug" style={{ fontFamily: 'var(--font-serif)' }}>
                              {bill.title}
                            </p>
                          </div>
                          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
                            {bill.status}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-8 text-center">
                    <p className="text-sm text-[#1C1C1A]/40">No bills found for this topic.</p>
                  </div>
                )}

                <div className="mt-3 text-right">
                  <Link
                    href="/bills"
                    className="text-xs text-[#9B7FA6] hover:text-[#8a6e95]"
                  >
                    Browse all bills →
                  </Link>
                </div>
              </section>

              {/* Right: Politicians + Related topics */}
              <div className="space-y-6">

                {/* Politicians */}
                <section>
                  <h2 className="text-base text-[#1C1C1A] mb-4" style={{ fontFamily: 'var(--font-serif)' }}>
                    Active Politicians
                  </h2>

                  {politicians.length > 0 ? (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm divide-y divide-[rgba(28,28,26,0.06)]">
                      {politicians.map((pol, i) => {
                        const badge = PARTY_STYLES[pol.party as Party] ?? PARTY_STYLES['Independent']
                        return (
                          <Link
                            key={i}
                            href={`/representatives/${pol.bioguideId}`}
                            className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F5F0E8]/60 transition-colors group"
                          >
                            <Initials name={pol.name} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-[#1C1C1A] group-hover:text-[#9B7FA6] transition-colors truncate" style={{ fontFamily: 'var(--font-serif)' }}>
                                {pol.name}
                              </p>
                              <p className="text-xs text-[#1C1C1A]/45 truncate">{pol.title} · {pol.state}</p>
                            </div>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${badge.bg} ${badge.text}`}>
                              {pol.party[0]}
                            </span>
                          </Link>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] p-6 text-center">
                      <p className="text-sm text-[#1C1C1A]/40">No politicians found for this topic.</p>
                    </div>
                  )}
                </section>

                {/* Related topics */}
                {relatedTopics.length > 0 && (
                  <section>
                    <h2 className="text-sm font-medium text-[#1C1C1A]/45 uppercase tracking-wider mb-3">Related Topics</h2>
                    <div className="flex flex-wrap gap-2">
                      {relatedTopics.map(t => (
                        <Link
                          key={t}
                          href={`/topics/${topicToSlug(t)}`}
                          className="text-xs text-[#1C1C1A]/55 bg-white border border-[#D6CFC4] px-3 py-1.5 rounded-full hover:border-[#9B7FA6]/50 hover:text-[#9B7FA6] transition-colors"
                        >
                          {t}
                        </Link>
                      ))}
                    </div>
                  </section>
                )}

              </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  )
}
