import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Card } from './Card'

describe('Card', () => {
  it('applies default classes (standard border, shadow, p-6)', () => {
    render(<Card data-testid="c">x</Card>)
    const el = screen.getByTestId('c')
    expect(el.className).toContain('bg-white')
    expect(el.className).toContain('rounded-xl')
    expect(el.className).toContain('border-[rgba(28,28,26,0.08)]')
    expect(el.className).toContain('shadow-[0_1px_4px_rgba(0,0,0,0.06)]')
    expect(el.className).toContain('p-6')
  })

  it('padding="sm" uses p-3', () => {
    render(<Card data-testid="c" padding="sm">x</Card>)
    expect(screen.getByTestId('c').className).toContain('p-3')
  })

  it('padding="xl" uses p-12', () => {
    render(<Card data-testid="c" padding="xl">x</Card>)
    expect(screen.getByTestId('c').className).toContain('p-12')
  })

  it('padding="none" adds no padding class', () => {
    render(<Card data-testid="c" padding="none">x</Card>)
    const className = screen.getByTestId('c').className
    expect(className).not.toMatch(/\bp-\d+\b/)
  })

  it('border="light" swaps to the lighter border and drops the card shadow', () => {
    render(<Card data-testid="c" border="light">x</Card>)
    const className = screen.getByTestId('c').className
    expect(className).toContain('border-[#D6CFC4]')
    expect(className).not.toContain('shadow-[0_1px_4px_rgba(0,0,0,0.06)]')
  })

  it('shadow={false} overrides the default shadow on the standard border', () => {
    render(<Card data-testid="c" shadow={false}>x</Card>)
    expect(screen.getByTestId('c').className).toContain('!shadow-none')
  })

  it('hoverable adds the group-hover classes', () => {
    render(<Card data-testid="c" hoverable>x</Card>)
    const className = screen.getByTestId('c').className
    expect(className).toContain('group-hover:shadow-md')
    expect(className).toContain('transition-all')
  })

  it('merges custom className', () => {
    render(<Card data-testid="c" className="custom-extra">x</Card>)
    expect(screen.getByTestId('c').className).toContain('custom-extra')
  })

  it('renders as a different element when `as` is passed', () => {
    render(<Card as="section" data-testid="c">x</Card>)
    expect(screen.getByTestId('c').tagName).toBe('SECTION')
  })
})
