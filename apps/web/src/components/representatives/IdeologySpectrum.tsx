

import { getPartyStyle, IDEOLOGY_GRADIENT } from '@/lib/ui'
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
      <div className="text-sm text-fg/45 italic">Ideology score unavailable</div>
    )
  }

  const label = getIdeologyLabel(score)
  const pct   = toPercent(score)

  const partyColor = getPartyStyle(party ?? '').hex

  return (
    <div className="w-full space-y-2">
      <div className="flex justify-between text-xs text-fg/45 select-none">
        <span>Very Liberal</span>
        <span className="font-medium text-fg">{label}</span>
        <span>Very Conservative</span>
      </div>

      <div className="relative h-3 rounded-full overflow-hidden"
           style={{ background: IDEOLOGY_GRADIENT }}>

        {/* Chamber median marker */}
        {chamberMedian !== null && chamberMedian !== undefined && (
          <span
            className="absolute top-0 bottom-0 w-0.5 bg-fg/20"
            style={{ left: `${toPercent(chamberMedian)}%` }}
            title={`Chamber median: ${chamberMedian.toFixed(3)}`}
          />
        )}

        {/* Party median marker */}
        {partyMedian !== null && partyMedian !== undefined && (
          <span
            className="absolute top-0 bottom-0 w-0.5 bg-fg/40"
            style={{ left: `${toPercent(partyMedian)}%` }}
            title={`Party median: ${partyMedian.toFixed(3)}`}
          />
        )}

        {/* Member dot */}
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full border-2 border-bg"
          style={{ left: `${pct}%`, background: partyColor }}
          title={`Score: ${score.toFixed(3)}`}
        />
      </div>

      <div className="flex justify-between text-xs text-fg/38 select-none">
        <span>−1.0</span>
        <span className="font-mono text-fg/45">{score.toFixed(3)}</span>
        <span>+1.0</span>
      </div>

      {(chamberMedian !== null && chamberMedian !== undefined) || (partyMedian !== null && partyMedian !== undefined) ? (
        <div className="flex gap-4 text-xs text-fg/45">
          {chamberMedian !== null && chamberMedian !== undefined && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-fg/20" />
              Chamber median
            </span>
          )}
          {partyMedian !== null && partyMedian !== undefined && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-fg/40" />
              Party median
            </span>
          )}
        </div>
      ) : null}
    </div>
  )
}
