import { describe, it, expect } from 'vitest'
import { getIdeologyLabel } from './ideology'

describe('getIdeologyLabel', () => {
  it('returns null for null/undefined', () => {
    expect(getIdeologyLabel(null)).toBeNull()
    // @ts-expect-error - testing runtime behavior
    expect(getIdeologyLabel(undefined)).toBeNull()
  })

  it('maps each threshold tier correctly', () => {
    expect(getIdeologyLabel(-0.8)).toBe('Very Liberal')
    expect(getIdeologyLabel(-0.5)).toBe('Liberal')
    expect(getIdeologyLabel(-0.2)).toBe('Moderate Liberal')
    expect(getIdeologyLabel(0)).toBe('Moderate')
    expect(getIdeologyLabel(0.2)).toBe('Moderate Conservative')
    expect(getIdeologyLabel(0.5)).toBe('Conservative')
    expect(getIdeologyLabel(0.8)).toBe('Very Conservative')
  })

  it('handles exact boundary values (inclusive <=)', () => {
    expect(getIdeologyLabel(-0.6)).toBe('Very Liberal')
    expect(getIdeologyLabel(-0.35)).toBe('Liberal')
    expect(getIdeologyLabel(-0.1)).toBe('Moderate Liberal')
    expect(getIdeologyLabel(0.1)).toBe('Moderate')
    expect(getIdeologyLabel(0.35)).toBe('Moderate Conservative')
    expect(getIdeologyLabel(0.6)).toBe('Conservative')
  })

  it('handles values just beyond boundaries', () => {
    expect(getIdeologyLabel(-0.59)).toBe('Liberal')
    expect(getIdeologyLabel(0.61)).toBe('Very Conservative')
  })

  it('handles extreme scores', () => {
    expect(getIdeologyLabel(-1.5)).toBe('Very Liberal')
    expect(getIdeologyLabel(1.5)).toBe('Very Conservative')
  })
})
