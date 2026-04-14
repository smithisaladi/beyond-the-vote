import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import BillVoteBreakdown from './BillVoteBreakdown'

const makeVote = (overrides: Record<string, unknown> = {}) => ({
  id: 'v1',
  date: '2025-06-01',
  chamber: 'Senate',
  question: 'On Passage',
  result: 'Passed',
  yeas: 60,
  nays: 40,
  partyBreakdown: {
    democrat:    { yea: 40, nay: 5 },
    republican:  { yea: 18, nay: 32 },
    independent: { yea: 2, nay: 3 },
  },
  memberPositions: [
    { bioguideId: 'A000001', name: 'Alice', party: 'Democrat', state: 'CA', photoUrl: null, position: 'Yea' },
    { bioguideId: 'B000002', name: 'Bob', party: 'Republican', state: 'TX', photoUrl: null, position: 'Nay' },
  ],
  ...overrides,
})

describe('BillVoteBreakdown', () => {
  it('renders empty state for no votes', () => {
    render(<BillVoteBreakdown votes={[]} />)
    expect(screen.getByText(/no recorded votes/i)).toBeInTheDocument()
  })

  it('renders vote card with question and result', () => {
    render(<BillVoteBreakdown votes={[makeVote()]} />)
    expect(screen.getByText('On Passage')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('60 Yea')).toBeInTheDocument()
    expect(screen.getByText('40 Nay')).toBeInTheDocument()
  })

  it('shows chamber and date', () => {
    render(<BillVoteBreakdown votes={[makeVote()]} />)
    expect(screen.getByText(/2025-06-01 · Senate/)).toBeInTheDocument()
  })

  it('renders total count', () => {
    render(<BillVoteBreakdown votes={[makeVote()]} />)
    expect(screen.getByText('100 total')).toBeInTheDocument()
  })

  it('expands member positions on click', async () => {
    render(<BillVoteBreakdown votes={[makeVote()]} />)
    const btn = screen.getByText(/Show member positions/i)
    expect(btn).toBeInTheDocument()

    await userEvent.click(btn)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
  })

  it('filters member positions by Yea/Nay', async () => {
    render(<BillVoteBreakdown votes={[makeVote()]} />)
    await userEvent.click(screen.getByText(/Show member positions/))

    // Filter to Yea — find the button whose text content starts with "Yea"
    const yeaButton = screen.getAllByRole('button').find(
      btn => btn.textContent?.startsWith('Yea'),
    )
    expect(yeaButton).toBeDefined()
    await userEvent.click(yeaButton!)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
  })

  it('handles zero-total vote (no bar rendered)', () => {
    const vote = makeVote({ yeas: 0, nays: 0, partyBreakdown: null })
    const { container } = render(<BillVoteBreakdown votes={[vote]} />)
    // VoteBar returns null when total is 0
    expect(container.querySelector('.bg-emerald-500')).not.toBeInTheDocument()
  })

  it('renders multiple votes', () => {
    const votes = [makeVote({ id: 'v1' }), makeVote({ id: 'v2', chamber: 'House' })]
    render(<BillVoteBreakdown votes={votes} />)
    expect(screen.getByText(/Senate/)).toBeInTheDocument()
    expect(screen.getByText(/House/)).toBeInTheDocument()
  })
})
