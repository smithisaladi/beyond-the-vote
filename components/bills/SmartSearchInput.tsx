'use client'

interface Props {
  value: string
  onChange: (value: string) => void
  loading: boolean
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function Spinner() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      className="animate-spin text-[#9B7FA6]"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

export function SmartSearchInput({ value, onChange, loading }: Props) {
  return (
    <div className="flex items-center gap-3 bg-white rounded-lg border border-[rgba(28,28,26,0.15)] px-4 py-3 shadow-sm max-w-2xl focus-within:border-[#9B7FA6]/40 transition-colors">
      <span className="text-[#9B7FA6]/60 flex-shrink-0">
        <SearchIcon />
      </span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder='Try "bills about student loan forgiveness"…'
        autoFocus
        className="flex-1 bg-transparent outline-none text-sm text-[#1C1C1A] placeholder:text-[#1C1C1A]/35"
      />
      <span className="flex-shrink-0 w-4 flex items-center justify-center">
        {loading ? (
          <Spinner />
        ) : value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="text-[#1C1C1A]/35 hover:text-[#1C1C1A]/60 transition-colors"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        ) : null}
      </span>
    </div>
  )
}
