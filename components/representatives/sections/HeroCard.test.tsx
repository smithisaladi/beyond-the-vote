import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { HeroCard } from './HeroCard'
import type { Politician } from '@/lib/types/politicians'

type HeroPolitician = Pick<
  Politician,
  'name' | 'photo' | 'title' | 'party' | 'state' | 'district' | 'since' | 'website' | 'phone' | 'address'
>

const defaultPolitician: HeroPolitician = {
  name: 'Jane Doe',
  photo: null,
  title: 'U.S. Senator',
  party: 'Democrat',
  state: 'CA',
  district: undefined,
  since: '2018',
  website: null,
  phone: null,
  address: null,
}

const defaultProps = {
  politician: defaultPolitician,
  following: false,
  followLoading: false,
  photoError: false,
  onFollow: vi.fn(),
  onPhotoError: vi.fn(),
}

function renderHeroCard(
  overrides: Omit<Partial<typeof defaultProps>, 'politician'> & {
    politician?: Partial<HeroPolitician>
  } = {},
) {
  const props = {
    ...defaultProps,
    ...overrides,
    politician: { ...defaultPolitician, ...overrides.politician },
    onFollow: overrides.onFollow ?? vi.fn(),
    onPhotoError: overrides.onPhotoError ?? vi.fn(),
  }
  return render(<HeroCard {...props} />)
}

describe('HeroCard', () => {
  it('renders politician name', () => {
    renderHeroCard()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders title and state', () => {
    renderHeroCard()
    expect(screen.getByText('U.S. Senator')).toBeInTheDocument()
    expect(screen.getByText('CA')).toBeInTheDocument()
  })

  it('shows initials avatar when photo is null', () => {
    renderHeroCard()
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('shows initials avatar when photoError is true', () => {
    renderHeroCard({
      politician: { photo: 'https://example.com/photo.jpg' },
      photoError: true,
    })
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('shows Follow button when not following', () => {
    renderHeroCard()
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })

  it('shows Following when following', () => {
    renderHeroCard({ following: true })
    expect(screen.getByRole('button', { name: /following/i })).toBeInTheDocument()
  })

  it('calls onFollow when Follow button is clicked', async () => {
    const onFollow = vi.fn()
    renderHeroCard({ onFollow })
    await userEvent.click(screen.getByRole('button', { name: 'Follow' }))
    expect(onFollow).toHaveBeenCalledTimes(1)
  })

  it('disables button when followLoading', () => {
    renderHeroCard({ followLoading: true })
    expect(screen.getByRole('button', { name: 'Follow' })).toBeDisabled()
  })

  it('renders party badge', () => {
    renderHeroCard()
    expect(screen.getByText('Democrat')).toBeInTheDocument()
  })

  it('renders website link when present', () => {
    renderHeroCard({ politician: { website: 'https://doe.senate.gov' } })
    expect(screen.getByText('Official website')).toBeInTheDocument()
  })
})
