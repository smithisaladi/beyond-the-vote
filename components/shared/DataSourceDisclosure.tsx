'use client'

import { useState } from 'react'
import { Info, ChevronDown } from 'lucide-react'

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
        className="flex items-center gap-1.5 text-xs text-[#1C1C1A]/38 hover:text-[#1C1C1A]/55 transition-colors mx-auto"
      >
        <Info size={14} strokeWidth={1.8} />
        <span>About this data</span>
        <ChevronDown
          size={12}
          strokeWidth={2}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="mt-3 bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden text-sm text-[#1C1C1A]/55 leading-relaxed">
          {/* Data Source */}
          <div className="px-5 py-4">
            <p className="text-[11px] text-[#1C1C1A]/38 uppercase tracking-wider font-medium mb-1.5">Data Source</p>
            <p className="text-[13px]">
              Federal Election Commission (FEC) bulk filings covering the 2023–2024 and 2025–2026 election cycles.
            </p>
          </div>

          {/* What's Excluded */}
          <div className="px-5 py-4 border-t border-[rgba(28,28,26,0.06)]">
            <p className="text-[11px] text-[#1C1C1A]/38 uppercase tracking-wider font-medium mb-1.5">What&apos;s Excluded</p>
            <p className="text-[13px]">
              Passthrough PACs (ActBlue, WinRed) and party committees (DNC, RNC, DCCC, NRCC, etc.) are filtered
              out because they redistribute money rather than originate contributions.
            </p>
          </div>

          {/* Contribution Types */}
          <div className="px-5 py-4 border-t border-[rgba(28,28,26,0.06)]">
            <p className="text-[11px] text-[#1C1C1A]/38 uppercase tracking-wider font-medium mb-1.5">Contribution Types</p>
            <ul className="text-[13px] space-y-1.5">
              <li><span className="text-[#1C1C1A]/70 font-medium">Direct</span> — money given directly to a candidate&apos;s campaign committee.</li>
              <li><span className="text-[#1C1C1A]/70 font-medium">IE Support</span> — independent expenditures spent to support a candidate, without campaign coordination.</li>
              <li><span className="text-[#1C1C1A]/70 font-medium">IE Against</span> — independent expenditures spent to oppose a candidate.</li>
            </ul>
          </div>

          {/* AI Disclaimer */}
          {showAiDisclaimer && (
            <div className="px-5 py-4 border-t border-[rgba(28,28,26,0.06)]">
              <p className="text-[11px] text-[#1C1C1A]/38 uppercase tracking-wider font-medium mb-1.5">AI Summaries</p>
              <p className="text-[13px]">
                Summaries are AI-generated from FEC contribution patterns. They are not official FEC analysis
                and should be used as a starting point for further research.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
