

import { Bookmark } from 'lucide-react'
import type { Topic } from '@/lib/topics'
import type { BillStatus as Status } from '@/lib/types'
import { ALL_TOPICS } from '@/lib/topics'

interface BillFiltersState {
  query: string; setQuery: (q: string) => void; debouncedQuery: string;
  selectedStatuses: Set<string>; toggleStatus: (s: string) => void;
  selectedTopics: Set<string>; toggleTopic: (t: string) => void;
  dateFilter: string; setDateFilter: (d: string) => void;
  sort: string; setSort: (s: string) => void;
  showTrackedOnly: boolean; setShowTrackedOnly: (fn: (prev: boolean) => boolean) => void;
  hasFilters: boolean; clearAll: () => void;
  openDropdown: string | null; setOpenDropdown: (d: string | null) => void;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}

type DateFilter = 'all' | 'month' | 'year'
type SortOption = 'newest' | 'oldest'

const ALL_STATUSES: Status[] = ['Active', 'Committee', 'Stalled', 'Passed', 'Failed']


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
            ? 'bg-accent-deep border-accent-deep'
            : 'bg-surface border-edge/50 group-hover:border-accent/60'
        }`}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <span className={`text-sm ${checked ? 'text-fg' : 'text-fg/60'}`}>
        {label}
      </span>
    </label>
  )
}

interface User { id: string; email: string; name?: string }

interface BillFiltersProps {
  filters: BillFiltersState
  user: User | null
}

export function BillFilters({ filters, user }: BillFiltersProps) {
  const {
    selectedStatuses, toggleStatus,
    dateFilter, setDateFilter,
    selectedTopics, toggleTopic,
    sort, setSort,
    showTrackedOnly, setShowTrackedOnly,
    debouncedQuery,
    hasFilters, clearAll,
    openDropdown, setOpenDropdown, dropdownRef,
  } = filters

  return (
    <div className="mt-3 flex items-center justify-center gap-2 flex-wrap" ref={dropdownRef}>

      {/* Status chip */}
      <div className="relative">
        <button
          onClick={() => setOpenDropdown(openDropdown === 'status' ? null : 'status')}
          aria-expanded={openDropdown === 'status'}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selectedStatuses.size > 0
              ? 'border-accent bg-accent/[0.08] text-accent'
              : 'border-edge/50 text-fg/55 hover:border-accent/50'
          }`}
        >
          {selectedStatuses.size > 0 ? `Status: ${[...selectedStatuses].join(', ')}` : 'Status'}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openDropdown === 'status' && (
          <div className="absolute top-full left-0 mt-1.5 min-w-[140px] z-20 bg-raised rounded-lg border border-edge p-3 space-y-1.5">
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
          aria-expanded={openDropdown === 'date'}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            dateFilter !== 'all'
              ? 'border-accent bg-accent/[0.08] text-accent'
              : 'border-edge/50 text-fg/55 hover:border-accent/50'
          }`}
        >
          {dateFilter === 'month' ? 'Last Action: Past month' : dateFilter === 'year' ? 'Last Action: Past year' : 'Last Action'}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openDropdown === 'date' && (
          <div className="absolute top-full left-0 mt-1.5 min-w-[150px] z-20 bg-raised rounded-lg border border-edge p-3 space-y-2">
            {([
              { key: 'all', label: 'All time' },
              { key: 'month', label: 'Past month' },
              { key: 'year', label: 'Past year' },
            ] as { key: DateFilter; label: string }[]).map(opt => (
              <div
                key={opt.key}
                onClick={() => { setDateFilter(opt.key); setOpenDropdown(null) }}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <div
                  className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                    dateFilter === opt.key
                      ? 'border-accent'
                      : 'bg-surface border-edge/50 group-hover:border-accent/60'
                  }`}
                >
                  {dateFilter === opt.key && <div className="w-2 h-2 rounded-full bg-accent" />}
                </div>
                <span className={`text-sm ${dateFilter === opt.key ? 'text-fg' : 'text-fg/60'}`}>{opt.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Topics chip */}
      <div className="relative">
        <button
          onClick={() => setOpenDropdown(openDropdown === 'topics' ? null : 'topics')}
          aria-expanded={openDropdown === 'topics'}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            selectedTopics.size > 0
              ? 'border-accent bg-accent/[0.08] text-accent'
              : 'border-edge/50 text-fg/55 hover:border-accent/50'
          }`}
        >
          {selectedTopics.size > 0 ? `Topics: ${selectedTopics.size}` : 'Topics'}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {openDropdown === 'topics' && (
          <div className="absolute top-full left-0 mt-1.5 min-w-[200px] max-h-[280px] overflow-y-auto z-20 bg-raised rounded-lg border border-edge p-3 space-y-1.5">
            {ALL_TOPICS.map(t => (
              <FilterCheckbox key={t} label={t} checked={selectedTopics.has(t)} onChange={() => toggleTopic(t)} />
            ))}
          </div>
        )}
      </div>

      {/* Sort chip — hidden during search (relevance sort used instead) */}
      {!debouncedQuery && (
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'sort' ? null : 'sort')}
            aria-expanded={openDropdown === 'sort'}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
              sort !== 'newest'
                ? 'border-accent bg-accent/[0.08] text-accent'
                : 'border-edge/50 text-fg/55 hover:border-accent/50'
            }`}
          >
            {sort === 'newest' ? 'Latest first' : 'Oldest first'}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {openDropdown === 'sort' && (
            <div className="absolute top-full left-0 mt-1.5 min-w-[140px] z-20 bg-raised rounded-lg border border-edge p-3 space-y-2">
              {([
                { key: 'newest', label: 'Latest first' },
                { key: 'oldest', label: 'Oldest first' },
              ] as { key: SortOption; label: string }[]).map(opt => (
                <div
                  key={opt.key}
                  onClick={() => { setSort(opt.key); setOpenDropdown(null) }}
                  className="flex items-center gap-2.5 cursor-pointer group"
                >
                  <div
                    className={`w-4 h-4 rounded-full border flex items-center justify-center flex-shrink-0 transition-colors ${
                      sort === opt.key
                        ? 'border-accent'
                        : 'bg-surface border-edge/50 group-hover:border-accent/60'
                    }`}
                  >
                    {sort === opt.key && <div className="w-2 h-2 rounded-full bg-accent" />}
                  </div>
                  <span className={`text-sm ${sort === opt.key ? 'text-fg' : 'text-fg/60'}`}>{opt.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tracked pill — only when logged in */}
      {user && (
        <button
          onClick={() => setShowTrackedOnly(prev => !prev)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-colors ${
            showTrackedOnly
              ? 'border-accent bg-accent/[0.08] text-accent'
              : 'border-edge/50 text-fg/55 hover:border-accent/50'
          }`}
        >
          <Bookmark size={13} strokeWidth={1.8} className={showTrackedOnly ? 'text-accent' : 'text-fg/45'} fill={showTrackedOnly ? 'currentColor' : 'none'} />
          Tracked
        </button>
      )}

      {/* Clear all */}
      {(hasFilters || showTrackedOnly || selectedTopics.size > 0 || sort !== 'newest') && (
        <button
          onClick={clearAll}
          className="text-xs text-accent hover:text-accent-deep-hover px-2"
        >
          Clear all ×
        </button>
      )}
    </div>
  )
}
