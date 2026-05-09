import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { PartyLean } from './PartyLean'

describe('PartyLean', () => {
  it('renders nothing for empty recipients', () => {
    const { container } = render(<PartyLean recipients={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows single-party breakdown', () => {
    const recipients = [
      { party: 'Republican' },
      { party: 'Republican' },
      { party: 'Republican' },
    ]
    render(<PartyLean recipients={recipients} />)
    expect(screen.getByText('3R')).toBeInTheDocument()
  })

  it('shows two-party breakdown', () => {
    const recipients = [
      { party: 'Democrat' },
      { party: 'Democrat' },
      { party: 'Republican' },
    ]
    render(<PartyLean recipients={recipients} />)
    expect(screen.getByText('1R · 2D')).toBeInTheDocument()
  })

  it('shows three-party breakdown', () => {
    const recipients = [
      { party: 'Republican' },
      { party: 'Democrat' },
      { party: 'Independent' },
    ]
    render(<PartyLean recipients={recipients} />)
    expect(screen.getByText('1R · 1D · 1I')).toBeInTheDocument()
  })

  it('normalizes non-canonical party names to Independent', () => {
    const recipients = [
      { party: 'Libertarian' },
      { party: 'Democrat' },
    ]
    render(<PartyLean recipients={recipients} />)
    expect(screen.getByText('1D · 1I')).toBeInTheDocument()
  })

  it('renders the correct number of bar segments', () => {
    const recipients = [
      { party: 'Democrat' },
      { party: 'Republican' },
    ]
    const { container } = render(<PartyLean recipients={recipients} />)
    // Bar container has R and D segments
    const bar = container.querySelector('.flex.h-1')
    expect(bar?.children.length).toBe(2)
  })

  it('applies custom barClassName', () => {
    const { container } = render(
      <PartyLean recipients={[{ party: 'Democrat' }]} barClassName="w-48" />,
    )
    const bar = container.querySelector('.flex.h-1')
    expect(bar?.className).toContain('w-48')
  })
})
