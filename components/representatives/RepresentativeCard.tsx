'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check } from 'lucide-react'
import { useFollowPolitician } from '@/hooks/useFollowPolitician'
import type { Party } from '@/lib/types'
import { PARTY_STYLES } from '@/lib/ui'

interface RepresentativeCardProps {
  id: string
  name: string
  title: string
  party: Party
  state: string
  district?: string
  since: string | null
  photo?: string | null
  ideologyScore?: number | null
  userId: string | null
  onSignInRequired: () => void
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

export function RepresentativeCard({
  id, name, title, party, state, district, since, photo, ideologyScore, userId, onSignInRequired,
}: RepresentativeCardProps) {
  const badge = PARTY_STYLES[party]
  const { following, loading: followLoading, toggleFollow } = useFollowPolitician(id, userId, onSignInRequired)
  const [photoError, setPhotoError] = useState(false)

  return (
    <Link href={`/representatives/${id}`} className="block group">
      <div className="bg-white rounded-xl border border-[rgba(28,28,26,0.08)] shadow-[0_1px_4px_rgba(0,0,0,0.06)] hover:shadow-md hover:border-[#7B5E8A]/20 transition-all p-6 flex flex-col items-center text-center gap-4 h-full">
        {photo && !photoError
          ? <Image src={photo} alt={name} width={80} height={80} className="rounded-full object-cover" onError={() => setPhotoError(true)} />
          : <Initials name={name} />
        }

        <div className="flex flex-col items-center gap-1.5">
          <h3 className="text-xl text-[#1C1C1A] group-hover:text-[#7B5E8A] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
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
          {since && (
            <>
              <span className="text-xs text-[#1C1C1A]/40">·</span>
              <span className="text-xs text-[#1C1C1A]/40">Since {since}</span>
            </>
          )}
        </div>

        {ideologyScore !== null && ideologyScore !== undefined && (
          <div className="w-full px-1">
            <div className="flex justify-between text-[10px] text-[#1C1C1A]/30 mb-1.5">
              <span>Liberal</span>
              <span>Conservative</span>
            </div>
            <div className="relative w-full h-1 bg-[#E8E3DA] rounded-full">
              <div
                className="absolute top-1/2 w-2.5 h-2.5 rounded-full bg-[#7B5E8A] border-2 border-white shadow-sm"
                style={{
                  left: `${Math.round(((ideologyScore + 1) / 2) * 100)}%`,
                  transform: 'translateX(-50%) translateY(-50%)',
                }}
              />
            </div>
          </div>
        )}

        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollow() }}
          disabled={followLoading}
          className={`mt-1 w-full py-2 px-4 rounded-lg text-sm border transition-colors ${
            followLoading ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            following
              ? 'bg-[#7B5E8A] border-[#7B5E8A] text-white'
              : 'bg-transparent border-[#7B5E8A] text-[#7B5E8A] hover:bg-[#7B5E8A] hover:text-white'
          }`}
        >
          {following
            ? <span className="flex items-center justify-center gap-1.5"><Check size={14} />Following</span>
            : 'Follow'
          }
        </button>
      </div>
    </Link>
  )
}
