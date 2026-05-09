import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { DonorAlignmentPanel } from './DonorAlignmentPanel'
import type { DonorAlignment } from '@/lib/types/politicians'

const makeAlignment = (overrides: Partial<DonorAlignment> = {}): DonorAlignment => ({
  donorName: 'BigCorp PAC',
  donorAmount: 10000,
  donorLikelyPosition: 'support',
  explanation: 'Voted in line with donor interests on healthcare.',
  voteAligns: true,
  ...overrides,
})

describe('DonorAlignmentPanel', () => {
  it('renders nothing when alignments is empty', () => {
    const { container } = render(<DonorAlignmentPanel alignments={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('shows connection count in collapsed state', () => {
    render(<DonorAlignmentPanel alignments={[makeAlignment(), makeAlignment({ donorName: 'OtherPAC' })]} />)
    expect(screen.getByText(/2 connections/i)).toBeInTheDocument()
  })

  it('shows singular "connection" for 1 alignment', () => {
    render(<DonorAlignmentPanel alignments={[makeAlignment()]} />)
    expect(screen.getByText(/1 connection\b/i)).toBeInTheDocument()
  })

  it('details are hidden before toggle', () => {
    render(<DonorAlignmentPanel alignments={[makeAlignment()]} />)
    expect(screen.queryByText('BigCorp PAC')).not.toBeInTheDocument()
  })

  it('expands to show donor name and explanation on click', async () => {
    render(<DonorAlignmentPanel alignments={[makeAlignment()]} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText('BigCorp PAC')).toBeInTheDocument()
    expect(screen.getByText(/Voted in line/i)).toBeInTheDocument()
  })

  it('shows formatted dollar amount', async () => {
    render(<DonorAlignmentPanel alignments={[makeAlignment({ donorAmount: 10000 })]} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByText(/\$10,000/)).toBeInTheDocument()
  })

  it('collapses again on second click', async () => {
    render(<DonorAlignmentPanel alignments={[makeAlignment()]} />)
    const btn = screen.getByRole('button')
    await userEvent.click(btn)
    expect(screen.getByText('BigCorp PAC')).toBeInTheDocument()
    await userEvent.click(btn)
    expect(screen.queryByText('BigCorp PAC')).not.toBeInTheDocument()
  })
})
