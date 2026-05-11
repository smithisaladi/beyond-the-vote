

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
// TODO: port useFollowPolitician hook
import type { Party } from '@/lib/types'
import { PARTY_STYLES } from '@/lib/ui'
import { Card } from '@/components/ui/Card'

interface RepresentativeCardProps {
  id: string
  name: string
  title: string
  party: Party
  state: string
  district?: string
  since: string | null
  photo?: string | null
  userId: string | null
  onSignInRequired: () => void
}


function Initials({ name }: { name: string }) {
  const parts = name.trim().split(' ')
  const initials = parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : parts[0][0]
  return (
    <div className="w-20 h-24 rounded-full bg-[#E8E3DA] flex items-center justify-center flex-shrink-0">
      <span className="text-lg text-[#1C1C1A]/50 font-medium" style={{ fontFamily: 'var(--font-serif)' }}>
        {initials.toUpperCase()}
      </span>
    </div>
  )
}

export function RepresentativeCard({
  id, name, title, party, state, district, since, photo, userId, onSignInRequired,
}: RepresentativeCardProps) {
  const badge = PARTY_STYLES[party] || { bg: 'bg-[#8A8A7A]/[0.12]', text: 'text-[#8A8A7A]' }
  // TODO: port useFollowPolitician hook
  const following = false
  const followLoading = false
  const toggleFollow = () => { if (!userId) onSignInRequired() }
  const [photoError, setPhotoError] = useState(false)

  return (
    <Link to={`/representatives/${id}`} className="block group">
      <Card hoverable padding="md" className="flex flex-col items-center text-center gap-3 h-full">
        {photo && !photoError
          ? <img src={photo} alt={name} width={80} height={96} className="w-20 h-24 rounded-full object-cover flex-shrink-0" onError={() => setPhotoError(true)} />
          : <Initials name={name} />
        }

        <div className="flex flex-col items-center gap-1">
          <h3 className="text-base text-[#1C1C1A] leading-snug group-hover:text-[#7B5E8A] transition-colors" style={{ fontFamily: 'var(--font-serif)' }}>
            {name}
          </h3>
          <p className="text-xs text-[#1C1C1A]/60">{title}</p>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap justify-center">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          <span className="text-[11px] text-[#1C1C1A]/50">
            {state}{district ? ` · ${district}` : ''}
          </span>
          {since && (
            <>
              <span className="text-[11px] text-[#1C1C1A]/25">·</span>
              <span className="text-[11px] text-[#1C1C1A]/40">Since {since}</span>
            </>
          )}
        </div>

        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollow() }}
          disabled={followLoading}
          className={`mt-auto w-full py-1.5 px-3 rounded-lg text-xs border transition-colors ${
            followLoading ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            following
              ? 'bg-[#7B5E8A] border-[#7B5E8A] text-white'
              : 'bg-transparent border-[#7B5E8A] text-[#7B5E8A] hover:bg-[#7B5E8A] hover:text-white'
          }`}
        >
          {following
            ? <span className="flex items-center justify-center gap-1"><Check size={12} />Following</span>
            : 'Follow'
          }
        </button>
      </Card>
    </Link>
  )
}
