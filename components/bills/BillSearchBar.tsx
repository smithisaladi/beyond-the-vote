'use client'

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

interface BillSearchBarProps {
  query: string
  onQueryChange: (q: string) => void
}

export function BillSearchBar({ query, onQueryChange }: BillSearchBarProps) {
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-center px-5 py-4 gap-3">
        <span className="text-[#1C1C1A]/25 flex-shrink-0">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search bills by title, number, sponsor, or topic…"
          className="flex-1 bg-transparent outline-none text-[15px] text-[#1C1C1A] placeholder:text-[#1C1C1A]/35"
        />
        {query && (
          <button onClick={() => onQueryChange('')} className="text-[#1C1C1A]/35 hover:text-[#1C1C1A]/60 flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
