import { describe, it, expect } from 'vitest'
import { mapStatus, formatBillId, BILL_TYPE_LABELS } from './bills'

describe('mapStatus', () => {
  it('returns Passed for "became public law"', () => {
    expect(mapStatus('Became public law No. 118-50')).toBe('Passed')
  })

  it('returns Passed for "signed by president"', () => {
    expect(mapStatus('Signed by President.')).toBe('Passed')
  })

  it('returns Passed for "enacted"', () => {
    expect(mapStatus('Enacted into law.')).toBe('Passed')
  })

  it('returns Passed for actions starting with "passed the senate"', () => {
    expect(mapStatus('Passed the Senate with amendments.')).toBe('Passed')
  })

  it('returns Passed for actions starting with "passed the house"', () => {
    expect(mapStatus('Passed the House by voice vote.')).toBe('Passed')
  })

  it('returns Passed for "presented to president"', () => {
    expect(mapStatus('Presented to President.')).toBe('Passed')
  })

  it('returns Failed for "failed"', () => {
    expect(mapStatus('Failed of passage in Senate.')).toBe('Failed')
  })

  it('returns Failed for "defeated"', () => {
    expect(mapStatus('Motion defeated.')).toBe('Failed')
  })

  it('returns Failed for "vetoed"', () => {
    expect(mapStatus('Vetoed by President.')).toBe('Failed')
  })

  it('returns Failed for "rejected"', () => {
    expect(mapStatus('Rejected by the House.')).toBe('Failed')
  })

  it('returns Stalled for "tabled"', () => {
    expect(mapStatus('Motion tabled.')).toBe('Stalled')
  })

  it('returns Stalled for "postponed indefinitely"', () => {
    expect(mapStatus('Postponed indefinitely.')).toBe('Stalled')
  })

  it('returns Committee for recent referrals', () => {
    const recentDate = new Date()
    recentDate.setMonth(recentDate.getMonth() - 1)
    expect(mapStatus('Referred to the Committee on Finance.', recentDate.toISOString())).toBe('Committee')
  })

  it('returns Stalled for old committee referrals (>6 months)', () => {
    const oldDate = new Date()
    oldDate.setMonth(oldDate.getMonth() - 12)
    expect(mapStatus('Referred to committee', oldDate.toISOString())).toBe('Stalled')
  })

  it('returns Active when no keywords match', () => {
    expect(mapStatus('Read twice and ordered placed on calendar.')).toBe('Active')
  })

  it('returns Active with no action text', () => {
    expect(mapStatus()).toBe('Active')
    expect(mapStatus(undefined)).toBe('Active')
  })
})

describe('formatBillId', () => {
  it('formats senate bill IDs', () => {
    expect(formatBillId('119-s-1247')).toBe('S. 1247')
  })

  it('formats house bill IDs', () => {
    expect(formatBillId('119-hr-4521')).toBe('H.R. 4521')
  })

  it('formats joint resolution IDs', () => {
    expect(formatBillId('119-sjres-12')).toBe('S.J.Res. 12')
  })

  it('formats concurrent resolution IDs', () => {
    expect(formatBillId('119-hconres-10')).toBe('H.Con.Res. 10')
  })

  it('returns raw ID if less than 3 parts', () => {
    expect(formatBillId('invalid')).toBe('invalid')
    expect(formatBillId('119-hr')).toBe('119-hr')
  })
})

describe('BILL_TYPE_LABELS', () => {
  it('has labels for all standard bill types', () => {
    expect(BILL_TYPE_LABELS['s']).toBe('S.')
    expect(BILL_TYPE_LABELS['hr']).toBe('H.R.')
    expect(BILL_TYPE_LABELS['sjres']).toBe('S.J.Res.')
    expect(BILL_TYPE_LABELS['hjres']).toBe('H.J.Res.')
    expect(BILL_TYPE_LABELS['sres']).toBe('S.Res.')
    expect(BILL_TYPE_LABELS['hres']).toBe('H.Res.')
    expect(BILL_TYPE_LABELS['sconres']).toBe('S.Con.Res.')
    expect(BILL_TYPE_LABELS['hconres']).toBe('H.Con.Res.')
  })
})
