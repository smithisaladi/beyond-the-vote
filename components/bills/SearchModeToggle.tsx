'use client'

export type SearchMode = 'filter' | 'smart'

interface Props {
  mode: SearchMode
  onChange: (mode: SearchMode) => void
}

function SparkleIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
    </svg>
  )
}

export function SearchModeToggle({ mode, onChange }: Props) {
  return (
    <div
      role="group"
      aria-label="Search mode"
      className="inline-flex items-center bg-[#EAE5DB] border border-[rgba(28,28,26,0.1)] rounded-lg p-0.5 gap-0.5"
    >
      <button
        type="button"
        onClick={() => onChange('filter')}
        aria-pressed={mode === 'filter'}
        className={`text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'filter'
            ? 'bg-white text-[#1C1C1A] shadow-sm'
            : 'text-[#1C1C1A]/50 hover:text-[#1C1C1A]/70'
        }`}
      >
        Filter search
      </button>
      <button
        type="button"
        onClick={() => onChange('smart')}
        aria-pressed={mode === 'smart'}
        className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md font-medium transition-all ${
          mode === 'smart'
            ? 'bg-white text-[#9B7FA6] shadow-sm'
            : 'text-[#1C1C1A]/50 hover:text-[#9B7FA6]/70'
        }`}
      >
        <SparkleIcon />
        Smart search
      </button>
    </div>
  )
}
