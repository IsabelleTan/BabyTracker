import { describe, it, expect } from 'vitest'
import { toDateTimeLocal, fromDateTimeLocal } from '@/lib/events'

describe('toDateTimeLocal', () => {
  it('formats a UTC date to a local datetime-local string', () => {
    // Use a fixed UTC date: 2024-01-15T10:30:00Z
    const date = new Date('2024-01-15T10:30:00Z')
    const result = toDateTimeLocal(date)
    // Should be 16 chars (YYYY-MM-DDTHH:mm) and parseable
    expect(result).toHaveLength(16)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('round-trips through fromDateTimeLocal within a minute', () => {
    const original = new Date('2024-06-20T08:00:00Z')
    const localStr = toDateTimeLocal(original)
    const backToUtc = new Date(fromDateTimeLocal(localStr))
    // Difference should be less than 60 seconds (we lose seconds in datetime-local)
    expect(Math.abs(backToUtc.getTime() - original.getTime())).toBeLessThan(60_000)
  })
})

describe('fromDateTimeLocal', () => {
  it('converts a datetime-local string to a UTC ISO string', () => {
    const result = fromDateTimeLocal('2024-01-15T10:30')
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/)
  })
})
