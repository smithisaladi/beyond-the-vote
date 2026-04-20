import { describe, it, expect, vi, afterEach } from 'vitest'
import { mapStatus, formatBillId } from './bills'

describe('mapStatus', () => {
  afterEach(() => { vi.useRealTimers() })

  it.each([
    'Became Public Law No: 119-1.',
    'Signed by President.',
    'Passed the Senate with amendments.',
    'Passed the House.',
    'Presented to President.',
  ])('maps "%s" → Passed', action => {
    expect(mapStatus(action)).toBe('Passed')
  })

  it.each([
    'Cloture motion failed.',
    'Defeated in Senate.',
    'Vetoed by President.',
    'Motion to proceed rejected.',
  ])('maps "%s" → Failed', action => {
    expect(mapStatus(action)).toBe('Failed')
  })

  it('maps "Referred to committee" + introduced < 6 months ago → Committee', () => {
    const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('Referred to the Committee on Finance.', threeMonthsAgo)).toBe('Committee')
  })

  it('maps "Referred to committee" + introduced > 6 months ago → Stalled', () => {
    const sevenMonthsAgo = new Date(Date.now() - 210 * 24 * 60 * 60 * 1000).toISOString()
    expect(mapStatus('Referred to the Committee on Finance.', sevenMonthsAgo)).toBe('Stalled')
  })

  it('maps "committee" keyword without introduced date → Committee (no stale check)', () => {
    expect(mapStatus('Read twice and referred to the Committee on Finance.')).toBe('Committee')
  })

  it('maps unknown action text → Active', () => {
    expect(mapStatus('Introduced in House.')).toBe('Active')
  })

  it('handles undefined/null action text → Active', () => {
    expect(mapStatus(undefined)).toBe('Active')
    expect(mapStatus('')).toBe('Active')
  })

  it('Passed takes precedence over Failed keywords', () => {
    // Edge case: action mentions both "passed" and "failed" substrings
    expect(mapStatus('Passed the Senate; failed cloture in House.')).toBe('Passed')
  })

  it('does not false-positive on substring match for "passed the senate"', () => {
    // "passed the senate" appears but not at the start — should not be Passed
    expect(mapStatus('Referred to committee after it passed the senate health subcommittee')).not.toBe('Passed')
  })

  it('handles boundary: exactly 6 months (> 6 = Stalled)', () => {
    // 6 months ≈ 180 days. At exactly 6 months monthsAgo ≈ 6, which is NOT > 6.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-13'))
    // Introduced exactly 180 days ago → monthsAgo = 6.0 exactly → NOT > 6 → Committee
    const sixMonthsAgo = new Date('2025-10-15').toISOString()
    expect(mapStatus('Referred to committee.', sixMonthsAgo)).toBe('Committee')

    // 181+ days → Stalled
    const sixMonthsAndABit = new Date('2025-10-10').toISOString()
    expect(mapStatus('Referred to committee.', sixMonthsAndABit)).toBe('Stalled')
    vi.useRealTimers()
  })
})

describe('formatBillId', () => {
  it.each([
    ['119-s-1247',       'S. 1247'],
    ['119-hr-4521',      'H.R. 4521'],
    ['119-sjres-12',     'S.J.Res. 12'],
    ['119-hjres-99',     'H.J.Res. 99'],
    ['119-sres-100',     'S.Res. 100'],
    ['119-hres-200',     'H.Res. 200'],
    ['119-sconres-10',   'S.Con.Res. 10'],
    ['119-hconres-5',    'H.Con.Res. 5'],
  ])('formats "%s" → "%s"', (input, expected) => {
    expect(formatBillId(input)).toBe(expected)
  })

  it('falls back to uppercased type when unknown', () => {
    expect(formatBillId('119-xyz-42')).toBe('XYZ 42')
  })

  it('returns input as-is for malformed IDs (fewer than 3 parts)', () => {
    expect(formatBillId('119')).toBe('119')
    expect(formatBillId('119-hr')).toBe('119-hr')
  })
})
