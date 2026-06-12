

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { isFinalPassageVote } from '@/lib/votes'
import { formatBillId } from '@/lib/bills'
import { STATUS_STYLES } from '@/lib/ui'
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
          <span className="text-[10px] uppercase tracking-[0.14em] text-fg/38 font-medium select-none">
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
                      ? 'bg-accent-deep/10 text-accent border-accent/20'
                      : 'text-fg/45 hover:text-fg/70 border-transparent'
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
        <p className="px-6 py-8 text-[13px] text-fg/40 text-center">
          {voteFilter === 'final' ? 'No final passage votes found.' : 'No recent votes found.'}
        </p>
      ) : (
        <>
          {visibleVotes.map(v => {
            const question = v.question?.replace(/^On /i, '') ?? ''
            const displayTitle = v.billTitle
              ? `${question}: ${v.billTitle}`
              : v.billId ? `${question}: ${formatBillId(v.billId)}` : v.question ?? question
            const vote = v.position ?? v.vote
            return (
              <div key={v.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    {v.billId ? (
                      <Link
                        to="/bills/$billId"
                        params={{ billId: v.billId }}
                        className="text-[13px] text-fg hover:text-accent hover:underline transition-colors"
                      >
                        {displayTitle}
                      </Link>
                    ) : (
                      <p className="text-[13px] text-fg">{displayTitle}</p>
                    )}
                    <p className="text-xs text-fg/40 mt-0.5">{v.date}</p>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ml-4 ${
                    vote === 'Yea' ? `${STATUS_STYLES.Passed.bg} ${STATUS_STYLES.Passed.text}` : `${STATUS_STYLES.Failed.bg} ${STATUS_STYLES.Failed.text}`
                  }`}>
                    {vote}
                  </span>
                </div>
                {(v.donorAlignments?.length ?? 0) > 0 && (
                  <DonorAlignmentPanel alignments={v.donorAlignments!} />
                )}
              </div>
            )
          })}
          {hasMore && (
            <div className="px-6 py-3 flex justify-center">
              <button
                onClick={() =>
                  setVoteLimits(prev => ({ ...prev, [voteFilter]: prev[voteFilter] + 10 }))
                }
                className="text-xs font-medium text-accent hover:text-accent/80 border border-accent/30 rounded-lg px-4 py-2 hover:bg-accent-deep/5 transition-colors"
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
