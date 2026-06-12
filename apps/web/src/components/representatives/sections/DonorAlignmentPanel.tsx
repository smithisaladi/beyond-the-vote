

import { useState } from 'react'
import type { DonorAlignment } from '@/lib/types/politicians'

export function DonorAlignmentPanel({ alignments }: { alignments: DonorAlignment[] }) {
  const [open, setOpen] = useState(false)

  if (alignments.length === 0) return null

  return (
    <div className="mt-2 border border-edge-soft rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-raised hover:bg-raised/80 transition-colors"
      >
        <span className="text-xs text-fg/50 font-medium flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
          Donor alignment · {alignments.length} connection{alignments.length !== 1 ? 's' : ''}
        </span>
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
          className={`text-fg/30 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-3 py-2 bg-surface space-y-2.5">
          {alignments.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full ${a.voteAligns ? 'bg-[#7FC29B]' : 'bg-[#C97A5A]'}`} />
              <div className="min-w-0">
                <p className="text-xs text-fg/70 leading-relaxed">
                  <span className="font-medium text-fg">{a.donorName}</span>
                  {a.donorAmount != null && (
                    <span className="text-fg/40 ml-1">(${a.donorAmount.toLocaleString()})</span>
                  )}
                  {' — '}{a.explanation}
                </p>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-fg/30 pt-1 border-t border-edge-soft">
            AI-generated from FEC data. Shows contribution patterns, not proven influence or intent.
          </p>
        </div>
      )}
    </div>
  )
}
