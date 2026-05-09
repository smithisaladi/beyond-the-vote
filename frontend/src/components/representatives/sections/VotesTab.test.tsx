import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { VotesTab } from './VotesTab'
import type { PoliticianVote } from '@/lib/types/politicians'

const makeVote = (overrides: Partial<PoliticianVote> = {}): PoliticianVote => ({
  id: 'v1',
  date: '2025-01-15',
  bill: 'S.1234',
  billId: null,
  billTitle: '',
  question: 'On passage of the bill',
  vote: 'Yea',
  donorAlignments: [],
  ...overrides,
})

describe('VotesTab', () => {
  it('shows empty message when no votes', () => {
    render(<VotesTab votes={[]} politicianId="P001" />)
    expect(screen.getByText(/no final passage votes found/i)).toBeInTheDocument()
  })

  it('renders vote question and vote badge', () => {
    // When billTitle is set, component renders "{stripped question}: {billTitle}"
    render(<VotesTab votes={[makeVote({ billTitle: 'Health Act', billId: 'hr-1' })]} politicianId="P001" />)
    // Component strips leading "On " so "On passage of the bill" → "passage of the bill: Health Act"
    expect(screen.getByText(/passage of the bill: Health Act/i)).toBeInTheDocument()
    expect(screen.getByText('Yea')).toBeInTheDocument()
  })

  it('renders Nay badge for a nay vote', () => {
    render(<VotesTab votes={[makeVote({ vote: 'Nay', question: 'On passage of the bill' })]} politicianId="P001" />)
    expect(screen.getByText('Nay')).toBeInTheDocument()
  })

  it('renders vote date', () => {
    render(<VotesTab votes={[makeVote()]} politicianId="P001" />)
    expect(screen.getByText('2025-01-15')).toBeInTheDocument()
  })

  it('renders a link when billId is present', () => {
    render(<VotesTab votes={[makeVote({ billId: 'hr-123', billTitle: 'Health Act' })]} politicianId="P001" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/bills/hr-123?from=/representatives/P001')
  })

  it('filter tabs are shown when votes exist', () => {
    render(<VotesTab votes={[makeVote()]} politicianId="P001" />)
    expect(screen.getByRole('tab', { name: 'Final' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'All' })).toBeInTheDocument()
  })

  it('switching to All filter shows non-final votes', async () => {
    const nonFinalVote = makeVote({ id: 'v2', question: 'On the Amendment', vote: 'Nay' })
    render(<VotesTab votes={[makeVote(), nonFinalVote]} politicianId="P001" />)

    // Initially in Final mode — only final passage vote shown
    expect(screen.getAllByText(/^(Yea|Nay)$/).length).toBe(1)

    await userEvent.click(screen.getByRole('tab', { name: 'All' }))
    // Both votes shown
    expect(screen.getAllByText(/^(Yea|Nay)$/).length).toBe(2)
  })

  it('shows load more button when votes exceed 10', async () => {
    const votes = Array.from({ length: 12 }, (_, i) =>
      makeVote({ id: `v${i}`, question: 'On passage of the bill' })
    )
    render(<VotesTab votes={votes} politicianId="P001" />)
    expect(screen.getByRole('button', { name: /load 2 more/i })).toBeInTheDocument()
  })
})
