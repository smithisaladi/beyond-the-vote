

import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { motion } from 'motion/react'
import { useFollowedPoliticians, useFollowPolitician } from '@/hooks/queries/useDashboard'
import type { Party } from '@/lib/types'
import { PARTY_STYLES } from '@/lib/ui'
import { Card } from '@/components/ui/Card'
import { TAP_SPRING } from '@/components/ui/motion'
import { Initials } from './sections/Initials'

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

export function RepresentativeCard({
  id, name, title, party, state, district, since, photo, userId, onSignInRequired,
}: RepresentativeCardProps) {
  const badge = PARTY_STYLES[party] || PARTY_STYLES.Independent
  const { data: followedData } = useFollowedPoliticians()
  const followMutation = useFollowPolitician()
  const followedIds = new Set((followedData?.politicians ?? []).map((p: { id: string }) => p.id))
  const following = followedIds.has(id)
  const followLoading = followMutation.isPending
  const toggleFollow = () => {
    if (!userId) { onSignInRequired(); return }
    followMutation.mutate({ politicianId: id, follow: !following })
  }
  const [photoError, setPhotoError] = useState(false)

  return (
    <Link to="/representatives/$id" params={{ id }} className="block group">
      <Card hoverable padding="sm" className="flex flex-col items-center text-center gap-2.5 h-full">
        {photo && !photoError
          ? <img src={photo} alt={name} width={64} height={80} className="w-16 h-20 rounded-full object-cover flex-shrink-0" onError={() => setPhotoError(true)} />
          : <Initials name={name} />
        }

        <div className="flex flex-col items-center gap-0.5">
          <h3 className="text-[15px] font-serif font-semibold text-fg leading-snug group-hover:text-accent transition-colors">
            {name}
          </h3>
          <p className="text-xs text-fg/60">{title}</p>
        </div>

        <div className="flex items-center gap-1 flex-wrap justify-center">
          <span className={`text-[10px] font-medium px-1.5 py-px rounded-full ${badge.bg} ${badge.text}`}>
            {badge.label}
          </span>
          <span className="text-[10px] text-fg/50">
            {state}{district ? ` · ${district}` : ''}
          </span>
          {since && (
            <>
              <span className="text-[10px] text-fg/25">·</span>
              <span className="text-[10px] text-fg/40">Since {since}</span>
            </>
          )}
        </div>

        <motion.button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollow() }}
          disabled={followLoading}
          {...TAP_SPRING}
          className={`mt-auto w-full py-1.5 px-3 rounded-lg text-xs border transition-colors ${
            followLoading ? 'opacity-50 cursor-not-allowed' : ''
          } ${
            following
              ? 'bg-accent-deep border-accent-deep text-white'
              : 'bg-transparent border-accent text-accent hover:bg-accent-deep hover:border-accent-deep hover:text-white'
          }`}
        >
          {following
            ? <span className="flex items-center justify-center gap-1"><Check size={12} />Following</span>
            : 'Follow'
          }
        </motion.button>
      </Card>
    </Link>
  )
}
