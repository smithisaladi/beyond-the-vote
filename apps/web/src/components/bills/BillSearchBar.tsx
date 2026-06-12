
import { Search, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface BillSearchBarProps {
  query: string
  onQueryChange: (q: string) => void
}

export function BillSearchBar({ query, onQueryChange }: BillSearchBarProps) {
  return (
    <Card padding="none">
      <div className="flex items-center px-5 py-4 gap-3">
        <span className="text-fg/25 flex-shrink-0">
          <Search size={16} strokeWidth={1.8} />
        </span>
        <input
          type="text"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
          placeholder="Search bills by title, number, sponsor, or topic…"
          className="flex-1 bg-transparent outline-none text-[15px] text-fg placeholder:text-fg/35"
        />
        {query && (
          <button onClick={() => onQueryChange('')} className="text-fg/35 hover:text-fg/60 flex-shrink-0">
            <X size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </Card>
  )
}
