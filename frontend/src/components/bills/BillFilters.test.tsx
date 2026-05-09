import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React, { useRef } from 'react'
import { BillFilters } from './BillFilters'
import type { BillFiltersState } from '@/hooks/useBillFilters'

function makeFilters(overrides: Partial<BillFiltersState> = {}): Omit<BillFiltersState, 'dropdownRef'> {
  return {
    query: '',
    setQuery: vi.fn(),
    debouncedQuery: '',
    selectedStatuses: new Set(),
    toggleStatus: vi.fn(),
    dateFilter: 'all',
    setDateFilter: vi.fn(),
    selectedTopics: new Set(),
    toggleTopic: vi.fn(),
    sort: 'newest',
    setSort: vi.fn(),
    showTrackedOnly: false,
    setShowTrackedOnly: vi.fn(),
    hasFilters: false,
    clearAll: vi.fn(),
    openDropdown: null,
    setOpenDropdown: vi.fn(),
    ...overrides,
  }
}

// Wrapper to provide a real ref
function TestBillFilters({ filterOverrides = {}, user = null }: { filterOverrides?: Partial<BillFiltersState>; user?: { id: string } | null }) {
  const dropdownRef = useRef<HTMLDivElement>(null)
  const filters = { ...makeFilters(filterOverrides), dropdownRef } as BillFiltersState
  return (
    <BillFilters
      filters={filters}
      user={user as Parameters<typeof BillFilters>[0]['user']}
    />
  )
}

describe('BillFilters', () => {
  it('renders Status, Last Action, Topics, and Sort chips by default', () => {
    render(<TestBillFilters />)
    expect(screen.getByText('Status')).toBeInTheDocument()
    expect(screen.getByText('Last Action')).toBeInTheDocument()
    expect(screen.getByText('Topics')).toBeInTheDocument()
    expect(screen.getByText('Latest first')).toBeInTheDocument()
  })

  it('hides Sort chip when debouncedQuery is set', () => {
    render(<TestBillFilters filterOverrides={{ debouncedQuery: 'climate' }} />)
    expect(screen.queryByText('Latest first')).not.toBeInTheDocument()
    expect(screen.queryByText('Oldest first')).not.toBeInTheDocument()
  })

  it('shows Tracked pill when user is logged in', () => {
    render(<TestBillFilters user={{ id: 'u1' }} />)
    expect(screen.getByText('Tracked')).toBeInTheDocument()
  })

  it('does not show Tracked pill when user is null', () => {
    render(<TestBillFilters />)
    expect(screen.queryByText('Tracked')).not.toBeInTheDocument()
  })

  it('does not show Clear all when nothing is active', () => {
    render(<TestBillFilters />)
    expect(screen.queryByText(/clear all/i)).not.toBeInTheDocument()
  })

  it('shows Clear all when hasFilters is true', () => {
    render(<TestBillFilters filterOverrides={{ hasFilters: true }} />)
    expect(screen.getByText(/clear all/i)).toBeInTheDocument()
  })

  it('calls clearAll when Clear all is clicked', async () => {
    const clearAll = vi.fn()
    render(<TestBillFilters filterOverrides={{ hasFilters: true, clearAll }} />)
    await userEvent.click(screen.getByText(/clear all/i))
    expect(clearAll).toHaveBeenCalledTimes(1)
  })

  it('calls setOpenDropdown when Status chip is clicked', async () => {
    const setOpenDropdown = vi.fn()
    render(<TestBillFilters filterOverrides={{ setOpenDropdown }} />)
    await userEvent.click(screen.getByText('Status'))
    expect(setOpenDropdown).toHaveBeenCalledWith('status')
  })

  it('shows status options when openDropdown is "status"', () => {
    render(<TestBillFilters filterOverrides={{ openDropdown: 'status' }} />)
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Passed')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('shows active status label when statuses are selected', () => {
    render(<TestBillFilters filterOverrides={{ selectedStatuses: new Set(['Active']) as BillFiltersState['selectedStatuses'] }} />)
    expect(screen.getByText('Status: Active')).toBeInTheDocument()
  })
})
