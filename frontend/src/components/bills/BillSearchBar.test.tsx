import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { BillSearchBar } from './BillSearchBar'

describe('BillSearchBar', () => {
  it('renders the search input', () => {
    render(<BillSearchBar query="" onQueryChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('reflects the query value in the input', () => {
    render(<BillSearchBar query="climate" onQueryChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toHaveValue('climate')
  })

  it('calls onQueryChange when typing', async () => {
    const onQueryChange = vi.fn()
    render(<BillSearchBar query="" onQueryChange={onQueryChange} />)
    await userEvent.type(screen.getByRole('textbox'), 'tax')
    expect(onQueryChange).toHaveBeenCalledTimes(3)
    expect(onQueryChange).toHaveBeenLastCalledWith('x')
  })

  it('does not show clear button when query is empty', () => {
    render(<BillSearchBar query="" onQueryChange={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('shows clear button when query has value', () => {
    render(<BillSearchBar query="climate" onQueryChange={vi.fn()} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls onQueryChange with empty string when clear is clicked', async () => {
    const onQueryChange = vi.fn()
    render(<BillSearchBar query="climate" onQueryChange={onQueryChange} />)
    await userEvent.click(screen.getByRole('button'))
    expect(onQueryChange).toHaveBeenCalledWith('')
  })
})
