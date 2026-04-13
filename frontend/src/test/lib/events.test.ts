import { describe, it, expect, vi, afterEach } from 'vitest'
import { toDateTimeLocal, fromDateTimeLocal, currentDayStart } from '@/lib/events'

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

describe('currentDayStart — 5am parenting-day boundary', () => {
  afterEach(() => vi.useRealTimers())

  it('at 10am returns 05:00 of the same calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 10, 0, 0)) // June 20 10:00am
    const d = currentDayStart()
    expect(d.getFullYear()).toBe(2024)
    expect(d.getMonth()).toBe(5)   // June
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(5)
    expect(d.getMinutes()).toBe(0)
    expect(d.getSeconds()).toBe(0)
  })

  it('at exactly 5:00am returns 05:00 of the same calendar day', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 5, 0, 0))
    const d = currentDayStart()
    expect(d.getDate()).toBe(20)
    expect(d.getHours()).toBe(5)
  })

  it('at 4:59am belongs to the previous parenting day (returns 05:00 yesterday)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 4, 59, 0)) // June 20 4:59am — still June 19 parenting day
    const d = currentDayStart()
    expect(d.getDate()).toBe(19)   // June 19
    expect(d.getHours()).toBe(5)
  })

  it('at 3am belongs to the previous parenting day (returns 05:00 yesterday)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 5, 20, 3, 0, 0))
    const d = currentDayStart()
    expect(d.getDate()).toBe(19)
    expect(d.getHours()).toBe(5)
  })

  it('rolls back across a month boundary correctly', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2024, 6, 1, 2, 0, 0)) // July 1 2am — parenting day June 30
    const d = currentDayStart()
    expect(d.getMonth()).toBe(5)   // June
    expect(d.getDate()).toBe(30)
    expect(d.getHours()).toBe(5)
  })
})
