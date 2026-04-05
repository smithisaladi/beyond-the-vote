'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { Navigation } from '@/components/Navigation'
import { SignInModal } from '@/components/SignInModal'
import { SignUpModal } from '@/components/SignUpModal'
import { createClient } from '@/lib/supabase/client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Party = 'Democrat' | 'Republican' | 'Independent'
type BillStatus = 'Passed' | 'Pending' | 'Failed'
type Tab = 'votes' | 'bills' | 'donors'

interface PoliticianVote {
  id: string
  bill: string
  date: string
  vote: 'Yea' | 'Nay'
}

interface PoliticianBill {
  id: string
  name: string
  number: string
  status: BillStatus
  date: string
}

interface Donor {
  rank: number
  name: string
  amount: string
  category: string
}

interface Committee {
  name: string
  url: string | null
  title: string | null
}

interface Politician {
  id: string
  bioguideId: string
  name: string
  title: string
  party: Party
  state: string
  stateCode: string
  district?: string
  since: string | null
  photo: string | null
  photoCredit: string | null
  website: string | null
  address: string | null
  phone: string | null
  fecUrl: string | null
  nextElectionYear: number | null
  stats: {
    yearsInOffice: number
    attendance: number | null
    ideologyScore: number | null
  }
  votes: PoliticianVote[]
  bills: PoliticianBill[]
  donors: Donor[]
  committees: Committee[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PARTY_STYLES: Record<Party, { bg: string; text: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
}

const BILL_STATUS_STYLES: Record<BillStatus, { bg: string; text: string }> = {
  Passed:  { bg: 'bg-[#9B7FA6]/10', text: 'text-[#9B7FA6]' },
  Pending: { bg: 'bg-[#8A8A7A]/10', text: 'text-[#8A8A7A]' },
  Failed:  { bg: 'bg-[#B85C38]/10', text: 'text-[#B85C38]' },
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.045 }}
    >
      <defs>
        <pattern id="topo" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
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
      <rect width="100%" height="100%" fill="url(#topo)" />
    </svg>
  )
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0]?.[0] ?? '?'
  return (
    <div className="w-24 h-24 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-2xl text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="h-5 w-28 bg-[#E8E3DA] rounded" />
      <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 sm:p-8">
        <div className="flex gap-6">
          <div className="w-24 h-24 rounded-full bg-[#E8E3DA] flex-shrink-0" />
          <div className="flex-1 space-y-3 pt-2">
            <div className="h-7 bg-[#E8E3DA] rounded w-56" />
            <div className="h-4 bg-[#E8E3DA] rounded w-36" />
            <div className="h-4 bg-[#E8E3DA] rounded w-48" />
          </div>
          <div className="w-24 h-9 bg-[#E8E3DA] rounded-lg flex-shrink-0" />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm h-64" />
        <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm h-64" />
      </div>
    </div>
  )
}

function ErrorState({ message, onBack }: { message: string; onBack: () => void }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="text-center">
        <p className="text-[#1C1C1A]/40 mb-4">{message}</p>
        <button
          onClick={onBack}
          className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
        >
          ← Back to results
        </button>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PoliticianProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()

  const [politician, setPolitician] = useState<Politician | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('votes')

  const [user, setUser] = useState<User | null>(null)
  const [following, setFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Fetch politician
  useEffect(() => {
    setLoading(true)
    setError(null)
    fetch(`/api/politicians/${id}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Failed to load')
        setPolitician(data.politician)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [id])

  // Check follow state
  useEffect(() => {
    if (!user) { setFollowing(false); return }
    const supabase = createClient()
    supabase
      .from('followed_politicians')
      .select('politician_id')
      .eq('user_id', user.id)
      .eq('politician_id', id)
      .maybeSingle()
      .then(({ data }) => setFollowing(!!data))
  }, [user, id])

  const handleFollow = async () => {
    if (!user) {
      setShowSignIn(true)
      return
    }

    const supabase = createClient()
    const next = !following
    setFollowing(next) // optimistic
    setFollowLoading(true)

    const { error } = next
      ? await supabase.from('followed_politicians').insert({ user_id: user.id, politician_id: id })
      : await supabase.from('followed_politicians').delete().eq('user_id', user.id).eq('politician_id', id)

    if (error) setFollowing(!next) // revert on failure
    setFollowLoading(false)
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'votes', label: 'Recent Votes' },
    { key: 'bills', label: 'Sponsored Bills' },
    { key: 'donors', label: 'Top Donors' },
  ]

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F5F0E8] overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <Navigation />

        <main className="flex-1 px-6 py-10">
          {loading ? (
            <ProfileSkeleton />
          ) : error ? (
            <ErrorState
              message={error === 'Politician not found' ? 'Representative not found.' : 'Failed to load representative data.'}
              onBack={() => router.back()}
            />
          ) : !politician ? null : (
            <div className="max-w-6xl mx-auto space-y-6">

              {/* Back link */}
              <button
                onClick={() => router.back()}
                className="flex items-center gap-2 text-sm text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 5l-7 7 7 7" />
                </svg>
                Back to results
              </button>

              {/* Hero card */}
              <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 sm:p-8">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                  {politician.photo
                    ? <img src={politician.photo} alt={politician.name} className="w-24 h-24 rounded-full object-cover flex-shrink-0" />
                    : <Initials name={politician.name} />
                  }

                  <div className="flex-1 text-center sm:text-left">
                    <h1 className="text-3xl text-[#1C1C1A] mb-1" style={{ fontFamily: 'var(--font-serif)' }}>
                      {politician.name}
                    </h1>
                    <p className="text-sm text-[#1C1C1A]/60 mb-3">{politician.title}</p>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start mb-4">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PARTY_STYLES[politician.party].bg} ${PARTY_STYLES[politician.party].text}`}>
                        {politician.party}
                      </span>
                      <span className="text-xs text-[#1C1C1A]/40">·</span>
                      <span className="text-xs text-[#1C1C1A]/50">{politician.state}</span>
                      {politician.district && (
                        <>
                          <span className="text-xs text-[#1C1C1A]/40">·</span>
                          <span className="text-xs text-[#1C1C1A]/50">{politician.district}</span>
                        </>
                      )}
                      {politician.since && (
                        <>
                          <span className="text-xs text-[#1C1C1A]/40">·</span>
                          <span className="text-xs text-[#1C1C1A]/40">Since {politician.since}</span>
                        </>
                      )}
                    </div>

                    {/* Contact info */}
                    <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
                      {politician.website && (
                        <a
                          href={politician.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 text-xs text-[#9B7FA6] hover:text-[#8a6e95] transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                          </svg>
                          Official website
                        </a>
                      )}
                      {politician.phone && (
                        <a
                          href={`tel:${politician.phone}`}
                          className="flex items-center gap-1.5 text-xs text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                          </svg>
                          {politician.phone}
                        </a>
                      )}
                      {politician.address && (
                        <span className="flex items-center gap-1.5 text-xs text-[#1C1C1A]/40">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                            <circle cx="12" cy="10" r="3" />
                          </svg>
                          {politician.address}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Follow button */}
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`flex-shrink-0 px-6 py-2.5 rounded-lg text-sm border transition-colors disabled:opacity-60 ${
                      following
                        ? 'bg-[#9B7FA6] border-[#9B7FA6] text-white'
                        : 'bg-transparent border-[#9B7FA6] text-[#9B7FA6] hover:bg-[#9B7FA6] hover:text-white'
                    }`}
                  >
                    {following ? 'Following ✓' : 'Follow'}
                  </button>
                </div>
              </div>

              {/* Two-column layout */}
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 items-start">

                {/* Tab panel */}
                <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm overflow-hidden">
                  <div className="flex border-b border-[rgba(28,28,26,0.08)]">
                    {tabs.map(tab => (
                      <button
                        key={tab.key}
                        onClick={() => setActiveTab(tab.key)}
                        className={`px-5 py-4 text-sm font-medium transition-colors border-b-2 -mb-px ${
                          activeTab === tab.key
                            ? 'border-[#9B7FA6] text-[#1C1C1A]'
                            : 'border-transparent text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <div className="divide-y divide-[rgba(28,28,26,0.06)]">

                    {/* Votes */}
                    {activeTab === 'votes' && (
                      (politician.votes?.length ?? 0) === 0 ? (
                        <p className="px-6 py-8 text-sm text-[#1C1C1A]/40 text-center">No recent votes found.</p>
                      ) : politician.votes.map(v => (
                        <div key={v.id} className="flex items-center justify-between px-6 py-4">
                          <div>
                            <p className="text-sm text-[#1C1C1A]">{v.bill}</p>
                            <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{v.date}</p>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${
                            v.vote === 'Yea' ? 'bg-[#9B7FA6]/10 text-[#9B7FA6]' : 'bg-[#B85C38]/10 text-[#B85C38]'
                          }`}>
                            {v.vote}
                          </span>
                        </div>
                      ))
                    )}

                    {/* Bills */}
                    {activeTab === 'bills' && (
                      (politician.bills?.length ?? 0) === 0 ? (
                        <p className="px-6 py-8 text-sm text-[#1C1C1A]/40 text-center">No sponsored bills found.</p>
                      ) : politician.bills.map(b => (
                        <div key={b.id} className="flex items-center justify-between px-6 py-4">
                          <div>
                            <p className="text-sm text-[#1C1C1A]">{b.name}</p>
                            <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{b.number} · {b.date}</p>
                          </div>
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${BILL_STATUS_STYLES[b.status].bg} ${BILL_STATUS_STYLES[b.status].text}`}>
                            {b.status}
                          </span>
                        </div>
                      ))
                    )}

                    {/* Donors */}
                    {activeTab === 'donors' && (
                      (politician.donors?.length ?? 0) === 0 ? (
                        <div className="px-6 py-8 text-center">
                          <p className="text-sm text-[#1C1C1A]/40 mb-2">Donor data unavailable.</p>
                          {politician.fecUrl && (
                            <a
                              href={politician.fecUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#9B7FA6] hover:text-[#8a6e95]"
                            >
                              View on FEC →
                            </a>
                          )}
                        </div>
                      ) : (
                        <>
                          {politician.donors.map(d => (
                            <div key={d.rank} className="flex items-center gap-4 px-6 py-4">
                              <span className="text-sm text-[#1C1C1A]/30 font-medium w-5 text-center flex-shrink-0">
                                {d.rank}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-[#1C1C1A] truncate">{d.name}</p>
                                <span className="text-xs text-[#1C1C1A]/40">{d.category}</span>
                              </div>
                              <span className="text-sm font-medium text-[#1C1C1A] flex-shrink-0">{d.amount}</span>
                            </div>
                          ))}
                          {politician.fecUrl && (
                            <div className="px-6 py-3 border-t border-[rgba(28,28,26,0.06)]">
                              <a
                                href={politician.fecUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-[#1C1C1A]/40 hover:text-[#9B7FA6] transition-colors"
                              >
                                Data via FEC →
                              </a>
                            </div>
                          )}
                        </>
                      )
                    )}
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">

                  {/* Stats */}
                  <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 flex flex-col gap-6">
                    <div>
                      <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-1">Years in Office</p>
                      <p className="text-3xl font-medium text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                        {politician.stats.yearsInOffice}
                      </p>
                    </div>

                    {politician.stats.attendance !== null && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide">Attendance Rate</p>
                          <p className="text-sm font-medium text-[#1C1C1A]">{politician.stats.attendance}%</p>
                        </div>
                        <div className="h-1.5 bg-[#E8E3DA] rounded-full overflow-hidden">
                          <div className="h-full bg-[#9B7FA6] rounded-full" style={{ width: `${politician.stats.attendance}%` }} />
                        </div>
                      </div>
                    )}

                    {politician.stats.ideologyScore !== null && (
                      <div>
                        <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-3">Ideology Score</p>
                        <div className="relative h-1.5 bg-gradient-to-r from-[#7B8FA8] to-[#A87B7B] rounded-full mb-2">
                          <div
                            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#9B7FA6] rounded-full shadow-sm"
                            style={{ left: `calc(${politician.stats.ideologyScore}% - 6px)` }}
                          />
                        </div>
                        <div className="flex justify-between">
                          <span className="text-xs text-[#7B8FA8]">Progressive</span>
                          <span className="text-xs text-[#A87B7B]">Conservative</span>
                        </div>
                      </div>
                    )}

                    {politician.nextElectionYear && (
                      <div>
                        <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-1">Next Election</p>
                        <p className="text-2xl font-medium text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                          {politician.nextElectionYear}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Committees */}
                  {politician.committees.length > 0 && (
                    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6">
                      <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-3">Committees</p>
                      <ul className="space-y-2">
                        {politician.committees.map((c, i) => (
                          <li key={i} className="flex flex-col gap-0.5">
                            {c.url ? (
                              <a
                                href={c.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-[#1C1C1A] hover:text-[#9B7FA6] transition-colors leading-snug"
                              >
                                {c.name}
                              </a>
                            ) : (
                              <span className="text-sm text-[#1C1C1A] leading-snug">{c.name}</span>
                            )}
                            {c.title && (
                              <span className="text-xs text-[#1C1C1A]/40">{c.title}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}
        </main>
      </div>

      <SignInModal
        isOpen={showSignIn}
        onClose={() => setShowSignIn(false)}
        onSwitchToSignUp={() => { setShowSignIn(false); setShowSignUp(true) }}
      />
      <SignUpModal
        isOpen={showSignUp}
        onClose={() => setShowSignUp(false)}
        onSwitchToSignIn={() => { setShowSignUp(false); setShowSignIn(true) }}
      />
    </div>
  )
}
