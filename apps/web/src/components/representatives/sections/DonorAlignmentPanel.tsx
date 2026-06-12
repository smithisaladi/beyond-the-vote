

import { useState } from 'react'
import { ChevronDown, DollarSign } from 'lucide-react'
import type { DonorAlignment } from '@/lib/types/politicians'
import { STATUS_STYLES } from '@/lib/ui'

export function DonorAlignmentPanel({ alignments }: { alignments: DonorAlignment[] }) {
  const [open, setOpen] = useState(false)

  if (alignments.length === 0) return null

  return (
    <div className="mt-2 border border-edge-soft rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-surface hover:bg-raised transition-colors"
      >
        <span className="text-xs text-fg/50 font-medium flex items-center gap-1.5">
          <DollarSign size={11} strokeWidth={1.8} className="opacity-60" />
          Donor alignment · {alignments.length} connection{alignments.length !== 1 ? 's' : ''}
        </span>
        <ChevronDown
          size={12}
          strokeWidth={1.8}
          className={`text-fg/30 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3 py-2 bg-surface space-y-2.5">
          {alignments.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: a.voteAligns ? STATUS_STYLES.Passed.hex : STATUS_STYLES.Failed.hex }} />
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
