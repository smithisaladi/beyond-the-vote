
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isFinalPassageVote } from '@/lib/votes'
import { formatBillId } from '@/lib/bills'
import { DonorAlignmentPanel } from './DonorAlignmentPanel'
import type { PoliticianVote } from '@/lib/types/politicians'

interface VotesTabProps {
  votes: PoliticianVote[]
  politicianId: string
}

export function VotesTab({ votes, politicianId }: VotesTabProps) {
  const [voteFilter, setVoteFilter] = useState<'final' | 'all'>('final')
  const [voteLimits, setVoteLimits] = useState<{ final: number; all: number }>({ final: 10, all: 10 })

  const filteredVotes = voteFilter === 'all'
    ? votes
    : votes.filter(v => isFinalPassageVote(v.question))

  const limit = voteLimits[voteFilter]
  const visibleVotes = filteredVotes.slice(0, limit)
  const hasMore = filteredVotes.length > limit
  const remaining = filteredVotes.length - limit

  return (
    <>
      {votes.length > 0 && (
        <div className="px-6 pt-4 pb-3 flex items-center justify-center gap-3">
          <span className="text-[10px] uppercase tracking-[0.14em] text-[#1C1C1A]/38 font-medium select-none">
            Filter
          </span>
          <div role="tablist" aria-label="Filter votes" className="flex items-center gap-1">
            {(['final', 'all'] as const).map(f => {
              const active = voteFilter === f
              return (
                <button
                  key={f}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setVoteFilter(f)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-colors ${
                    active
                      ? 'bg-[#7B5E8A]/10 text-[#7B5E8A] border-[#7B5E8A]/20'
                      : 'text-[#1C1C1A]/45 hover:text-[#1C1C1A]/70 border-transparent'
                  }`}
                >
                  {f === 'final' ? 'Final' : 'All'}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {filteredVotes.length === 0 ? (
        <p className="px-6 py-8 text-sm text-[#1C1C1A]/40 text-center">
          {voteFilter === 'final' ? 'No final passage votes found.' : 'No recent votes found.'}
        </p>
      ) : (
        <>
          {visibleVotes.map(v => {
            const question = v.question?.replace(/^On /i, '') ?? ''
            const displayTitle = v.billTitle
              ? `${question}: ${v.billTitle}`
              : v.billId ? `${question}: ${formatBillId(v.billId)}` : v.bill
            return (
              <div key={v.id} className="px-6 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    {v.billId ? (
                      <Link
                        href={`/bills/${v.billId}?from=/representatives/${politicianId}`}
                        className="text-sm text-[#1C1C1A] hover:text-[#7B5E8A] hover:underline transition-colors"
                      >
                        {displayTitle}
                      </Link>
                    ) : (
                      <p className="text-sm text-[#1C1C1A]">{displayTitle}</p>
                    )}
                    <p className="text-xs text-[#1C1C1A]/40 mt-0.5">{v.date}</p>
                  </div>
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ml-4 ${
                    v.vote === 'Yea' ? 'bg-[#68B085]/[0.12] text-[#68B085]' : 'bg-[#B85C38]/[0.12] text-[#B85C38]'
                  }`}>
                    {v.vote}
                  </span>
                </div>
                {(v.donorAlignments?.length ?? 0) > 0 && (
                  <DonorAlignmentPanel alignments={v.donorAlignments} />
                )}
              </div>
            )
          })}
          {hasMore && (
            <div className="px-6 py-4 flex justify-center">
              <button
                onClick={() =>
                  setVoteLimits(prev => ({ ...prev, [voteFilter]: prev[voteFilter] + 10 }))
                }
                className="text-xs font-medium text-[#7B5E8A] hover:text-[#6A4F78] border border-[#7B5E8A]/30 rounded-lg px-4 py-2 hover:bg-[#7B5E8A]/5 transition-colors"
              >
                Load {Math.min(10, remaining)} more
              </button>
            </div>
          )}
        </>
      )}
    </>
  )
}
