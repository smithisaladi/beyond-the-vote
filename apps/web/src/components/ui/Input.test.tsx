// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Input } from './Input'

describe('Input', () => {
  it('renders an input with dark styling and merges className', () => {
    render(<Input placeholder="Email" className="w-64" />)
    const input = screen.getByPlaceholderText('Email')
    expect(input.className).toContain('bg-bg')
    expect(input.className).toContain('border-edge')
    expect(input.className).toContain('w-64')
  })

  it('passes through native props', () => {
    render(<Input type="password" placeholder="Password" disabled />)
    const input = screen.getByPlaceholderText('Password') as HTMLInputElement
    expect(input.type).toBe('password')
    expect(input.disabled).toBe(true)
  })
})
