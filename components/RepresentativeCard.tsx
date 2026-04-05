'use client'

import { useState } from 'react'
import Link from 'next/link'

type Party = 'Democrat' | 'Republican' | 'Independent'

interface RepresentativeCardProps {
  id: string
  name: string
  title: string
  party: Party
  state: string
  district?: string
  since: string | null
  photo?: string | null
}

const PARTY_STYLES: Record<Party, { bg: string; text: string; label: string }> = {
  Democrat:    { bg: 'bg-[#7B8FA8]/[0.12]', text: 'text-[#7B8FA8]',  label: 'Democrat' },
  Republican:  { bg: 'bg-[#A87B7B]/[0.12]', text: 'text-[#A87B7B]',  label: 'Republican' },
  Independent: { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]',  label: 'Independent' },
}

function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0][0]
  return (
    <div className="w-20 h-20 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-xl text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

export function RepresentativeCard({ id, name, title, party, state, district, since, photo }: RepresentativeCardProps) {
  const [following, setFollowing] = useState(false)
  const badge = PARTY_STYLES[party]

  return (
    <Link href={`/representatives/${id}`} className="block">
      <div className="bg-white rounded-xl border border-[#D6CFC4] shadow-sm hover:shadow-md transition-shadow p-6 flex flex-col items-center text-center gap-4 h-full">
        {photo
          ? <img src={photo} alt={name} className="w-20 h-20 rounded-full object-cover" />
          : <Initials name={name} />
        }

        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-xl text-[#1C1C1A]" style={{ fontFamily: 'var(--font-serif)' }}>
            {name}
          </h3>
          <p className="text-sm text-[#1C1C1A]/60">{title}</p>
          {district && (
            <p className="text-xs text-[#1C1C1A]/40">{district}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-center">
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          <span className="text-xs text-[#1C1C1A]/40">·</span>
          <span className="text-xs text-[#1C1C1A]/50">{state}</span>
          <span className="text-xs text-[#1C1C1A]/40">·</span>
          <span className="text-xs text-[#1C1C1A]/40">Since {since}</span>
        </div>

        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setFollowing(f => !f) }}
          className={`mt-1 w-full py-2 px-4 rounded-lg text-sm border transition-colors ${
            following
              ? 'bg-[#9B7FA6] border-[#9B7FA6] text-white'
              : 'bg-transparent border-[#9B7FA6] text-[#9B7FA6] hover:bg-[#9B7FA6] hover:text-white'
          }`}
        >
          {following ? 'Following ✓' : 'Follow'}
        </button>
      </div>
    </Link>
  )
}
