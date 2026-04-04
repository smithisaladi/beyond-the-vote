'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'
import { Navigation } from '@/components/Navigation'

type Party = 'Democrat' | 'Republican' | 'Independent'

const PARTY_STYLES: Record<Party, { bg: string; text: string; label: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]',  label: 'Democrat' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]',  label: 'Republican' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]',  label: 'Independent' },
}

const MOCK_POLITICIANS: Record<string, {
  name: string
  title: string
  party: Party
  state: string
  district?: string
  since: string
  photo: string | null
  stats: { yearsInOffice: number; attendance: number; ideologyScore: number }
  votes: { id: string; bill: string; date: string; vote: 'Yea' | 'Nay' }[]
  bills: { id: string; name: string; status: 'Passed' | 'Pending' | 'Failed'; date: string }[]
  donors: { rank: number; name: string; amount: string; category: string }[]
}> = {
  '1': {
    name: 'Margaret Chen',
    title: 'U.S. Senator',
    party: 'Democrat',
    state: 'California',
    since: '2018',
    photo: null,
    stats: { yearsInOffice: 7, attendance: 94, ideologyScore: 28 },
    votes: [
      { id: 'v1', bill: 'Infrastructure Investment Act', date: 'Mar 15, 2025', vote: 'Yea' },
      { id: 'v2', bill: 'Climate Resilience Fund', date: 'Feb 28, 2025', vote: 'Yea' },
      { id: 'v3', bill: 'Defense Appropriations Act', date: 'Feb 10, 2025', vote: 'Nay' },
      { id: 'v4', bill: 'Digital Privacy Protection Act', date: 'Jan 22, 2025', vote: 'Yea' },
      { id: 'v5', bill: 'Agricultural Subsidy Reform', date: 'Jan 8, 2025', vote: 'Nay' },
    ],
    bills: [
      { id: 'b1', name: 'Clean Water Access Act', status: 'Passed', date: 'Jan 2025' },
      { id: 'b2', name: 'Universal Pre-K Funding Act', status: 'Pending', date: 'Feb 2025' },
      { id: 'b3', name: 'Broadband Expansion Act', status: 'Passed', date: 'Nov 2024' },
      { id: 'b4', name: 'Housing Affordability Act', status: 'Failed', date: 'Sep 2024' },
    ],
    donors: [
      { rank: 1, name: 'Tech Industry PAC', amount: '$245,000', category: 'Technology' },
      { rank: 2, name: 'Healthcare United', amount: '$180,000', category: 'Healthcare' },
      { rank: 3, name: 'Clean Energy Coalition', amount: '$142,000', category: 'Energy' },
      { rank: 4, name: 'California Teachers Assoc.', amount: '$98,000', category: 'Education' },
      { rank: 5, name: 'Real Estate Developers PAC', amount: '$76,000', category: 'Real Estate' },
    ],
  },
  '2': {
    name: 'Robert Harmon',
    title: 'U.S. Senator',
    party: 'Republican',
    state: 'California',
    since: '2014',
    photo: null,
    stats: { yearsInOffice: 11, attendance: 88, ideologyScore: 72 },
    votes: [
      { id: 'v1', bill: 'Tax Relief for Small Business Act', date: 'Mar 12, 2025', vote: 'Yea' },
      { id: 'v2', bill: 'Border Security Enhancement Act', date: 'Feb 25, 2025', vote: 'Yea' },
      { id: 'v3', bill: 'Climate Resilience Fund', date: 'Feb 28, 2025', vote: 'Nay' },
      { id: 'v4', bill: 'Infrastructure Investment Act', date: 'Mar 15, 2025', vote: 'Yea' },
      { id: 'v5', bill: 'Digital Privacy Protection Act', date: 'Jan 22, 2025', vote: 'Nay' },
    ],
    bills: [
      { id: 'b1', name: 'Regulatory Burden Reduction Act', status: 'Pending', date: 'Mar 2025' },
      { id: 'b2', name: 'Veterans Healthcare Access Act', status: 'Passed', date: 'Dec 2024' },
      { id: 'b3', name: 'Energy Independence Act', status: 'Failed', date: 'Oct 2024' },
      { id: 'b4', name: 'Second Amendment Protection Act', status: 'Pending', date: 'Jan 2025' },
    ],
    donors: [
      { rank: 1, name: 'Energy Producers Alliance', amount: '$312,000', category: 'Energy' },
      { rank: 2, name: 'National Rifle Association PAC', amount: '$220,000', category: 'Advocacy' },
      { rank: 3, name: 'Financial Services Roundtable', amount: '$175,000', category: 'Finance' },
      { rank: 4, name: 'Defense Contractors Assoc.', amount: '$134,000', category: 'Defense' },
      { rank: 5, name: 'California Business Council', amount: '$89,000', category: 'Business' },
    ],
  },
  '3': {
    name: 'Diana Reyes',
    title: 'U.S. Representative',
    party: 'Democrat',
    state: 'California',
    district: '12th District',
    since: '2020',
    photo: null,
    stats: { yearsInOffice: 5, attendance: 97, ideologyScore: 31 },
    votes: [
      { id: 'v1', bill: 'Affordable Housing Act', date: 'Mar 18, 2025', vote: 'Yea' },
      { id: 'v2', bill: 'Student Loan Relief Act', date: 'Mar 5, 2025', vote: 'Yea' },
      { id: 'v3', bill: 'Defense Appropriations Act', date: 'Feb 10, 2025', vote: 'Nay' },
      { id: 'v4', bill: 'Infrastructure Investment Act', date: 'Mar 15, 2025', vote: 'Yea' },
      { id: 'v5', bill: 'Agricultural Subsidy Reform', date: 'Jan 8, 2025', vote: 'Yea' },
    ],
    bills: [
      { id: 'b1', name: 'Community Health Centers Act', status: 'Passed', date: 'Feb 2025' },
      { id: 'b2', name: 'Immigrant Integration Act', status: 'Pending', date: 'Mar 2025' },
      { id: 'b3', name: 'Living Wage Act', status: 'Failed', date: 'Nov 2024' },
      { id: 'b4', name: 'Public Transit Funding Act', status: 'Passed', date: 'Aug 2024' },
    ],
    donors: [
      { rank: 1, name: 'SEIU Political Action Fund', amount: '$198,000', category: 'Labor' },
      { rank: 2, name: 'Environmental Defense PAC', amount: '$154,000', category: 'Environment' },
      { rank: 3, name: 'Silicon Valley Democrats', amount: '$127,000', category: 'Technology' },
      { rank: 4, name: 'California Nurses Assoc.', amount: '$91,000', category: 'Healthcare' },
      { rank: 5, name: 'Latino Victory Fund', amount: '$68,000', category: 'Advocacy' },
    ],
  },
}

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
    : parts[0][0]
  return (
    <div className="w-24 h-24 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-2xl text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

const STATUS_STYLES = {
  Passed:  { bg: 'bg-[#9B7FA6]/10', text: 'text-[#9B7FA6]' },
  Pending: { bg: 'bg-[#8A8A7A]/10', text: 'text-[#8A8A7A]' },
  Failed:  { bg: 'bg-[#B85C38]/10', text: 'text-[#B85C38]' },
}

type Tab = 'votes' | 'bills' | 'donors'

export default function PoliticianProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [following, setFollowing] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>('votes')

  const politician = MOCK_POLITICIANS[id]

  if (!politician) {
    return (
      <div className="relative min-h-screen flex flex-col bg-[#F5F0E8] overflow-hidden">
        <TopoBackground />
        <div className="relative z-10 flex flex-col flex-1">
          <Navigation />
          <main className="flex-1 flex items-center justify-center px-6">
            <div className="text-center">
              <p className="text-[#1C1C1A]/40 mb-4">Representative not found.</p>
              <button
                onClick={() => router.back()}
                className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
              >
                ← Back to results
              </button>
            </div>
          </main>
        </div>
      </div>
    )
  }

  const badge = PARTY_STYLES[politician.party]
  const { stats, votes, bills, donors } = politician

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

                  <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start mb-4">
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                    <span className="text-xs text-[#1C1C1A]/40">·</span>
                    <span className="text-xs text-[#1C1C1A]/50">{politician.state}</span>
                    {politician.district && (
                      <>
                        <span className="text-xs text-[#1C1C1A]/40">·</span>
                        <span className="text-xs text-[#1C1C1A]/50">{politician.district}</span>
                      </>
                    )}
                    <span className="text-xs text-[#1C1C1A]/40">·</span>
                    <span className="text-xs text-[#1C1C1A]/40">Since {politician.since}</span>
                  </div>
                </div>

                <button
                  onClick={() => setFollowing(f => !f)}
                  className={`flex-shrink-0 px-6 py-2.5 rounded-lg text-sm border transition-colors ${
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
                {/* Tab bar */}
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

                {/* Tab content */}
                <div className="divide-y divide-[rgba(28,28,26,0.06)]">
                  {activeTab === 'votes' && votes.map(v => (
                    <div key={v.id} className="flex items-center justify-between px-6 py-4">
                      <div>
                        <p className="text-sm text-[#1C1C1A]">{v.bill}</p>
                        <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{v.date}</p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${
                        v.vote === 'Yea'
                          ? 'bg-[#9B7FA6]/10 text-[#9B7FA6]'
                          : 'bg-[#B85C38]/10 text-[#B85C38]'
                      }`}>
                        {v.vote}
                      </span>
                    </div>
                  ))}

                  {activeTab === 'bills' && bills.map(b => (
                    <div key={b.id} className="flex items-center justify-between px-6 py-4">
                      <div>
                        <p className="text-sm text-[#1C1C1A]">{b.name}</p>
                        <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{b.date}</p>
                      </div>
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${STATUS_STYLES[b.status].bg} ${STATUS_STYLES[b.status].text}`}>
                        {b.status}
                      </span>
                    </div>
                  ))}

                  {activeTab === 'donors' && donors.map(d => (
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
                </div>
              </div>

              {/* Stats sidebar */}
              <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 flex flex-col gap-6">
                {/* Years in office */}
                <div>
                  <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-1">Years in Office</p>
                  <p className="text-3xl font-medium text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
                    {stats.yearsInOffice}
                  </p>
                </div>

                {/* Attendance */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide">Attendance Rate</p>
                    <p className="text-sm font-medium text-[#1C1C1A]">{stats.attendance}%</p>
                  </div>
                  <div className="h-1.5 bg-[#E8E3DA] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#9B7FA6] rounded-full"
                      style={{ width: `${stats.attendance}%` }}
                    />
                  </div>
                </div>

                {/* Ideology score */}
                <div>
                  <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-3">Ideology Score</p>
                  <div className="relative h-1.5 bg-gradient-to-r from-[#7B8FA8] to-[#A87B7B] rounded-full mb-2">
                    <div
                      className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#9B7FA6] rounded-full shadow-sm"
                      style={{ left: `calc(${stats.ideologyScore}% - 6px)` }}
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-xs text-[#7B8FA8]">Progressive</span>
                    <span className="text-xs text-[#A87B7B]">Conservative</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
