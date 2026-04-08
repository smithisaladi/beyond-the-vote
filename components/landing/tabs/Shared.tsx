import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import type { BillStatus } from '@/lib/types'

// ── Decorative background ─────────────────────────────────────────────────────

export function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
    >
      <defs>
        <pattern id="topo-landing" x="0" y="0" width="900" height="700" patternUnits="userSpaceOnUse">
          <ellipse cx="700" cy="200" rx="420" ry="300" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="700" cy="200" rx="340" ry="240" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="705" cy="197" rx="265" ry="185" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="708" cy="194" rx="195" ry="135" fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="711" cy="191" rx="130" ry="90"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="713" cy="189" rx="72"  ry="50"  fill="none" stroke="#1C1C1A" strokeWidth="1.2" />
          <ellipse cx="120" cy="580" rx="180" ry="120" fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="124" cy="576" rx="120" ry="78"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
          <ellipse cx="127" cy="573" rx="68"  ry="44"  fill="none" stroke="#1C1C1A" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#topo-landing)" />
    </svg>
  )
}

// ── Feature item ──────────────────────────────────────────────────────────────

export function Feature({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex gap-4">
      <div className="w-10 h-10 rounded-lg bg-[#9B7FA6]/10 border border-[#9B7FA6]/15 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-[#9B7FA6]">{icon}</span>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-[#1C1C1A] mb-1.5" style={{ fontFamily: 'var(--font-serif)', fontWeight: 500 }}>{title}</h3>
        <p className="text-sm text-[#1C1C1A]/55 leading-[1.7]">{description}</p>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

export function IconSearch() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  )
}
export function IconBell() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  )
}
export function IconUsers() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  )
}
export function IconVote() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  )
}
export function IconFilter() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}
export function IconBookmark() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  )
}
export function IconTrending() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  )
}

// ── Mock preview cards ────────────────────────────────────────────────────────

export function MockRepCard({ name, title, party, state, vote }: {
  name: string; title: string; party: string; state: string
  vote?: { bill: string; position: 'Yea' | 'Nay' }
}) {
  const style = PARTY_STYLES[party as keyof typeof PARTY_STYLES] ?? PARTY_STYLES.Independent
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
          <span className="text-sm text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
            {initials}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[#1C1C1A] truncate" style={{ fontFamily: 'var(--font-serif)' }}>
            {name}
          </p>
          <p className="text-xs text-[#1C1C1A]/50 mt-0.5 truncate">{title}</p>
          <p className="text-xs text-[#1C1C1A]/38">{state}</p>
        </div>
      </div>
      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text} mb-3`}>
        {party}
      </span>
      {vote && (
        <div className="border-t border-[rgba(28,28,26,0.06)] pt-3">
          <p className="text-[10px] text-[#1C1C1A]/38 uppercase tracking-wider mb-1.5">Latest vote</p>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-[#1C1C1A]/70 leading-snug flex-1">{vote.bill}</p>
            <span className={`text-[11px] font-semibold flex-shrink-0 ${vote.position === 'Yea' ? 'text-[#6A9B7B]' : 'text-[#B85C38]'}`}>
              {vote.position}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function MockBillCard({ number, title, status, category }: {
  number: string; title: string; status: string; category: string
}) {
  const style = STATUS_STYLES[status as BillStatus] ?? STATUS_STYLES.Active
  return (
    <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] p-6 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[11px] font-mono text-[#1C1C1A]/38">{number}</span>
        <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${style.bg} ${style.text}`}>
          {status}
        </span>
      </div>
      <p className="text-sm text-[#1C1C1A] leading-snug mb-3" style={{ fontFamily: 'var(--font-serif)' }}>
        {title}
      </p>
      <span className="inline-block text-[11px] text-[#1C1C1A]/40 bg-[#F5F0E8] border border-[rgba(28,28,26,0.08)] px-2.5 py-1 rounded-full">
        {category}
      </span>
    </div>
  )
}
