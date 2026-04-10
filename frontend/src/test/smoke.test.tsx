import { describe, it, expect } from 'vitest'
import { toDateTimeLocal, fromDateTimeLocal } from '@/lib/events'

describe('datetime helpers', () => {
  it('toDateTimeLocal formats a Date for datetime-local input', () => {
    // Use a fixed UTC time: 2024-01-15T14:30:00Z
    // In a UTC+0 environment the local string should be "2024-01-15T14:30"
    const date = new Date('2024-01-15T14:30:00Z')
    const result = toDateTimeLocal(date)
    // The result must be a valid datetime-local string (YYYY-MM-DDTHH:MM)
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it('fromDateTimeLocal round-trips through toDateTimeLocal', () => {
    const original = new Date('2024-06-20T09:15:00Z')
    const localStr = toDateTimeLocal(original)
    const roundTripped = new Date(fromDateTimeLocal(localStr))
    // Should match to the minute
    expect(roundTripped.getTime()).toBe(
      Math.floor(original.getTime() / 60_000) * 60_000,
    )
  })
})
