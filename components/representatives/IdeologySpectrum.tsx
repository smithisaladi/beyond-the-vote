'use client'

import { getIdeologyLabel } from '@/lib/ideology'

interface IdeologySpectrumProps {
  score: number | null
  chamberMedian?: number | null
  partyMedian?: number | null
  party?: string
}

// Converts a DW-NOMINATE score (-1 to +1) to a percentage (0–100) for positioning
function toPercent(score: number): number {
  return Math.round(((score + 1) / 2) * 100)
}

export default function IdeologySpectrum({
  score,
  chamberMedian,
  partyMedian,
  party,
}: IdeologySpectrumProps) {
  if (score === null || score === undefined) {
    return (
      <div className="text-sm text-gray-400 italic">Ideology score unavailable</div>
    )
  }

  const label = getIdeologyLabel(score)
  const pct   = toPercent(score)

  const partyColor =
    party?.toLowerCase().includes('democrat')   ? '#3b82f6' :
    party?.toLowerCase().includes('republican') ? '#ef4444' :
    '#8b5cf6'

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-xs text-gray-400 select-none">
        <span>Very Liberal</span>
        <span className="font-medium text-white">{label}</span>
        <span>Very Conservative</span>
      </div>

      <div className="relative h-3 rounded-full overflow-hidden"
           style={{ background: 'linear-gradient(to right, #3b82f6, #8b5cf6, #ef4444)' }}>

        {/* Chamber median marker */}
        {chamberMedian !== null && chamberMedian !== undefined && (
          <span
            className="absolute top-0 bottom-0 w-0.5 bg-white/40"
            style={{ left: `${toPercent(chamberMedian)}%` }}
            title={`Chamber median: ${chamberMedian.toFixed(3)}`}
          />
        )}

        {/* Party median marker */}
        {partyMedian !== null && partyMedian !== undefined && (
          <span
            className="absolute top-0 bottom-0 w-0.5 bg-white/70"
            style={{ left: `${toPercent(partyMedian)}%` }}
            title={`Party median: ${partyMedian.toFixed(3)}`}
          />
        )}

        {/* Member dot */}
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-white shadow-lg"
          style={{ left: `${pct}%`, background: partyColor }}
          title={`Score: ${score.toFixed(3)}`}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-500 select-none">
        <span>−1.0</span>
        <span className="font-mono text-gray-400">{score.toFixed(3)}</span>
        <span>+1.0</span>
      </div>

      {(chamberMedian !== null && chamberMedian !== undefined) || (partyMedian !== null && partyMedian !== undefined) ? (
        <div className="flex gap-4 text-xs text-gray-400">
          {chamberMedian !== null && chamberMedian !== undefined && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-white/40" />
              Chamber median
            </span>
          )}
          {partyMedian !== null && partyMedian !== undefined && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-white/70" />
              Party median
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
