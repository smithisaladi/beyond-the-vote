'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { SignInModal } from '@/components/auth/SignInModal'
import { SignUpModal } from '@/components/auth/SignUpModal'
import { useAuth } from '@/hooks/useAuth'
import { useBillFilters } from '@/hooks/useBillFilters'
import { useFetchBills, type Bill, type BillFilters } from '@/hooks/useFetchBills'
import { useTrackedBills } from '@/hooks/useTrackedBills'
import { useDebounce } from '@/hooks/useDebounce'
import { PageHeader } from '@/components/layout/PageHeader'
import type { BillStatus as Status } from '@/lib/types'
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import { ALL_TOPICS, TOPIC_TO_CATEGORY, type Topic } from '@/lib/topics'

type DateFilter = 'all' | 'month' | 'year'
type DropdownId = 'status' | 'date' | 'topics' | null

const ALL_STATUSES: Status[] = ['Active', 'Committee', 'Stalled', 'Passed', 'Failed']

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
}: {
  label: string
  checked: boolean
  onChange: () => void
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
      <span className={`text-sm ${checked ? 'text-[#1C1C1A]' : 'text-[#1C1C1A]/60'}`}>
        {label}
      </span>
    </label>
  )
}

function BillCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm p-6 animate-pulse">
      <div className="flex gap-4">
        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <div className="h-4 w-16 bg-[#E8E3DA] rounded-full" />
            <div className="h-4 w-16 bg-[#E8E3DA] rounded-full" />
          </div>
          <div className="h-5 bg-[#E8E3DA] rounded w-3/4" />
          <div className="h-4 bg-[#E8E3DA] rounded w-full" />
          <div className="h-4 bg-[#E8E3DA] rounded w-1/2" />
        </div>
        <div className="w-8 h-8 bg-[#E8E3DA] rounded-lg flex-shrink-0" />
      </div>
    </div>
  )
}

function BillCard({
  bill,
  tracked,
  onToggleTrack,
}: {
  bill: Bill
  tracked: boolean
  onToggleTrack: () => void
}) {
  const party = PARTY_STYLES[bill.party]
  const status = STATUS_STYLES[bill.status]

  return (
    <Link href={`/bills/${bill.id}`} className="block group">
      <article className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm group-hover:shadow-md group-hover:border-[#C4B9AD] transition-all p-6 cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {/* Top meta row */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-xs font-mono text-[#1C1C1A]/40 tracking-wide">{bill.number}</span>
              <span className="text-xs text-[#1C1C1A]/20">·</span>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${status.bg} ${status.text}`}>
                {bill.status}
              </span>
              {bill.category && (
                <>
                  <span className="text-xs text-[#1C1C1A]/20">·</span>
                  <span className="text-xs text-[#1C1C1A]/40">{bill.category}</span>
                </>
              )}
            </div>

            {/* Title */}
            <h2 className="text-lg text-[#1C1C1A] leading-snug mb-2 group-hover:text-[#9B7FA6] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
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
              {bill.lastAction && (
                <>
                  <span className="text-xs text-[#1C1C1A]/25">·</span>
                  <span className="text-xs text-[#1C1C1A]/40">Last action {bill.lastAction}</span>
                </>
              )}
            </div>
          </div>

          {/* Track button */}
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleTrack(); }}
            aria-label={tracked ? 'Untrack bill' : 'Track bill'}
            className="flex-shrink-0 p-2 rounded-lg hover:bg-[#9B7FA6]/8 transition-colors mt-0.5"
          >
            <BookmarkIcon filled={tracked} />
          </button>
        </div>
      </article>
    </Link>
  )
}

export default function BillsPage() {
  const { user } = useAuth()
  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

  // ─── Search + filter state ───────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebounce(query, 300)
  const [openDropdown, setOpenDropdown] = useState<DropdownId>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const {
    selectedStatuses, dateFilter,
    toggleStatus, setDateFilter,
    clearFilters, hasFilters,
  } = useBillFilters()

  const filters: BillFilters = {
    statuses: selectedStatuses.size > 0 ? Array.from(selectedStatuses) : undefined,
    dateFilter: dateFilter,
  }

  const {
    bills, loading: billsLoading, error: billsError,
    loadingMore, loadMore, hasMore, refetch,
  } = useFetchBills(debouncedQuery, filters)

  const { trackedBills, toggleTrack: _toggleTrack } = useTrackedBills(user?.id ?? null)

  const [showTrackedOnly, setShowTrackedOnly] = useState(false)
  const [selectedTopics, setSelectedTopics] = useState<Set<Topic>>(new Set())

  const toggleTopic = (topic: Topic) => {
    setSelectedTopics(prev => {
      const next = new Set(prev)
      next.has(topic) ? next.delete(topic) : next.add(topic)
      return next
    })
  }

  const handleToggleTrack = (billId: string) => {
    if (!user) { setShowSignIn(true); return }
    _toggleTrack(billId)
  }

  // Build set of category values that match selected topics
  const topicCategories = new Set(
    Array.from(selectedTopics)
      .map(t => TOPIC_TO_CATEGORY[t])
      .filter((c): c is string => !!c)
  )

  let displayBills = bills
  if (showTrackedOnly) displayBills = displayBills.filter(b => trackedBills.has(b.id))
  if (selectedTopics.size > 0) displayBills = displayBills.filter(b => b.category && topicCategories.has(b.category))

  return (
    <div className="relative flex flex-col flex-1 overflow-hidden">
      <TopoBackground />

      <div className="relative z-10 flex flex-col flex-1">
        <PageHeader title="Bills Tracker" />
        <main className="flex-1 px-6 py-10">
          <div className="max-w-2xl mx-auto">

            {/* Page header + unified search */}
            <div className="mb-8">
              <h1
                className="text-4xl text-[#1C1C1A] mb-1.5 tracking-tight text-center"
                style={{ fontFamily: 'var(--font-serif)' }}
              >
                Legislation
              </h1>
              <p className="text-sm text-[#1C1C1A]/50 mb-6 text-center">
                Follow legislation that matters to you.
              </p>

              {/* Search input */}
              <div className="flex items-center gap-3 bg-white rounded-lg border border-[rgba(28,28,26,0.15)] px-4 py-3 shadow-sm">
                <span className="text-[#1C1C1A]/35 flex-shrink-0">
                  <SearchIcon />
                </span>
                <input
                  type="text"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search bills by title, number, sponsor, or topic…"
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

              {/* Filter chips */}
              <div className="mt-3 flex items-center gap-2 flex-wrap" ref={dropdownRef}>

                {/* Status chip */}
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      selectedStatuses.size > 0
                        ? 'border-[#9B7FA6] bg-[#9B7FA6]/8 text-[#9B7FA6]'
                        : 'border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/55 hover:border-[#9B7FA6]/50'
                    }`}
                  >
                    {selectedStatuses.size > 0 ? `Status: ${[...selectedStatuses].join(', ')}` : 'Status'}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {openDropdown === 'status' && (
                    <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[#D6CFC4] shadow-lg p-3 min-w-[140px] z-20 space-y-1.5">
                      {ALL_STATUSES.map(s => (
                        <FilterCheckbox key={s} label={s} checked={selectedStatuses.has(s)} onChange={() => toggleStatus(s)} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Date chip */}
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'date' ? null : 'date')}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      dateFilter !== 'all'
                        ? 'border-[#9B7FA6] bg-[#9B7FA6]/8 text-[#9B7FA6]'
                        : 'border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/55 hover:border-[#9B7FA6]/50'
                    }`}
                  >
                    {dateFilter === 'month' ? 'Last Action: Past month' : dateFilter === 'year' ? 'Last Action: Past year' : 'Last Action'}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {openDropdown === 'date' && (
                    <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[#D6CFC4] shadow-lg p-3 min-w-[150px] z-20 space-y-2">
                      {([
                        { key: 'all', label: 'All time' },
                        { key: 'month', label: 'Past month' },
                        { key: 'year', label: 'Past year' },
                      ] as { key: DateFilter; label: string }[]).map(opt => (
                        <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer group">
                          <div
                            onClick={() => { setDateFilter(opt.key); setOpenDropdown(null) }}
                            className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                              dateFilter === opt.key
                                ? 'border-[#9B7FA6]'
                                : 'bg-white border-[rgba(28,28,26,0.2)] group-hover:border-[#9B7FA6]/60'
                            }`}
                          >
                            {dateFilter === opt.key && <div className="w-2 h-2 rounded-full bg-[#9B7FA6]" />}
                          </div>
                          <span className={`text-sm ${dateFilter === opt.key ? 'text-[#1C1C1A]' : 'text-[#1C1C1A]/60'}`}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Topics chip */}
                <div className="relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'topics' ? null : 'topics')}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      selectedTopics.size > 0
                        ? 'border-[#9B7FA6] bg-[#9B7FA6]/8 text-[#9B7FA6]'
                        : 'border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/55 hover:border-[#9B7FA6]/50'
                    }`}
                  >
                    {selectedTopics.size > 0 ? `Topics: ${selectedTopics.size}` : 'Topics'}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  {openDropdown === 'topics' && (
                    <div className="absolute top-full left-0 mt-1.5 bg-white rounded-xl border border-[#D6CFC4] shadow-lg p-3 min-w-[200px] max-h-[280px] overflow-y-auto z-20 space-y-1.5">
                      {ALL_TOPICS.map(t => (
                        <FilterCheckbox key={t} label={t} checked={selectedTopics.has(t)} onChange={() => toggleTopic(t)} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Tracked pill — only when logged in */}
                {user && (
                  <button
                    onClick={() => setShowTrackedOnly(prev => !prev)}
                    className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      showTrackedOnly
                        ? 'border-[#9B7FA6] bg-[#9B7FA6]/8 text-[#9B7FA6]'
                        : 'border-[rgba(28,28,26,0.15)] text-[#1C1C1A]/55 hover:border-[#9B7FA6]/50'
                    }`}
                  >
                    <BookmarkIcon filled={showTrackedOnly} />
                    Tracked
                  </button>
                )}

                {/* Clear all */}
                {(hasFilters || showTrackedOnly || selectedTopics.size > 0) && (
                  <button
                    onClick={() => { clearFilters(); setQuery(''); setShowTrackedOnly(false); setSelectedTopics(new Set()) }}
                    className="text-xs text-[#9B7FA6] hover:text-[#8a6e95] px-2"
                  >
                    Clear all ×
                  </button>
                )}
              </div>
            </div>

            {/* Bill list */}
            <div>
              <div className="flex-1 min-w-0">
                {/* Result count */}
                {!billsLoading && !billsError && (
                  <p className="text-xs text-[#1C1C1A]/40 mb-4">
                    {`${displayBills.length} bills`}
                    {trackedBills.size > 0 && (
                      <span className="ml-2 text-[#9B7FA6]">· {trackedBills.size} tracked</span>
                    )}
                  </p>
                )}

                {billsLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <BillCardSkeleton key={i} />
                    ))}
                  </div>
                ) : billsError ? (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-12 text-center">
                    <p className="text-[#1C1C1A]/40 text-sm mb-3">
                      {billsError.includes('CONGRESS_API_KEY')
                        ? 'Congress.gov API key is not configured.'
                        : 'Failed to load bills.'}
                    </p>
                    <button
                      onClick={() => refetch()}
                      className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
                    >
                      Try again
                    </button>
                  </div>
                ) : displayBills.length === 0 ? (
                  <div className="bg-white rounded-xl border border-[#D6CFC4] p-12 text-center">
                    <p className="text-[#1C1C1A]/40 text-sm">
                      {showTrackedOnly ? 'You haven\'t tracked any bills yet.' : 'No bills match your filters.'}
                    </p>
                    <button
                      onClick={() => { setQuery(''); clearFilters(); setShowTrackedOnly(false); setSelectedTopics(new Set()) }}
                      className="mt-3 text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
                    >
                      Clear all filters
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      {displayBills.map(bill => (
                        <BillCard
                          key={bill.id}
                          bill={bill}
                          tracked={trackedBills.has(bill.id)}
                          onToggleTrack={() => handleToggleTrack(bill.id)}
                        />
                      ))}
                    </div>

                    {hasMore && !hasFilters && (
                      <div className="mt-6 text-center">
                        <button
                          onClick={loadMore}
                          disabled={loadingMore}
                          className="text-sm text-[#9B7FA6] hover:text-[#8a6e95] disabled:opacity-50 border border-[#9B7FA6]/30 rounded-lg px-5 py-2.5 hover:bg-[#9B7FA6]/5 transition-colors"
                        >
                          {loadingMore ? 'Loading…' : 'Load more bills'}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
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
