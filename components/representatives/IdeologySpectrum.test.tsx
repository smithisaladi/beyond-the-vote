import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import IdeologySpectrum from './IdeologySpectrum'
import { PARTY_STYLES } from '@/lib/ui'

describe('IdeologySpectrum', () => {
  it('renders "unavailable" when score is null', () => {
    render(<IdeologySpectrum score={null} />)
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument()
  })

  it('renders the ideology label for a given score', () => {
    render(<IdeologySpectrum score={-0.5} />)
    expect(screen.getByText('Liberal')).toBeInTheDocument()
  })

  it('renders "Very Liberal" at -0.8', () => {
    render(<IdeologySpectrum score={-0.8} />)
    // The label text appears in the center span (font-medium); the axis also shows "Very Liberal"
    const matches = screen.getAllByText('Very Liberal')
    expect(matches.length).toBeGreaterThanOrEqual(2) // axis label + computed label
  })

  it('renders "Very Conservative" at 0.8', () => {
    render(<IdeologySpectrum score={0.8} />)
    const matches = screen.getAllByText('Very Conservative')
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('renders "Moderate" at 0', () => {
    render(<IdeologySpectrum score={0} />)
    expect(screen.getByText('Moderate')).toBeInTheDocument()
  })

  it('shows the raw numeric score', () => {
    render(<IdeologySpectrum score={-0.423} />)
    expect(screen.getByText('-0.423')).toBeInTheDocument()
  })

  it('positions the member dot correctly (score 0 → 50%)', () => {
    const { container } = render(<IdeologySpectrum score={0} />)
    const dot = container.querySelector('[title="Score: 0.000"]')
    expect(dot).toHaveStyle({ left: '50%' })
  })

  it('positions the member dot at 0% for score -1', () => {
    const { container } = render(<IdeologySpectrum score={-1} />)
    const dot = container.querySelector('[title="Score: -1.000"]')
    expect(dot).toHaveStyle({ left: '0%' })
  })

  it('positions the member dot at 100% for score +1', () => {
    const { container } = render(<IdeologySpectrum score={1} />)
    const dot = container.querySelector('[title="Score: 1.000"]')
    expect(dot).toHaveStyle({ left: '100%' })
  })

  it('uses the Democrat party color for Democrat', () => {
    const { container } = render(<IdeologySpectrum score={-0.4} party="Democrat" />)
    const dot = container.querySelector('[title="Score: -0.400"]')
    expect(dot).toHaveStyle({ background: PARTY_STYLES.Democrat.hex })
  })

  it('uses the Republican party color for Republican', () => {
    const { container } = render(<IdeologySpectrum score={0.4} party="Republican" />)
    const dot = container.querySelector('[title="Score: 0.400"]')
    expect(dot).toHaveStyle({ background: PARTY_STYLES.Republican.hex })
  })

  it('uses the Independent party color for unknown / Independent', () => {
    const { container } = render(<IdeologySpectrum score={0} party="Independent" />)
    const dot = container.querySelector('[title="Score: 0.000"]')
    expect(dot).toHaveStyle({ background: PARTY_STYLES.Independent.hex })
  })

  it('renders chamber median marker when provided', () => {
    const { container } = render(<IdeologySpectrum score={0} chamberMedian={-0.2} />)
    const marker = container.querySelector('[title*="Chamber median"]')
    expect(marker).toBeInTheDocument()
    expect(screen.getByText('Chamber median')).toBeInTheDocument()
  })

  it('renders party median marker when provided', () => {
    const { container } = render(<IdeologySpectrum score={0} partyMedian={0.3} />)
    const marker = container.querySelector('[title*="Party median"]')
    expect(marker).toBeInTheDocument()
    expect(screen.getByText('Party median')).toBeInTheDocument()
  })

  it('hides median legends when neither is provided', () => {
    render(<IdeologySpectrum score={0} />)
    expect(screen.queryByText('Chamber median')).not.toBeInTheDocument()
    expect(screen.queryByText('Party median')).not.toBeInTheDocument()
  })
})
