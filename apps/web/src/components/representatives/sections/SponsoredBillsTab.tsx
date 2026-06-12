import { Link } from '@tanstack/react-router'
import { STATUS_STYLES } from '@/lib/ui'
import type { PoliticianBill } from '@/lib/types/politicians'

interface SponsoredBillsTabProps {
  bills: PoliticianBill[]
  politicianId: string
}

export function SponsoredBillsTab({ bills, politicianId }: SponsoredBillsTabProps) {
  if (bills.length === 0) {
    return (
      <p className="px-6 py-8 text-[13px] text-fg/40 text-center">
        No sponsored bills found.
      </p>
    )
  }

  return (
    <>
      {bills.map(b => (
        <Link
          key={b.id}
          to="/bills/$billId"
          params={{ billId: b.id }}
          className="flex items-center justify-between px-5 py-3 hover:bg-raised transition-colors"
        >
          <div className="min-w-0 flex-1 mr-3">
            <p className="text-[13px] text-fg hover:text-accent transition-colors line-clamp-2" title={b.title ?? b.name}>
              {b.title ?? b.name}
            </p>
            <p className="text-xs text-fg/40 mt-0.5">{b.number}{b.introducedDate ? ` · ${b.introducedDate}` : ''}</p>
          </div>
          <span className={`text-[10px] font-medium px-1.5 py-px rounded-full flex-shrink-0 ml-3 ${(STATUS_STYLES[b.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Committee).bg} ${(STATUS_STYLES[b.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Committee).text}`}>
            {b.status}
          </span>
        </Link>
      ))}
    </>
  )
}
