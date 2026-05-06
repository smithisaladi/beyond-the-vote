import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { Initials } from './Initials'

describe('Initials', () => {
  it('renders first and last initial for a full name', () => {
    render(<Initials name="John Smith" />)
    expect(screen.getByText('JS')).toBeInTheDocument()
  })

  it('renders single initial for a one-word name', () => {
    render(<Initials name="Madonna" />)
    expect(screen.getByText('M')).toBeInTheDocument()
  })

  it('uses first and last part for three-word names', () => {
    render(<Initials name="Mary Jane Watson" />)
    expect(screen.getByText('MW')).toBeInTheDocument()
  })

  it('renders in uppercase', () => {
    render(<Initials name="alice brown" />)
    expect(screen.getByText('AB')).toBeInTheDocument()
  })

  it('renders fallback ? for empty string', () => {
    render(<Initials name="" />)
    expect(screen.getByText('?')).toBeInTheDocument()
  })
})
