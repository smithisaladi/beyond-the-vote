import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { HeroCard } from './HeroCard'

const basePolitician = {
  name: 'Jane Doe',
  photo: null,
  title: 'U.S. Senator',
  party: 'Democrat' as const,
  state: 'CA',
  district: undefined,
  since: '2018',
  website: null,
  phone: null,
  address: null,
}

describe('HeroCard', () => {
  it('renders politician name', () => {
    render(
      <HeroCard
        politician={basePolitician}
        following={false}
        followLoading={false}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
  })

  it('renders title and state', () => {
    render(
      <HeroCard
        politician={basePolitician}
        following={false}
        followLoading={false}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByText('U.S. Senator')).toBeInTheDocument()
    expect(screen.getByText('CA')).toBeInTheDocument()
  })

  it('shows initials avatar when photo is null', () => {
    render(
      <HeroCard
        politician={basePolitician}
        following={false}
        followLoading={false}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('shows initials avatar when photoError is true', () => {
    render(
      <HeroCard
        politician={{ ...basePolitician, photo: 'https://example.com/photo.jpg' }}
        following={false}
        followLoading={false}
        photoError={true}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByText('JD')).toBeInTheDocument()
  })

  it('shows Follow button when not following', () => {
    render(
      <HeroCard
        politician={basePolitician}
        following={false}
        followLoading={false}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Follow' })).toBeInTheDocument()
  })

  it('shows Following ✓ when following', () => {
    render(
      <HeroCard
        politician={basePolitician}
        following={true}
        followLoading={false}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /following/i })).toBeInTheDocument()
  })

  it('calls onFollow when Follow button is clicked', async () => {
    const onFollow = vi.fn()
    render(
      <HeroCard
        politician={basePolitician}
        following={false}
        followLoading={false}
        photoError={false}
        onFollow={onFollow}
        onPhotoError={vi.fn()}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Follow' }))
    expect(onFollow).toHaveBeenCalledTimes(1)
  })

  it('disables button when followLoading', () => {
    render(
      <HeroCard
        politician={basePolitician}
        following={false}
        followLoading={true}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Follow' })).toBeDisabled()
  })

  it('renders party badge', () => {
    render(
      <HeroCard
        politician={basePolitician}
        following={false}
        followLoading={false}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByText('Democrat')).toBeInTheDocument()
  })

  it('renders website link when present', () => {
    render(
      <HeroCard
        politician={{ ...basePolitician, website: 'https://doe.senate.gov' }}
        following={false}
        followLoading={false}
        photoError={false}
        onFollow={vi.fn()}
        onPhotoError={vi.fn()}
      />
    )
    expect(screen.getByText('Official website')).toBeInTheDocument()
  })
})
