

import { Globe, MapPin, Phone } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { PARTY_STYLES } from '@/lib/ui'
import { Initials } from './Initials'
import type { Politician } from '@/lib/types/politicians'

interface HeroCardProps {
  politician: Pick<Politician,
    'name' | 'photo' | 'title' | 'party' | 'state' | 'district' | 'since' |
    'website' | 'phone' | 'address'
  >
  following: boolean
  followLoading: boolean
  photoError: boolean
  onFollow: () => void
  onPhotoError: () => void
}

export function HeroCard({
  politician,
  following,
  followLoading,
  photoError,
  onFollow,
  onPhotoError,
}: HeroCardProps) {
  return (
    <Card>
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
        {politician.photo && !photoError
          ? <img src={politician.photo} alt={politician.name} width={80} height={80} className="w-20 h-20 rounded-full object-cover flex-shrink-0" onError={onPhotoError} />
          : <Initials name={politician.name} />
        }

        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-2xl font-serif font-semibold text-fg mb-0.5 leading-[1.15]">
            {politician.name}
          </h1>
          <p className="text-[13px] text-fg/60 mb-3">{politician.title}</p>

          <div className="flex items-center gap-1.5 flex-wrap justify-center sm:justify-start mb-3">
            <span className={`text-[10px] font-medium px-1.5 py-px rounded-full ${PARTY_STYLES[politician.party].bg} ${PARTY_STYLES[politician.party].text}`}>
              {politician.party}
            </span>
            <span className="text-xs text-fg/40">·</span>
            <span className="text-xs text-fg/50">{politician.state}</span>
            {politician.district && (
              <>
                <span className="text-xs text-fg/40">·</span>
                <span className="text-xs text-fg/50">{politician.district}</span>
              </>
            )}
            {politician.since && (
              <>
                <span className="text-xs text-fg/40">·</span>
                <span className="text-xs text-fg/40">Since {politician.since}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-start">
            {politician.website && (
              <a
                href={politician.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-accent hover:text-accent/80 transition-colors"
              >
                <Globe size={12} strokeWidth={1.8} />
                Official website
              </a>
            )}
            {politician.phone && (
              <a
                href={`tel:${politician.phone}`}
                className="flex items-center gap-1.5 text-xs text-fg/50 hover:text-fg transition-colors"
              >
                <Phone size={12} strokeWidth={1.8} />
                {politician.phone}
              </a>
            )}
            {politician.address && (
              <span className="flex items-center gap-1.5 text-xs text-fg/40">
                <MapPin size={12} strokeWidth={1.8} />
                {politician.address}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onFollow}
          disabled={followLoading}
          className={`flex-shrink-0 px-5 py-2.5 rounded-lg text-[13px] border transition-colors disabled:opacity-60 ${
            following
              ? 'bg-accent-deep border-accent-deep text-white'
              : 'bg-transparent border-accent text-accent hover:bg-accent-deep hover:border-accent-deep hover:text-white'
          }`}
        >
          {following ? 'Following ✓' : 'Follow'}
        </button>
      </div>
    </Card>
  )
}
