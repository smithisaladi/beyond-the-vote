'use client'

import { useState, useMemo } from 'react'
import { Navigation } from '@/components/Navigation'

type Party = 'Democrat' | 'Republican' | 'Independent'
type Status = 'Active' | 'Committee' | 'Stalled' | 'Passed' | 'Failed'
type Category = 'Environment' | 'Economy' | 'Healthcare' | 'Defense' | 'Education' | 'Housing' | 'Technology' | 'Immigration'
type DateFilter = 'all' | 'month' | 'year'

interface Bill {
  id: string
  number: string
  title: string
  sponsor: string
  party: Party
  status: Status
  category: Category
  lastAction: string
  lastActionTimestamp: number
  summary: string
}

const MOCK_BILLS: Bill[] = [
  {
    id: 'b1',
    number: 'S. 1247',
    title: 'Clean Energy Transition Act',
    sponsor: 'Sen. Margaret Chen',
    party: 'Democrat',
    status: 'Active',
    category: 'Environment',
    lastAction: 'Mar 18, 2025',
    lastActionTimestamp: new Date('2025-03-18').getTime(),
    summary: 'Accelerates renewable energy adoption through federal investment in solar, wind, and grid modernization infrastructure.',
  },
  {
    id: 'b2',
    number: 'H.R. 3892',
    title: 'Small Business Tax Relief Act',
    sponsor: 'Rep. James Walsh',
    party: 'Republican',
    status: 'Committee',
    category: 'Economy',
    lastAction: 'Mar 12, 2025',
    lastActionTimestamp: new Date('2025-03-12').getTime(),
    summary: 'Provides targeted tax incentives for small businesses with fewer than 50 employees, reducing the federal tax burden on entrepreneurs.',
  },
  {
    id: 'b3',
    number: 'H.R. 2108',
    title: 'Affordable Housing Investment Act',
    sponsor: 'Rep. Diana Reyes',
    party: 'Democrat',
    status: 'Active',
    category: 'Housing',
    lastAction: 'Mar 5, 2025',
    lastActionTimestamp: new Date('2025-03-05').getTime(),
    summary: 'Allocates $40 billion in federal grants to municipalities for affordable housing construction and rehabilitation programs.',
  },
  {
    id: 'b4',
    number: 'S. 0891',
    title: 'Border Security and Enforcement Act',
    sponsor: 'Sen. Robert Harmon',
    party: 'Republican',
    status: 'Stalled',
    category: 'Immigration',
    lastAction: 'Feb 20, 2025',
    lastActionTimestamp: new Date('2025-02-20').getTime(),
    summary: 'Increases funding for border enforcement personnel and technology systems, and revises asylum processing timelines.',
  },
  {
    id: 'b5',
    number: 'S. 1401',
    title: 'Universal Pre-K Education Act',
    sponsor: 'Sen. Margaret Chen',
    party: 'Democrat',
    status: 'Committee',
    category: 'Education',
    lastAction: 'Feb 14, 2025',
    lastActionTimestamp: new Date('2025-02-14').getTime(),
    summary: 'Establishes federally funded pre-kindergarten education programs in all 50 states, prioritizing underserved communities.',
  },
  {
    id: 'b6',
    number: 'H.R. 4455',
    title: 'Digital Privacy Protection Act',
    sponsor: 'Rep. Sandra Liu',
    party: 'Democrat',
    status: 'Active',
    category: 'Technology',
    lastAction: 'Jan 28, 2025',
    lastActionTimestamp: new Date('2025-01-28').getTime(),
    summary: 'Establishes comprehensive federal data privacy standards for technology companies, including consent requirements and right to deletion.',
  },
  {
    id: 'b7',
    number: 'H.R. 3100',
    title: 'Veterans Healthcare Expansion Act',
    sponsor: 'Rep. Marcus Greene',
    party: 'Republican',
    status: 'Passed',
    category: 'Healthcare',
    lastAction: 'Jan 15, 2025',
    lastActionTimestamp: new Date('2025-01-15').getTime(),
    summary: 'Expands VA hospital capacity and telehealth services for veterans in rural areas, and increases mental health support funding.',
  },
  {
    id: 'b8',
    number: 'S. 0722',
    title: 'Defense Modernization Act',
    sponsor: 'Sen. Robert Harmon',
    party: 'Republican',
    status: 'Active',
    category: 'Defense',
    lastAction: 'Jan 8, 2025',
    lastActionTimestamp: new Date('2025-01-08').getTime(),
    summary: 'Allocates $18 billion for next-generation defense technology procurement, including cybersecurity, drone, and satellite systems.',
  },
  {
    id: 'b9',
    number: 'H.R. 1987',
    title: 'Community Health Centers Funding Act',
    sponsor: 'Rep. Diana Reyes',
    party: 'Democrat',
    status: 'Stalled',
    category: 'Healthcare',
    lastAction: 'Dec 19, 2024',
    lastActionTimestamp: new Date('2024-12-19').getTime(),
    summary: 'Triples federal funding for community health centers in underserved urban and rural areas to expand primary care access.',
  },
  {
    id: 'b10',
    number: 'S. 1633',
    title: 'Agricultural Subsidy Reform Act',
    sponsor: 'Sen. Patricia Moore',
    party: 'Independent',
    status: 'Failed',
    category: 'Economy',
    lastAction: 'Dec 5, 2024',
    lastActionTimestamp: new Date('2024-12-05').getTime(),
    summary: 'Restructures federal agricultural subsidies to prioritize small family farms over large agribusiness operations.',
  },
]

const PARTY_STYLES: Record<Party, { bg: string; text: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
}

const STATUS_STYLES: Record<Status, { bg: string; text: string }> = {
  Active:    { bg: 'bg-[#9B7FA6]/[0.12]', text: 'text-[#9B7FA6]' },
  Committee: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' },
  Stalled:   { bg: 'bg-[#B85C38]/[0.12]', text: 'text-[#B85C38]' },
  Passed:    { bg: 'bg-[#6A9B7B]/[0.12]', text: 'text-[#6A9B7B]' },
  Failed:    { bg: 'bg-[#B85C38]/[0.15]', text: 'text-[#B85C38]' },
}

const ALL_STATUSES: Status[] = ['Active', 'Committee', 'Stalled', 'Passed', 'Failed']
const ALL_CATEGORIES: Category[] = ['Environment', 'Economy', 'Healthcare', 'Defense', 'Education', 'Housing', 'Technology', 'Immigration']

function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
    >
      <defs>
        <pattern id="topo-bills" x="0" y="0" width="800" height="600" patternUnits="userSpaceOnUse">
          <ellipse cx="400" cy="300" rx="380" ry="260" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="400" cy="300" rx="320" ry="210" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="405" cy="295" rx="260" ry="165" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="410" cy="290" rx="205" ry="125" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="415" cy="285" rx="155" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="418" cy="282" rx="110" ry="62"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="110" cy="500" rx="140" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="115" cy="496" rx="95"  ry="58"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="700" cy="90"  rx="160" ry="100" fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="704" cy="87"  rx="110" ry="65"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="707" cy="85"  rx="65"  ry="38"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo-bills)" />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? '#9B7FA6' : 'none'} stroke="#9B7FA6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function FilterCheckbox({
  label,
  checked,
  onChange,
  accent,
}: {
  label: string
  checked: boolean
  onChange: () => void
  accent?: string
}) {
  return (
    <label className="flex items-center gap-2.5 cursor-pointer group">
      <div
        onClick={onChange}
        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
          checked
            ? 'bg-[#9B7FA6] border-[#9B7FA6]'
            : 'bg-white border-[rgba(28,28,26,0.2)] group-hover:border-[#9B7FA6]/60'
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className={`text-sm ${checked ? 'text-[#1C1C1A]' : 'text-[#1C1C1A]/60'}`} style={accent ? { color: checked ? accent : undefined } : {}}>
        {label}
      </span>
    </label>
  )
}

function BillCard({ bill, tracked, onToggleTrack }: { bill: Bill; tracked: boolean; onToggleTrack: () => void }) {
  const party = PARTY_STYLES[bill.party]
  const status = STATUS_STYLES[bill.status]

  return (
    <article className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm hover:shadow-md transition-shadow p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Top meta row */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs font-mono text-[#1C1C1A]/40 tracking-wide">{bill.number}</span>
            <span className="text-xs text-[#1C1C1A]/20">·</span>
            <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${status.bg} ${status.text}`}>
              {bill.status}
            </span>
            <span className="text-xs text-[#1C1C1A]/20">·</span>
            <span className="text-xs text-[#1C1C1A]/40">{bill.category}</span>
          </div>

          {/* Title */}
          <h2 className="text-lg text-[#1C1C1A] leading-snug mb-2" style={{ fontFamily: 'var(--font-serif)' }}>
            {bill.title}
          </h2>

          {/* Summary */}
          <p className="text-sm text-[#1C1C1A]/55 leading-relaxed mb-4 line-clamp-2">
            {bill.summary}
          </p>

          {/* Bottom row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-[#1C1C1A]/60">{bill.sponsor}</span>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${party.bg} ${party.text}`}>
              {bill.party}
            </span>
            <span className="text-xs text-[#1C1C1A]/25">·</span>
            <span className="text-xs text-[#1C1C1A]/40">Last action {bill.lastAction}</span>
          </div>
        </div>

        {/* Track button */}
        <button
          onClick={onToggleTrack}
          aria-label={tracked ? 'Untrack bill' : 'Track bill'}
          className="flex-shrink-0 p-2 rounded-lg hover:bg-[#9B7FA6]/8 transition-colors mt-0.5"
        >
          <BookmarkIcon filled={tracked} />
        </button>
      </div>
    </article>
  )
}

export default function BillsPage() {
  const [query, setQuery] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(new Set())
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')
  const [trackedBills, setTrackedBills] = useState<Set<string>>(new Set())

  const toggleStatus = (s: Status) =>
    setSelectedStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })

  const toggleCategory = (c: Category) =>
    setSelectedCategories(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })

  const toggleTrack = (id: string) =>
    setTrackedBills(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })

  const now = Date.now()
  const filtered = useMemo(() => {
    return MOCK_BILLS.filter(bill => {
      if (query) {
        const q = query.toLowerCase()
        if (
          !bill.title.toLowerCase().includes(q) &&
          !bill.number.toLowerCase().includes(q) &&
          !bill.sponsor.toLowerCase().includes(q) &&
          !bill.summary.toLowerCase().includes(q)
        ) return false
      }
      if (selectedStatuses.size > 0 && !selectedStatuses.has(bill.status)) return false
      if (selectedCategories.size > 0 && !selectedCategories.has(bill.category)) return false
      if (dateFilter === 'month' && now - bill.lastActionTimestamp > 30 * 24 * 60 * 60 * 1000) return false
      if (dateFilter === 'year' && now - bill.lastActionTimestamp > 365 * 24 * 60 * 60 * 1000) return false
      return true
    })
  }, [query, selectedStatuses, selectedCategories, dateFilter, now])

  const hasFilters = selectedStatuses.size > 0 || selectedCategories.size > 0 || dateFilter !== 'all'

  const clearFilters = () => {
    setSelectedStatuses(new Set())
    setSelectedCategories(new Set())
    setDateFilter('all')
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#F5F0E8] overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <Navigation />

        <main className="flex-1 px-6 py-10">
          <div className="max-w-6xl mx-auto">

            {/* Page header + search */}
            <div className="mb-8">
              <h1
                className="text-4xl text-[#1C1C1A] mb-1 tracking-tight"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                Bill Tracker
              </h1>
              <p className="text-sm text-[#1C1C1A]/50 mb-6">
                Follow legislation that matters to you.
              </p>

              {/* Search */}
              <div className="flex items-center gap-3 bg-white rounded-lg border border-[rgba(28,28,26,0.15)] px-4 py-3 shadow-sm max-w-2xl">
                <span className="text-[#1C1C1A]/35 flex-shrink-0">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search bills by title, number, or sponsor…"
                  className="flex-1 bg-transparent outline-none text-sm text-[#1C1C1A] placeholder:text-[#1C1C1A]/40"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="text-[#1C1C1A]/35 hover:text-[#1C1C1A]/60 flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <div className="flex gap-8 items-start">

              {/* Sidebar */}
              <aside className="w-52 flex-shrink-0 sticky top-6">
                <div className="bg-[#EAE5DB] rounded-xl border border-[#D6CFC4] p-5 space-y-6">

                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#1C1C1A]/50 uppercase tracking-wider">Filters</span>
                    {hasFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-[#9B7FA6] hover:text-[#8a6e95]"
                      >
                        Clear
                      </button>
                    )}
                  </div>

                  {/* Status */}
                  <div>
                    <p className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-3">Status</p>
                    <div className="space-y-2.5">
                      {ALL_STATUSES.map(s => (
                        <FilterCheckbox
                          key={s}
                          label={s}
                          checked={selectedStatuses.has(s)}
                          onChange={() => toggleStatus(s)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-[rgba(28,28,26,0.08)]" />

                  {/* Category */}
                  <div>
                    <p className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-3">Category</p>
                    <div className="space-y-2.5">
                      {ALL_CATEGORIES.map(c => (
                        <FilterCheckbox
                          key={c}
                          label={c}
                          checked={selectedCategories.has(c)}
                          onChange={() => toggleCategory(c)}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="border-t border-[rgba(28,28,26,0.08)]" />

                  {/* Date */}
                  <div>
                    <p className="text-xs font-medium text-[#1C1C1A]/40 uppercase tracking-wider mb-3">Last Action</p>
                    <div className="space-y-2.5">
                      {([
                        { key: 'all', label: 'All time' },
                        { key: 'month', label: 'Past month' },
                        { key: 'year', label: 'Past year' },
                      ] as { key: DateFilter; label: string }[]).map(opt => (
                        <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer group">
                          <div
                            onClick={() => setDateFilter(opt.key)}
                            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                              dateFilter === opt.key
                                ? 'border-[#9B7FA6]'
                                : 'bg-white border-[rgba(28,28,26,0.2)] group-hover:border-[#9B7FA6]/60'
                            }`}
                          >
                            {dateFilter === opt.key && (
                              <div className="w-2 h-2 rounded-full bg-[#9B7FA6]" />
                            )}
                          </div>
                          <span className={`text-sm ${dateFilter === opt.key ? 'text-[#1C1C1A]' : 'text-[#1C1C1A]/60'}`}>
                            {opt.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </aside>

              {/* Bill list */}
              <div className="flex-1 min-w-0">
                {/* Result count */}
                <p className="text-xs text-[#1C1C1A]/40 mb-4">
                  {filtered.length === MOCK_BILLS.length
                    ? `${filtered.length} bills`
                    : `${filtered.length} of ${MOCK_BILLS.length} bills`}
                  {trackedBills.size > 0 && (
                    <span className="ml-2 text-[#9B7FA6]">· {trackedBills.size} tracked</span>
                  )}
                </p>

                {filtered.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-12 text-center">
                    <p className="text-[#1C1C1A]/40 text-sm">No bills match your filters.</p>
                    <button
                      onClick={() => { setQuery(''); clearFilters() }}
                      className="mt-3 text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
                    >
                      Clear all filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filtered.map(bill => (
                      <BillCard
                        key={bill.id}
                        bill={bill}
                        tracked={trackedBills.has(bill.id)}
                        onToggleTrack={() => toggleTrack(bill.id)}
                      />
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
