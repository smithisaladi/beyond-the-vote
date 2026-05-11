import { Card } from '@/components/ui/Card'
import { InfoTooltip } from '@/components/shared/InfoTooltip'
import type { PoliticianStats, Committee } from '@/lib/types/politicians'

interface ProfileSidebarProps {
  stats: PoliticianStats
  nextElectionYear: number | null | undefined
  committees: Committee[]
}

export function ProfileSidebar({ stats, nextElectionYear, committees }: ProfileSidebarProps) {
  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-6">
        <div>
          <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-1">Years in Office</p>
          <p className="text-3xl font-medium text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
            {stats.yearsInOffice}
          </p>
        </div>

        {stats.ideologyScore !== null && (
          <div>
            <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-3 flex items-center gap-1">
              Ideology Score
              <InfoTooltip
                label="About the ideology score"
                content={
                  <>
                    <p className="text-[11px] font-semibold text-[#1C1C1A] mb-0.5">DW-NOMINATE</p>
                    Score from roll-call votes: <span className="font-mono">−1</span> (most progressive) to <span className="font-mono">+1</span> (most conservative).
                    {' '}
                    <a href="https://voteview.com/about" target="_blank" rel="noopener noreferrer" className="text-[#7B5E8A] hover:underline">Source: VoteView</a>
                  </>
                }
              />
            </p>
            <div className="relative h-1.5 bg-gradient-to-r from-[#5E85A8] to-[#A87B7B] rounded-full mb-2">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white border-2 border-[#7B5E8A] rounded-full shadow-sm"
                style={{ left: `calc(${((stats.ideologyScore + 1) / 2) * 100}% - 6px)` }}
              />
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-[#5E85A8]">Progressive</span>
              <span className="text-xs text-[#A87B7B]">Conservative</span>
            </div>
          </div>
        )}

        {nextElectionYear && (
          <div>
            <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-1">Next Election</p>
            <p className="text-2xl font-medium text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
              {nextElectionYear}
            </p>
          </div>
        )}
      </Card>

      {committees.length > 0 && (
        <Card>
          <p className="text-xs text-[#1C1C1A]/50 uppercase tracking-wide mb-3">Committees</p>
          <ul className="space-y-2">
            {committees.map((c, i) => (
              <li key={i} className="flex flex-col gap-0.5">
                {c.url ? (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#1C1C1A] hover:text-[#7B5E8A] transition-colors leading-snug"
                  >
                    {c.name}
                  </a>
                ) : (
                  <span className="text-sm text-[#1C1C1A] leading-snug">{c.name}</span>
                )}
                {c.title && (
                  <span className="text-xs text-[#1C1C1A]/40">{c.title}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
