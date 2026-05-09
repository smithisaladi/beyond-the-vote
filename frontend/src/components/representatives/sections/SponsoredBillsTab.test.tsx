import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { SponsoredBillsTab } from './SponsoredBillsTab'
import type { PoliticianBill } from '@/lib/types/politicians'

const makeBill = (overrides: Partial<PoliticianBill> = {}): PoliticianBill => ({
  id: 'hr-100',
  name: 'Clean Energy Act',
  number: 'H.R. 100',
  date: '2025-03-01',
  status: 'Passed',
  ...overrides,
})

describe('SponsoredBillsTab', () => {
  it('shows empty state when no bills', () => {
    render(<SponsoredBillsTab bills={[]} politicianId="P001" />)
    expect(screen.getByText(/no sponsored bills found/i)).toBeInTheDocument()
  })

  it('renders bill name', () => {
    render(<SponsoredBillsTab bills={[makeBill()]} politicianId="P001" />)
    expect(screen.getByText('Clean Energy Act')).toBeInTheDocument()
  })

  it('renders bill number and date', () => {
    render(<SponsoredBillsTab bills={[makeBill()]} politicianId="P001" />)
    expect(screen.getByText(/H\.R\. 100 · 2025-03-01/)).toBeInTheDocument()
  })

  it('renders a status badge', () => {
    render(<SponsoredBillsTab bills={[makeBill({ status: 'Failed' })]} politicianId="P001" />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('links to bill detail with from-param', () => {
    render(<SponsoredBillsTab bills={[makeBill()]} politicianId="P001" />)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('href', '/bills/hr-100?from=/representatives/P001')
  })

  it('renders multiple bills', () => {
    render(<SponsoredBillsTab bills={[makeBill(), makeBill({ id: 'hr-200', name: 'Tax Reform Bill' })]} politicianId="P001" />)
    expect(screen.getByText('Clean Energy Act')).toBeInTheDocument()
    expect(screen.getByText('Tax Reform Bill')).toBeInTheDocument()
  })
})
