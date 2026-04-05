'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Navigation } from '@/components/Navigation'
import { createClient } from '@/lib/supabase/client'
import { ALL_TOPICS, topicToSlug, type Topic } from '@/lib/topics'

type Party = 'Democrat' | 'Republican' | 'Independent'
type BillStatus = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'

const PARTY_STYLES: Record<Party, { bg: string; text: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
}

const STATUS_STYLES: Record<BillStatus, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
}

const MOCK_POLITICIANS: {
  id: string
  name: string
  title: string
  party: Party
  state: string
  topics: Topic[]
}[] = [
  { id: '1', name: 'Margaret Chen',    title: 'U.S. Senator',        party: 'Democrat',    state: 'California', topics: ['Climate & Environment', 'Healthcare', 'Tech & Privacy', 'Education', 'Housing'] },
  { id: '2', name: 'Robert Harmon',    title: 'U.S. Senator',        party: 'Republican',  state: 'California', topics: ['Economy & Jobs', 'Immigration', 'Criminal Justice', 'Foreign Policy'] },
  { id: '3', name: 'Diana Reyes',      title: 'U.S. Representative', party: 'Democrat',    state: 'California', topics: ['Housing', 'Education', 'Voting Rights', 'Social Security'] },
  { id: '4', name: 'Thomas Gallagher', title: 'U.S. Representative', party: 'Republican',  state: 'Texas',      topics: ['Gun Policy', 'Economy & Jobs', 'Immigration'] },
  { id: '5', name: 'Priya Mehta',      title: 'U.S. Representative', party: 'Democrat',    state: 'New York',   topics: ['Tech & Privacy', 'Foreign Policy', 'Criminal Justice', 'Healthcare'] },
  { id: '6', name: 'Samuel Okafor',    title: 'U.S. Senator',        party: 'Independent', state: 'Maine',      topics: ['Social Security', 'Economy & Jobs', 'Foreign Policy', 'Voting Rights'] },
]

const MOCK_BILLS: {
  id: string
  number: string
  title: string
  status: BillStatus
  topics: Topic[]
}[] = [
  { id: 'b1',  number: 'S. 1247',    title: 'Clean Energy Transition Act',        status: 'Active',    topics: ['Climate & Environment'] },
  { id: 'b2',  number: 'H.R. 3892',  title: 'Small Business Tax Relief Act',      status: 'Committee', topics: ['Economy & Jobs'] },
  { id: 'b3',  number: 'H.R. 4401',  title: 'Universal Pre-K Funding Act',        status: 'Committee', topics: ['Education'] },
  { id: 'b4',  number: 'S. 712',     title: 'Medicare Expansion Act',             status: 'Active',    topics: ['Healthcare', 'Social Security'] },
  { id: 'b5',  number: 'H.R. 5503',  title: 'Affordable Housing Development Act', status: 'Stalled',   topics: ['Housing'] },
  { id: 'b6',  number: 'S. 2891',    title: 'Secure Borders Enforcement Act',     status: 'Committee', topics: ['Immigration'] },
  { id: 'b7',  number: 'H.R. 1820',  title: 'Digital Privacy Protection Act',     status: 'Active',    topics: ['Tech & Privacy'] },
  { id: 'b8',  number: 'S. 3304',    title: 'Background Check Expansion Act',     status: 'Stalled',   topics: ['Gun Policy'] },
  { id: 'b9',  number: 'H.R. 6112',  title: 'Voting Access and Security Act',     status: 'Active',    topics: ['Voting Rights'] },
  { id: 'b10', number: 'S. 1788',    title: 'Defense Modernization Act',          status: 'Passed',    topics: ['Foreign Policy'] },
  { id: 'b11', number: 'H.R. 4832',  title: 'Criminal Justice Reform Act',        status: 'Committee', topics: ['Criminal Justice'] },
  { id: 'b12', number: 'S. 2205',    title: 'Social Security Preservation Act',   status: 'Active',    topics: ['Social Security'] },
]

const LS_KEY = 'btb_topics'

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

type MatchedPolitician = typeof MOCK_POLITICIANS[0] & { matched: Topic[] }
type MatchedBill = typeof MOCK_BILLS[0] & { matched: Topic[] }

function PoliticianMatchCard({ pol }: { pol: MatchedPolitician }) {
  const badge = PARTY_STYLES[pol.party]
  return (
    <Link href={`/representatives/${pol.id}`} className="group block h-full">
      <div className="bg-white rounded-xl border border-[#D6CFC4] p-5 flex flex-col gap-3 hover:shadow-sm transition-shadow h-full">
        <div className="flex items-start gap-3">
          <Initials name={pol.name} />
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium text-[#1C1C1A] truncate group-hover:text-[#9B7FA6] transition-colors"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              {pol.name}
            </p>
            <p className="text-xs text-[#1C1C1A]/50 truncate mt-0.5">{pol.title}</p>
            <p className="text-xs text-[#1C1C1A]/38">{pol.state}</p>
          </div>
        </div>

        <span className={`self-start text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
          {pol.party}
        </span>

        <div className="border-t border-[rgba(28,28,26,0.06)] pt-3">
          <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-2">Matches</p>
          <div className="flex flex-wrap gap-1.5">
            {pol.matched.map(t => (
              <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#9B7FA6]/[0.10] text-[#9B7FA6]">
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  )
}

function BillMatchRow({ bill }: { bill: MatchedBill }) {
  const s = STATUS_STYLES[bill.status]
  return (
    <div className="bg-white rounded-xl border border-[#D6CFC4] px-6 py-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-mono text-[#1C1C1A]/38 mb-1">{bill.number}</p>
        <p className="text-sm text-[#1C1C1A] leading-snug mb-2.5" style={{ fontFamily: 'var(--font-serif)' }}>
          {bill.title}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {bill.matched.map(t => (
            <Link
              key={t}
              href={`/topics/${topicToSlug(t)}`}
              onClick={e => e.stopPropagation()}
              className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#9B7FA6]/[0.10] text-[#9B7FA6] hover:bg-[#9B7FA6]/[0.18] transition-colors"
            >
              {t}
            </Link>
          ))}
        </div>
      </div>
      <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${s.bg} ${s.text}`}>
        {bill.status}
      </span>
    </div>
  )
}

export default function TopicsPage() {
  const [selectedTopics, setSelectedTopics] = useState<Set<Topic>>(new Set())
  const [user, setUser] = useState<User | null>(null)
  const [loaded, setLoaded] = useState(false)

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load saved topics on mount
  useEffect(() => {
    async function load() {
      if (user) {
        const supabase = createClient()
        const { data } = await supabase
          .from('topic_preferences')
          .select('topic')
          .eq('user_id', user.id)
        if (data) {
          setSelectedTopics(new Set(data.map((r: { topic: string }) => r.topic as Topic)))
        }
      } else {
        try {
          const raw = localStorage.getItem(LS_KEY)
          if (raw) setSelectedTopics(new Set(JSON.parse(raw) as Topic[]))
        } catch {}
      }
      setLoaded(true)
    }
    load()
  }, [user])

  const toggle = async (t: Topic) => {
    const next = new Set(selectedTopics)
    const isSelected = next.has(t)
    isSelected ? next.delete(t) : next.add(t)
    setSelectedTopics(next)

    if (user) {
      const supabase = createClient()
      if (isSelected) {
        await supabase.from('topic_preferences').delete().eq('user_id', user.id).eq('topic', t)
      } else {
        await supabase.from('topic_preferences').insert({ user_id: user.id, topic: t })
      }
    } else {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify([...next]))
      } catch {}
    }
  }

  const hasSelection = selectedTopics.size > 0

  const matchedPoliticians = useMemo<MatchedPolitician[]>(() =>
    MOCK_POLITICIANS
      .map(p => ({ ...p, matched: p.topics.filter(t => selectedTopics.has(t)) }))
      .filter(p => p.matched.length > 0)
      .sort((a, b) => b.matched.length - a.matched.length),
    [selectedTopics])

  const matchedBills = useMemo<MatchedBill[]>(() =>
    MOCK_BILLS
      .map(b => ({ ...b, matched: b.topics.filter(t => selectedTopics.has(t)) }))
      .filter(b => b.matched.length > 0),
    [selectedTopics])

  return (
    <div className="relative min-h-screen bg-[#F5F0E8] overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col">
        <Navigation />

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
                Select topics to personalize your feed and see aligned politicians.
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
                  onClick={() => {
                    setSelectedTopics(new Set())
                    if (user) {
                      createClient().from('topic_preferences').delete().eq('user_id', user.id)
                    } else {
                      try { localStorage.removeItem(LS_KEY) } catch {}
                    }
                  }}
                  className="text-[#9B7FA6] hover:underline underline-offset-2"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Results */}
            {hasSelection && (
              <div className="flex flex-col gap-12">

                {/* Politicians */}
                <section>
                  <div className="flex items-baseline gap-2.5 mb-5">
                    <h2 className="text-lg text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                      Politicians Who Match Your Topics
                    </h2>
                    <span className="text-sm text-[#1C1C1A]/38">{matchedPoliticians.length} found</span>
                  </div>

                  {matchedPoliticians.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {matchedPoliticians.map(pol => (
                        <PoliticianMatchCard key={pol.id} pol={pol} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#1C1C1A]/40 py-6 text-center">
                      No politicians found for the selected topics.
                    </p>
                  )}
                </section>

                {/* Bills */}
                <section>
                  <div className="flex items-baseline gap-2.5 mb-5">
                    <h2 className="text-lg text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                      Relevant Bills
                    </h2>
                    <span className="text-sm text-[#1C1C1A]/38">{matchedBills.length} found</span>
                  </div>

                  {matchedBills.length > 0 ? (
                    <div className="flex flex-col gap-3">
                      {matchedBills.map(bill => (
                        <BillMatchRow key={bill.id} bill={bill} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#1C1C1A]/40 py-6 text-center">
                      No bills found for the selected topics.
                    </p>
                  )}
                </section>

              </div>
            )}

          </div>
        </main>
      </div>
    </div>
  )
}
