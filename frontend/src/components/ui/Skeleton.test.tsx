import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Skeleton } from './Skeleton'

describe('Skeleton', () => {
  it('renders with the shared skeleton fill and a rounded default', () => {
    render(<Skeleton data-testid="s" />)
    const el = screen.getByTestId('s')
    expect(el.className).toContain('bg-[#E8E3DA]')
    expect(el.className).toContain('rounded')
  })

  it('merges custom className (size/shape)', () => {
    render(<Skeleton data-testid="s" className="h-4 w-24 rounded-full" />)
    const el = screen.getByTestId('s')
    expect(el.className).toContain('h-4')
    expect(el.className).toContain('w-24')
    expect(el.className).toContain('rounded-full')
    expect(el.className).toContain('bg-[#E8E3DA]')
  })
})
