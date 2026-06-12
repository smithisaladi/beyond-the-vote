import {
  Bell, Users, ClipboardCheck, Filter, Bookmark,
  TrendingUp, DollarSign, ArrowLeftRight, Sparkles,
} from 'lucide-react'
import { PARTY_STYLES, STATUS_STYLES } from '@/lib/ui'
import type { BillStatus } from '@/lib/types'
import { Card } from '@/components/ui/Card'

// ── Decorative background ─────────────────────────────────────────────────────

export function TopoBackground() {
  return (
    <svg
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.06 }}
    >
      <defs>
        <pattern id="topo-landing" x="0" y="0" width="900" height="700" patternUnits="userSpaceOnUse">
          <ellipse cx="700" cy="200" rx="420" ry="300" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="700" cy="200" rx="340" ry="240" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="705" cy="197" rx="265" ry="185" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="708" cy="194" rx="195" ry="135" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="711" cy="191" rx="130" ry="90" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="713" cy="189" rx="72"  ry="50" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <ellipse cx="120" cy="580" rx="180" ry="120" fill="none" stroke="currentColor" strokeWidth="1" />
          <ellipse cx="124" cy="576" rx="120" ry="78" fill="none" stroke="currentColor" strokeWidth="1" />
          <ellipse cx="127" cy="573" rx="68"  ry="44" fill="none" stroke="currentColor" strokeWidth="1" />
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
      <div className="w-10 h-10 rounded-lg bg-accent-deep/[0.12] border border-accent-deep/20 flex items-center justify-center flex-shrink-0 mt-0.5">
        <span className="text-accent">{icon}</span>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-fg mb-1.5 tracking-tight">{title}</h3>
        <p className="text-sm text-fg/55 leading-[1.7]">{description}</p>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

export function IconBell() { return <Bell size={17} strokeWidth={1.8} /> }
export function IconUsers() { return <Users size={17} strokeWidth={1.8} /> }
export function IconVote() { return <ClipboardCheck size={17} strokeWidth={1.8} /> }
export function IconFilter() { return <Filter size={17} strokeWidth={1.8} /> }
export function IconBookmark() { return <Bookmark size={17} strokeWidth={1.8} /> }
export function IconTrending() { return <TrendingUp size={17} strokeWidth={1.8} /> }
export function IconDollar() { return <DollarSign size={17} strokeWidth={1.8} /> }
export function IconArrowsLeftRight() { return <ArrowLeftRight size={17} strokeWidth={1.8} /> }
export function IconSparkles() { return <Sparkles size={17} strokeWidth={1.8} /> }

// ── Mock preview cards ────────────────────────────────────────────────────────

export function MockRepCard({ name, title, party, state, vote }: {
  name: string; title: string; party: string; state: string
  vote?: { bill: string; position: 'Yea' | 'Nay' }
}) {
  const style = PARTY_STYLES[party as keyof typeof PARTY_STYLES] ?? PARTY_STYLES.Independent
  const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  return (
    <Card>
      <div className="flex items-start gap-3 mb-4">
        <div className="w-11 h-11 rounded-full bg-fg/[0.06] flex items-center justify-center flex-shrink-0">
          <span className="text-sm text-fg/50 font-medium tracking-tight">
            {initials}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-fg truncate tracking-tight">
            {name}
          </p>
          <p className="text-xs text-fg/50 mt-0.5 truncate">{title}</p>
          <p className="text-xs text-fg/38">{state}</p>
        </div>
      </div>
      <span className={`inline-block text-[11px] font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text} mb-3`}>
        {party}
      </span>
      {vote && (
        <div className="border-t border-edge-soft pt-3">
          <p className="text-[10px] text-fg/38 uppercase tracking-wider mb-1.5">Latest vote</p>
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-fg/70 leading-snug flex-1">{vote.bill}</p>
            <span className={`text-[11px] font-semibold flex-shrink-0 ${vote.position === 'Yea' ? STATUS_STYLES.Passed.text : STATUS_STYLES.Failed.text}`}>
              {vote.position}
            </span>
          </div>
        </div>
      )}
    </Card>
  )
}

export function MockBillCard({ number, title, status, category }: {
  number: string; title: string; status: string; category: string
}) {
  const style = STATUS_STYLES[status as BillStatus] ?? STATUS_STYLES.Active
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className="text-[11px] font-mono text-fg/38">{number}</span>
        <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full flex-shrink-0 ${style.bg} ${style.text}`}>
          {status}
        </span>
      </div>
      <p className="text-sm text-fg leading-snug mb-3 tracking-tight">
        {title}
      </p>
      <span className="inline-block text-[11px] text-fg/40 bg-fg/[0.06] border border-edge px-2.5 py-1 rounded-full">
        {category}
      </span>
    </Card>
  )
}

export function MockDonorCard({ rank, name, total, lean, recipients }: {
  rank: number; name: string; total: string; lean: 'Democrat' | 'Republican' | 'Mixed'; recipients: number
}) {
  const partyKey = lean === 'Mixed' ? 'Independent' : lean
  const leanStyle = { bg: PARTY_STYLES[partyKey].bg, text: PARTY_STYLES[partyKey].text, dotHex: PARTY_STYLES[partyKey].hex }
  return (
    <Card padding="none" className="p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <span className="text-xs font-mono text-fg/30">#{rank}</span>
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${leanStyle.bg} ${leanStyle.text}`}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: leanStyle.dotHex }} />
          {lean === 'Mixed' ? 'Mixed' : `Leans ${lean}`}
        </span>
      </div>
      <p className="text-sm text-fg mb-1.5 tracking-tight">{name}</p>
      <p className="text-lg font-semibold text-fg mb-2 font-mono">{total}</p>
      <p className="text-xs text-fg/38">{recipients} candidates supported</p>
    </Card>
  )
}
