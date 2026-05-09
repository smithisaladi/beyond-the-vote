

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
    <Card padding="none" className="p-6 sm:p-8">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
        {politician.photo && !photoError
          ? <img src={politician.photo} alt={politician.name} className="w-24 h-24 rounded-full object-cover flex-shrink-0" onError={onPhotoError} />
          : <Initials name={politician.name} />
        }

        <div className="flex-1 text-center sm:text-left">
          <h1
            className="text-2xl sm:text-3xl text-[#1C1C1A] mb-1 leading-[1.15] tracking-[-0.01em]"
            style={{ fontFamily: 'var(--font-serif)', fontWeight: 600 }}
          >
            {politician.name}
          </h1>
          <p className="text-base text-[#1C1C1A]/60 mb-3">{politician.title}</p>

          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start mb-4">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${PARTY_STYLES[politician.party].bg} ${PARTY_STYLES[politician.party].text}`}>
              {politician.party}
            </span>
            <span className="text-xs text-[#1C1C1A]/40">·</span>
            <span className="text-xs text-[#1C1C1A]/50">{politician.state}</span>
            {politician.district && (
              <>
                <span className="text-xs text-[#1C1C1A]/40">·</span>
                <span className="text-xs text-[#1C1C1A]/50">{politician.district}</span>
              </>
            )}
            {politician.since && (
              <>
                <span className="text-xs text-[#1C1C1A]/40">·</span>
                <span className="text-xs text-[#1C1C1A]/40">Since {politician.since}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-center sm:justify-start">
            {politician.website && (
              <a
                href={politician.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-[#7B5E8A] hover:text-[#6A4F78] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M2 12h20M12 2a15.3 15.3 0 010 20M12 2a15.3 15.3 0 000 20" />
                </svg>
                Official website
              </a>
            )}
            {politician.phone && (
              <a
                href={`tel:${politician.phone}`}
                className="flex items-center gap-1.5 text-xs text-[#1C1C1A]/50 hover:text-[#1C1C1A] transition-colors"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 11.5a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .84h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 8.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                </svg>
                {politician.phone}
              </a>
            )}
            {politician.address && (
              <span className="flex items-center gap-1.5 text-xs text-[#1C1C1A]/40">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                {politician.address}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onFollow}
          disabled={followLoading}
          className={`flex-shrink-0 px-6 py-2.5 rounded-lg text-sm border transition-colors disabled:opacity-60 ${
            following
              ? 'bg-[#7B5E8A] border-[#7B5E8A] text-white'
              : 'bg-transparent border-[#7B5E8A] text-[#7B5E8A] hover:bg-[#7B5E8A] hover:text-white'
          }`}
        >
          {following ? 'Following ✓' : 'Follow'}
        </button>
      </div>
    </Card>
  )
}
