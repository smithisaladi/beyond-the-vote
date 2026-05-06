import Link from 'next/link'
import { STATUS_STYLES } from '@/lib/ui'
import type { PoliticianBill } from '@/lib/types/politicians'

interface SponsoredBillsTabProps {
  bills: PoliticianBill[]
  politicianId: string
}

export function SponsoredBillsTab({ bills, politicianId }: SponsoredBillsTabProps) {
  if (bills.length === 0) {
    return (
      <p className="px-6 py-8 text-sm text-[#1C1C1A]/40 text-center">
        No sponsored bills found.
      </p>
    )
  }

  return (
    <>
      {bills.map(b => (
        <Link
          key={b.id}
          href={`/bills/${b.id}?from=/representatives/${politicianId}`}
          className="flex items-center justify-between px-6 py-4 hover:bg-[#F5F0E8]/60 transition-colors"
        >
          <div className="min-w-0 flex-1 mr-4">
            <p className="text-sm text-[#1C1C1A] hover:text-[#7B5E8A] transition-colors line-clamp-2" title={b.name}>
              {b.name}
            </p>
            <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{b.number} · {b.date}</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ml-4 ${(STATUS_STYLES[b.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Committee).bg} ${(STATUS_STYLES[b.status as keyof typeof STATUS_STYLES] ?? STATUS_STYLES.Committee).text}`}>
            {b.status}
          </span>
        </Link>
      ))}
    </>
  )
}
