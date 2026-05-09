import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { ErrorState } from './ErrorState'

function makeError(digest?: string) {
  const err = new Error('Something went wrong') as Error & { digest?: string }
  if (digest) err.digest = digest
  return err
}

describe('ErrorState', () => {
  it('renders title and description', () => {
    render(
      <ErrorState
        title="Oops"
        description="Something broke"
        error={makeError()}
        reset={() => {}}
      />,
    )
    expect(screen.getByText('Oops')).toBeInTheDocument()
    expect(screen.getByText('Something broke')).toBeInTheDocument()
  })

  it('shows error digest when present', () => {
    render(
      <ErrorState
        title="Error"
        description="desc"
        error={makeError('abc123')}
        reset={() => {}}
      />,
    )
    expect(screen.getByText(/Error ID: abc123/)).toBeInTheDocument()
  })

  it('hides error digest when absent', () => {
    render(
      <ErrorState
        title="Error"
        description="desc"
        error={makeError()}
        reset={() => {}}
      />,
    )
    expect(screen.queryByText(/Error ID/)).not.toBeInTheDocument()
  })

  it('calls reset when "Try again" is clicked', async () => {
    const reset = vi.fn()
    render(
      <ErrorState title="Error" description="desc" error={makeError()} reset={reset} />,
    )
    await userEvent.click(screen.getByText('Try again'))
    expect(reset).toHaveBeenCalledOnce()
  })

  it('renders "Go home" link by default', () => {
    render(
      <ErrorState title="Error" description="desc" error={makeError()} reset={() => {}} />,
    )
    const link = screen.getByText('Go home')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute('href', '/')
  })

  it('renders custom back link', () => {
    render(
      <ErrorState
        title="Error"
        description="desc"
        error={makeError()}
        reset={() => {}}
        backHref="/bills"
        backLabel="Back to bills"
      />,
    )
    const link = screen.getByText('Back to bills')
    expect(link.closest('a')).toHaveAttribute('href', '/bills')
  })

  it('renders icon when provided', () => {
    render(
      <ErrorState
        title="Error"
        description="desc"
        error={makeError()}
        reset={() => {}}
        icon={<span data-testid="icon">!</span>}
      />,
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
  })
})
