import { describe, it, expect } from 'vitest'
import { queryKeys } from './query-keys'

describe('queryKeys', () => {
  it('bills.list includes filters in key', () => {
    const key = queryKeys.bills.list({ statuses: ['Active'], topics: [] }, 'tax')
    expect(key).toEqual(['bills', 'list', { query: 'tax', statuses: ['Active'], topics: [] }])
  })

  it('bills.detail includes id', () => {
    expect(queryKeys.bills.detail('hr-1234')).toEqual(['bills', 'detail', 'hr-1234'])
  })

  it('donors.summary is distinct from donors.detail', () => {
    const detail = queryKeys.donors.detail('C00123')
    const summary = queryKeys.donors.summary('C00123')
    expect(detail).not.toEqual(summary)
  })

  it('dashboard.followed includes userId', () => {
    expect(queryKeys.dashboard.followed('u1')).toEqual(['dashboard', 'followed', 'u1'])
  })
})
