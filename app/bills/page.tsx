'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { Navigation } from '@/components/Navigation'
import { SignInModal } from '@/components/SignInModal'
import { SignUpModal } from '@/components/SignUpModal'
import { createClient } from '@/lib/supabase/client'

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
  category?: Category
  lastAction: string
  lastActionTimestamp: number
  summary: string
}

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
const PAGE_SIZE = 20

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
            {bill.category && (
              <>
                <span className="text-xs text-[#1C1C1A]/20">·</span>
                <span className="text-xs text-[#1C1C1A]/40">{bill.category}</span>
              </>
            )}
          </div>

          {/* Title */}
          <Link href={`/bills/${bill.id}`}>
            <h2 className="text-lg text-[#1C1C1A] leading-snug mb-2 hover:text-[#9B7FA6] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
              {bill.title}
            </h2>
          </Link>

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
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedStatuses, setSelectedStatuses] = useState<Set<Status>>(new Set())
  const [selectedCategories, setSelectedCategories] = useState<Set<Category>>(new Set())
  const [dateFilter, setDateFilter] = useState<DateFilter>('all')

  const [bills, setBills] = useState<Bill[]>([])
  const [billsLoading, setBillsLoading] = useState(true)
  const [billsError, setBillsError] = useState<string | null>(null)
  const [offset, setOffset] = useState(0)
  const [total, setTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)

  const [trackedBills, setTrackedBills] = useState<Set<string>>(new Set())
  const [user, setUser] = useState<User | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const [showSignUp, setShowSignUp] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search query
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedQuery(query), 400)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Auth state
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Load tracked bills from Supabase
  useEffect(() => {
    if (!user) { setTrackedBills(new Set()); return }
    const supabase = createClient()
    supabase
      .from('tracked_bills')
      .select('bill_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setTrackedBills(new Set(data.map((r: { bill_id: string }) => r.bill_id)))
      })
  }, [user])

  // Fetch bills (reset when query/category changes)
  const fetchBills = useCallback(async (currentOffset: number, append: boolean) => {
    if (currentOffset === 0) setBillsLoading(true)
    else setLoadingMore(true)
    setBillsError(null)

    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(currentOffset) })
    if (debouncedQuery) params.set('q', debouncedQuery)

    try {
      const res = await fetch(`/api/bills?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load bills')
      if (append) {
        setBills(prev => [...prev, ...data.bills])
      } else {
        setBills(data.bills)
      }
      setTotal(data.pagination?.total ?? data.bills.length)
    } catch (err: any) {
      setBillsError(err.message)
    } finally {
      setBillsLoading(false)
      setLoadingMore(false)
    }
  }, [debouncedQuery])

  // Reset and re-fetch when query changes
  useEffect(() => {
    setOffset(0)
    fetchBills(0, false)
  }, [debouncedQuery, fetchBills])

  const toggleStatus = (s: Status) =>
    setSelectedStatuses(prev => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n })

  const toggleCategory = (c: Category) =>
    setSelectedCategories(prev => { const n = new Set(prev); n.has(c) ? n.delete(c) : n.add(c); return n })

  const now = Date.now()
  const filtered = useMemo(() => {
    return bills.filter(bill => {
      if (selectedStatuses.size > 0 && !selectedStatuses.has(bill.status)) return false
      if (selectedCategories.size > 0 && (!bill.category || !selectedCategories.has(bill.category))) return false
      if (dateFilter === 'month' && now - bill.lastActionTimestamp > 30 * 24 * 60 * 60 * 1000) return false
      if (dateFilter === 'year' && now - bill.lastActionTimestamp > 365 * 24 * 60 * 60 * 1000) return false
      return true
    })
  }, [bills, selectedStatuses, selectedCategories, dateFilter, now])

  const hasFilters = selectedStatuses.size > 0 || selectedCategories.size > 0 || dateFilter !== 'all'

  const clearFilters = () => {
    setSelectedStatuses(new Set())
    setSelectedCategories(new Set())
    setDateFilter('all')
  }

  const toggleTrack = async (billId: string) => {
    if (!user) {
      setShowSignIn(true)
      return
    }

    const supabase = createClient()
    const isTracked = trackedBills.has(billId)
    const next = new Set(trackedBills)
    isTracked ? next.delete(billId) : next.add(billId)
    setTrackedBills(next) // optimistic

    const { error } = isTracked
      ? await supabase.from('tracked_bills').delete().eq('user_id', user.id).eq('bill_id', billId)
      : await supabase.from('tracked_bills').insert({ user_id: user.id, bill_id: billId })

    if (error) {
      // revert
      const reverted = new Set(trackedBills)
      setTrackedBills(reverted)
    }
  }

  const loadMore = () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    fetchBills(nextOffset, true)
  }

  const hasMore = bills.length < total

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
                {!billsLoading && !billsError && (
                  <p className="text-xs text-[#1C1C1A]/40 mb-4">
                    {hasFilters
                      ? `${filtered.length} of ${bills.length} bills (filtered)`
                      : `${bills.length} bills`}
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
                      onClick={() => fetchBills(0, false)}
                      className="text-sm text-[#9B7FA6] hover:text-[#8a6e95]"
                    >
                      Try again
                    </button>
                  </div>
                ) : filtered.length === 0 ? (
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
                  <>
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
