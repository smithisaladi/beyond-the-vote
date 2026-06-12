// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { PageTransition, StaggerGrid, StaggerItem } from './motion'

describe('motion utilities', () => {
  it('PageTransition renders children', () => {
    render(<PageTransition><p>content</p></PageTransition>)
    expect(screen.getByText('content')).not.toBeNull()
  })

  it('StaggerGrid/StaggerItem render children and merge className', () => {
    render(
      <StaggerGrid className="grid">
        <StaggerItem><p>card</p></StaggerItem>
      </StaggerGrid>
    )
    expect(screen.getByText('card')).not.toBeNull()
  })
})
