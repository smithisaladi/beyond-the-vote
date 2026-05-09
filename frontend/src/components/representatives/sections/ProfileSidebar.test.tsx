import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

// InfoTooltip uses portals — mock it to a simple span
vi.mock('@/components/shared/InfoTooltip', () => ({
  InfoTooltip: ({ label }: { label: string }) => <span>{label}</span>,
}))

import { ProfileSidebar } from './ProfileSidebar'
import type { PoliticianStats, Committee } from '@/lib/types/politicians'

const baseStats: PoliticianStats = {
  yearsInOffice: 6,
  attendance: null,
  ideologyScore: null,
}

const noCommittees: Committee[] = []

describe('ProfileSidebar', () => {
  it('renders years in office', () => {
    render(<ProfileSidebar stats={baseStats} nextElectionYear={null} committees={noCommittees} />)
    expect(screen.getByText('6')).toBeInTheDocument()
    expect(screen.getByText(/years in office/i)).toBeInTheDocument()
  })

  it('does not render attendance when null', () => {
    render(<ProfileSidebar stats={baseStats} nextElectionYear={null} committees={noCommittees} />)
    expect(screen.queryByText(/attendance rate/i)).not.toBeInTheDocument()
  })

  it('renders attendance rate when provided', () => {
    render(
      <ProfileSidebar
        stats={{ ...baseStats, attendance: 92 }}
        nextElectionYear={null}
        committees={noCommittees}
      />
    )
    expect(screen.getByText(/attendance rate/i)).toBeInTheDocument()
    expect(screen.getByText('92%')).toBeInTheDocument()
  })

  it('does not render ideology score when null', () => {
    render(<ProfileSidebar stats={baseStats} nextElectionYear={null} committees={noCommittees} />)
    expect(screen.queryByText(/ideology score/i)).not.toBeInTheDocument()
  })

  it('renders ideology score when provided', () => {
    render(
      <ProfileSidebar
        stats={{ ...baseStats, ideologyScore: -0.4 }}
        nextElectionYear={null}
        committees={noCommittees}
      />
    )
    expect(screen.getAllByText(/ideology score/i).length).toBeGreaterThan(0)
  })

  it('renders next election year when provided', () => {
    render(<ProfileSidebar stats={baseStats} nextElectionYear={2026} committees={noCommittees} />)
    expect(screen.getByText('2026')).toBeInTheDocument()
    expect(screen.getByText(/next election/i)).toBeInTheDocument()
  })

  it('does not render committees section when empty', () => {
    render(<ProfileSidebar stats={baseStats} nextElectionYear={null} committees={noCommittees} />)
    expect(screen.queryByText(/committees/i)).not.toBeInTheDocument()
  })

  it('renders committee names', () => {
    const committees: Committee[] = [
      { name: 'Armed Services', title: 'Ranking Member', url: null },
      { name: 'Foreign Relations', title: null, url: null },
    ]
    render(<ProfileSidebar stats={baseStats} nextElectionYear={null} committees={committees} />)
    expect(screen.getByText('Armed Services')).toBeInTheDocument()
    expect(screen.getByText('Foreign Relations')).toBeInTheDocument()
    expect(screen.getByText('Ranking Member')).toBeInTheDocument()
  })

  it('renders committee link when url is present', () => {
    const committees: Committee[] = [{ name: 'Judiciary', title: null, url: 'https://judiciary.senate.gov' }]
    render(<ProfileSidebar stats={baseStats} nextElectionYear={null} committees={committees} />)
    const link = screen.getByRole('link', { name: 'Judiciary' })
    expect(link).toHaveAttribute('href', 'https://judiciary.senate.gov')
  })
})
