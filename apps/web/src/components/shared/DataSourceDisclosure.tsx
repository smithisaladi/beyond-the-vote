

import { useState } from 'react'
import { Info, ChevronDown } from 'lucide-react'
import { Card } from '@/components/ui/Card'

interface DataSourceDisclosureProps {
  showAiDisclaimer?: boolean
  className?: string
}

export default function DataSourceDisclosure({ showAiDisclaimer, className = '' }: DataSourceDisclosureProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className={className}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-xs text-fg/38 hover:text-fg/55 transition-colors mx-auto"
      >
        <Info size={14} strokeWidth={1.8} />
        <span>About this data</span>
        <ChevronDown
          size={12}
          strokeWidth={1.8}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <Card padding="none" className="mt-3 overflow-hidden text-fg/55 leading-relaxed">
          {/* Data Source */}
          <div className="px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.07em] text-fg/40 font-medium mb-1">Data Source</p>
            <p className="text-[13px]">
              Federal Election Commission (FEC) bulk filings covering the 2023–2024 and 2025–2026 election cycles.
            </p>
          </div>

          {/* What's Excluded */}
          <div className="px-4 py-3 border-t border-edge-soft">
            <p className="text-[10px] uppercase tracking-[0.07em] text-fg/40 font-medium mb-1">What&apos;s Excluded</p>
            <p className="text-[13px]">
              Passthrough PACs (ActBlue, WinRed) and party committees (DNC, RNC, DCCC, NRCC, etc.) are filtered
              out because they redistribute money rather than originate contributions.
            </p>
          </div>

          {/* Contribution Types */}
          <div className="px-4 py-3 border-t border-edge-soft">
            <p className="text-[10px] uppercase tracking-[0.07em] text-fg/40 font-medium mb-1">Contribution Types</p>
            <ul className="text-[13px] space-y-1">
              <li><span className="text-fg/70 font-medium">Direct</span> — money given directly to a candidate&apos;s campaign committee.</li>
              <li><span className="text-fg/70 font-medium">IE Support</span> — independent expenditures spent to support a candidate, without campaign coordination.</li>
              <li><span className="text-fg/70 font-medium">IE Against</span> — independent expenditures spent to oppose a candidate.</li>
            </ul>
          </div>

          {/* AI Disclaimer */}
          {showAiDisclaimer && (
            <div className="px-4 py-3 border-t border-edge-soft">
              <p className="text-[10px] uppercase tracking-[0.07em] text-fg/40 font-medium mb-1">AI Summaries</p>
              <p className="text-[13px]">
                Summaries are AI-generated from FEC contribution patterns. They are not official FEC analysis
                and should be used as a starting point for further research.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
